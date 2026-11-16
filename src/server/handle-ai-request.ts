import Anthropic from '@anthropic-ai/sdk';

import { requestSchemas, type AiAction } from '@/domain/ai';
import { isDemoRequest } from '@/domain/demo';
import {
  resolveAiCredentials,
  type CredentialResolution,
  type CredentialResolver,
} from '@/server/ai-credentials';
import {
  AiIncompleteError,
  AiRefusalError,
  createAiService,
  type AiService,
} from '@/server/ai-service';
import { createRateLimiter } from '@/server/rate-limit';

const HOUR = 60 * 60 * 1000;
/** Öffentliche Web-Demo: nur Demo-Inhalte, engeres Limit, Antworten aus dem Zwischenspeicher */
const DEMO = process.env.JOBPILOT_DEMO === '1';
const limiter = createRateLimiter({ limit: DEMO ? 10 : 30, windowMs: HOUR });
const demoCache = new Map<string, unknown>();

type Dependencies = {
  allow: (key: string) => boolean;
  /**
   * Demo-Modus: fester Service mit dem Server-Key (null, wenn keiner eingerichtet ist) und der
   * Zwischenspeicher für gleiche Anfragen. `null` heißt angemeldeter Betrieb.
   */
  demo: { service: AiService | null; cache: Map<string, unknown> } | null;
  /** Angemeldeter Betrieb: prüft das Bearer-Token und liefert den Key des Nutzers */
  resolveCredentials: CredentialResolver;
  /** Baut den Anthropic-Service für einen aufgelösten Key */
  createService: (apiKey: string) => AiService;
};

let demoService: AiService | null | undefined;

function defaultDependencies(): Dependencies {
  if (DEMO && demoService === undefined) {
    // Client erst bei Bedarf anlegen – ohne Key soll der Server trotzdem starten
    demoService = process.env.ANTHROPIC_API_KEY ? createAiService(new Anthropic()) : null;
  }
  return {
    allow: limiter.allow,
    demo: DEMO ? { service: demoService ?? null, cache: demoCache } : null,
    resolveCredentials: resolveAiCredentials,
    // Jede Anfrage bekommt einen eigenen Client: kein Key wird zwischen Nutzern geteilt
    createService: (apiKey) => createAiService(new Anthropic({ apiKey })),
  };
}

const errorResponse = (status: number, error: string) => Response.json({ error }, { status });

type Caller = {
  service: AiService;
  /** Limit-Schlüssel: Nutzer-ID im angemeldeten Betrieb, IP-Adresse in der Demo */
  rateLimitKey: string;
};

/** In der Demo gibt es keine Anmeldung – dort begrenzt die IP-Adresse */
function clientAddress(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unbekannt';
}

/** Weist den Aufrufer aus: Demo ohne Anmeldung, sonst nur mit gültigem Token und eigenem Key */
async function identifyCaller(
  request: Request,
  deps: Dependencies,
): Promise<Caller | { error: Response }> {
  if (!deps.demo) {
    let resolved: CredentialResolution;
    try {
      resolved = await deps.resolveCredentials(request);
    } catch (error) {
      // Fehlende Server-Konfiguration oder ein Ausfall bei der Prüfung: nicht dem Nutzer anlasten
      console.error('KI-Anfrage: Anmeldung konnte nicht geprüft werden:', error);
      return {
        error: errorResponse(
          503,
          'Der KI-Assistent ist auf diesem Server nicht richtig eingerichtet.',
        ),
      };
    }

    switch (resolved.status) {
      case 'unauthorized':
        return {
          error: errorResponse(401, 'Bitte melde dich an, um den KI-Assistenten zu nutzen.'),
        };
      case 'missing-key':
        return {
          error: errorResponse(
            409,
            'Für den KI-Assistenten fehlt noch dein eigener Anthropic-API-Key. Bitte hinterlege ihn in den Einstellungen.',
          ),
        };
      case 'unavailable':
        return {
          error: errorResponse(
            503,
            'Der KI-Assistent ist gerade nicht verfügbar. Bitte versuche es später erneut.',
          ),
        };
      case 'ok':
        return { service: deps.createService(resolved.apiKey), rateLimitKey: resolved.userId };
    }
  }

  if (!deps.demo.service) {
    return {
      error: errorResponse(503, 'Der KI-Assistent ist auf diesem Server nicht eingerichtet.'),
    };
  }
  return { service: deps.demo.service, rateLimitKey: clientAddress(request) };
}

/** Gemeinsamer Ablauf aller KI-Routen: Ausweisung, Limit, Prüfung der Eingabe, Aufruf, Fehler */
export async function handleAiRequest(
  action: AiAction,
  request: Request,
  deps: Dependencies = defaultDependencies(),
) {
  const caller = await identifyCaller(request, deps);
  if ('error' in caller) return caller.error;

  const body = await request.json().catch(() => null);
  const parsed = requestSchemas[action].safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues[0]?.message ?? 'Ungültige Anfrage.');
  }

  const cacheKey = `${action}:${JSON.stringify(parsed.data)}`;
  if (deps.demo) {
    if (!isDemoRequest(action, parsed.data as never)) {
      return errorResponse(
        403,
        'In der Demo funktioniert der Assistent nur mit der Beispiel-Anzeige. In der App kannst du eigene Texte verwenden.',
      );
    }
    // Gleiche Demo-Anfrage schon beantwortet: kostenlos und sofort
    if (deps.demo.cache.has(cacheKey)) return Response.json(deps.demo.cache.get(cacheKey));
  }

  // Nur echte Aufrufe zählen gegen das Limit
  if (!deps.allow(caller.rateLimitKey)) {
    return errorResponse(429, 'Zu viele Anfragen in kurzer Zeit. Bitte versuche es später erneut.');
  }

  try {
    // Der Typ hängt an `action`; die Prüfung oben garantiert die passende Form
    const result = await caller.service.run(action, parsed.data as never);
    deps.demo?.cache.set(cacheKey, result);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AiRefusalError) {
      return errorResponse(422, 'Dazu kann der Assistent leider nichts beitragen.');
    }
    if (error instanceof AiIncompleteError) {
      return errorResponse(502, 'Die Antwort war unvollständig. Bitte versuche es noch einmal.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse(429, 'Der KI-Dienst ist gerade ausgelastet. Bitte gleich noch einmal.');
    }
    if (error instanceof Anthropic.AuthenticationError) {
      // In der Demo ist der Server-Key das Problem, sonst der Key des Nutzers
      if (deps.demo) {
        console.error('Claude API: API-Key des Servers wird abgelehnt');
        return errorResponse(
          503,
          'Der KI-Assistent ist auf diesem Server nicht richtig eingerichtet.',
        );
      }
      console.error('Claude API: hinterlegter API-Key des Nutzers wird abgelehnt');
      return errorResponse(
        400,
        'Dein Anthropic-API-Key wurde abgelehnt. Bitte ersetze ihn in den Einstellungen.',
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Claude API-Fehler ${error.status}:`, error.message);
      return errorResponse(502, 'Der KI-Dienst hat einen Fehler gemeldet. Bitte später erneut.');
    }
    console.error('KI-Anfrage fehlgeschlagen:', error);
    return errorResponse(500, 'Das hat leider nicht geklappt.');
  }
}
