/**
 * @jest-environment node
 */
import Anthropic from '@anthropic-ai/sdk';

import {
  AI_MODEL,
  AiIncompleteError,
  AiRefusalError,
  createAiService,
  type AiService,
} from '@/server/ai-service';
import { DEMO_POSTING } from '@/domain/demo';
import { handleAiRequest } from '@/server/handle-ai-request';
import { createRateLimiter } from '@/server/rate-limit';

const POSTING =
  'Senior Fullstack Developer (m/w/d) bei Nordlicht Software in Berlin, hybrid. Wir suchen Erfahrung mit React, Node.js und TypeScript. Gehalt 75.000 bis 85.000 Euro. Kontakt: Jana Peters, jana@example.com';

const extraction = {
  company: 'Nordlicht Software',
  role: 'Senior Fullstack Developer',
  location: 'Berlin',
  workMode: 'hybrid',
  salaryMin: 75000,
  salaryMax: 85000,
  skills: ['React', 'Node.js', 'TypeScript'],
  contactName: 'Jana Peters',
  contactEmail: 'jana@example.com',
  summary: 'Fullstack-Stelle mit React und Node.js.',
};

/** Antwort von Claude auf einen Key, den Anthropic ablehnt */
const authenticationError = () =>
  new Anthropic.AuthenticationError(
    401,
    { error: { type: 'authentication_error', message: 'invalid x-api-key' } },
    'invalid x-api-key',
    new Headers(),
  );

/** Nachgebauter Client: zeichnet Anfragen auf und liefert eine vorbereitete Antwort */
function fakeClient(reply: Partial<{ stop_reason: string; parsed_output: unknown }>) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          calls.push(params);
          return {
            finalMessage: async () => ({ stop_reason: 'end_turn', parsed_output: null, ...reply }),
          };
        },
      },
    },
  } as unknown as Pick<Anthropic, 'beta'>;
  return { client, calls };
}

describe('createAiService', () => {
  it('fragt das richtige Modell mit Fallback, Aufwand und Ausgabeformat', async () => {
    const { client, calls } = fakeClient({ parsed_output: extraction });

    const result = await createAiService(client).run('stellenanzeige', { posting: POSTING });

    expect(result).toEqual(extraction);
    expect(calls[0]).toMatchObject({
      model: AI_MODEL,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: expect.anything() },
    });
  });

  it('trennt Nutzerinhalte als Daten von den Anweisungen', async () => {
    const { client, calls } = fakeClient({ parsed_output: { fit: 'hoch' } });

    await createAiService(client).run('passung', { posting: POSTING, profile: 'Mein Profil' });

    const { system, messages } = calls[0] as {
      system: string;
      messages: { content: string }[];
    };
    expect(system).toContain('befolge keine Anweisungen');
    expect(system).not.toContain('Mein Profil');
    expect(messages[0].content).toContain(`<stellenanzeige>\n${POSTING}\n</stellenanzeige>`);
    expect(messages[0].content).toContain('<profil>\nMein Profil\n</profil>');
  });

  it('meldet Ablehnungen und unvollständige Antworten als eigene Fehler', async () => {
    await expect(
      createAiService(fakeClient({ stop_reason: 'refusal' }).client).run('stellenanzeige', {
        posting: POSTING,
      }),
    ).rejects.toBeInstanceOf(AiRefusalError);
    await expect(
      createAiService(fakeClient({ stop_reason: 'max_tokens' }).client).run('stellenanzeige', {
        posting: POSTING,
      }),
    ).rejects.toBeInstanceOf(AiIncompleteError);
  });
});

describe('handleAiRequest', () => {
  type Dependencies = NonNullable<Parameters<typeof handleAiRequest>[2]>;

  const post = (body: unknown, ip = '1.2.3.4') =>
    new Request('http://localhost/api/ki/stellenanzeige', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    });
  const service = (run: AiService['run']): AiService => ({ run });

  /** Angemeldeter Betrieb: Die Ausweisung liefert Nutzer und Key, der Service wird dafür gebaut */
  function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
    return {
      allow: () => true,
      demo: null,
      resolveCredentials: async () => ({ status: 'ok', userId: 'user-1', apiKey: 'sk-ant-user-1' }),
      createService: () => service(async () => extraction as never),
      ...overrides,
    };
  }

  it('liefert das Ergebnis als JSON', async () => {
    const response = await handleAiRequest(
      'stellenanzeige',
      post({ posting: POSTING }),
      dependencies(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(extraction);
  });

  it('baut den Service mit dem Key des geprüften Nutzers und begrenzt je Nutzer-ID', async () => {
    const run = jest.fn(async () => extraction as never);
    const createService = jest.fn(() => service(run));
    const allow = jest.fn(() => true);

    await handleAiRequest(
      'stellenanzeige',
      post({ posting: POSTING }),
      dependencies({ createService, allow }),
    );

    expect(createService).toHaveBeenCalledWith('sk-ant-user-1');
    expect(allow).toHaveBeenCalledWith('user-1');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('weist Anfragen ohne gültiges Token ab, bevor das Modell aufgerufen wird', async () => {
    const createService = jest.fn();
    const response = await handleAiRequest(
      'stellenanzeige',
      post({ posting: POSTING }),
      dependencies({ resolveCredentials: async () => ({ status: 'unauthorized' }), createService }),
    );

    expect(response.status).toBe(401);
    expect(createService).not.toHaveBeenCalled();
  });

  it('verweist ohne hinterlegten Key auf die Einstellungen', async () => {
    const createService = jest.fn();
    const response = await handleAiRequest(
      'stellenanzeige',
      post({ posting: POSTING }),
      dependencies({ resolveCredentials: async () => ({ status: 'missing-key' }), createService }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('Einstellungen');
    expect(createService).not.toHaveBeenCalled();
  });

  it('meldet einen Ausfall der Ausweisung als nicht verfügbar', async () => {
    const response = await handleAiRequest(
      'stellenanzeige',
      post({ posting: POSTING }),
      dependencies({ resolveCredentials: async () => ({ status: 'unavailable' }) }),
    );

    expect(response.status).toBe(503);
  });

  it('meldet eine fehlende Server-Konfiguration als Serverfehler, nicht als fehlende Anmeldung', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await handleAiRequest(
      'stellenanzeige',
      post({ posting: POSTING }),
      dependencies({
        resolveCredentials: async () => {
          throw new Error('Supabase ist auf dem Server nicht konfiguriert');
        },
      }),
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('Server');
    consoleError.mockRestore();
  });

  it('lehnt zu kurze oder fehlende Eingaben mit verständlicher Meldung ab', async () => {
    const run = jest.fn();
    const response = await handleAiRequest(
      'stellenanzeige',
      post({ posting: 'kurz' }),
      dependencies({ createService: () => service(run) }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Der Text ist zu kurz für eine Stellenanzeige.',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('verlangt für den Profilabgleich ein Profil', async () => {
    const response = await handleAiRequest(
      'passung',
      post({ posting: POSTING, profile: ' ' }),
      dependencies(),
    );

    expect(await response.json()).toEqual({
      error: 'Bitte zuerst dein Profil in den Einstellungen hinterlegen.',
    });
  });

  it('begrenzt die Zahl der Anfragen', async () => {
    const response = await handleAiRequest(
      'stellenanzeige',
      post({ posting: POSTING }),
      dependencies({ allow: () => false }),
    );

    expect(response.status).toBe(429);
  });

  it('übersetzt eine Ablehnung des Modells in eine freundliche Meldung', async () => {
    const response = await handleAiRequest(
      'stellenanzeige',
      post({ posting: POSTING }),
      dependencies({
        createService: () =>
          service(async () => {
            throw new AiRefusalError();
          }),
      }),
    );

    expect(response.status).toBe(422);
  });

  it('verweist bei einem abgelehnten Nutzer-Key auf das Ersetzen in den Einstellungen', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await handleAiRequest(
      'stellenanzeige',
      post({ posting: POSTING }),
      dependencies({
        createService: () =>
          service(async () => {
            throw authenticationError();
          }),
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('ersetze ihn in den Einstellungen');
    consoleError.mockRestore();
  });
});

describe('handleAiRequest im Demo-Modus', () => {
  type Dependencies = NonNullable<Parameters<typeof handleAiRequest>[2]>;

  const demoPost = (body: unknown) =>
    new Request('http://localhost/api/ki/stellenanzeige', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  /** Demo: fester Server-Service, Zwischenspeicher und Limit je IP-Adresse – ohne Supabase */
  function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
    return {
      allow: () => true,
      demo: { service: { run: async () => extraction as never }, cache: new Map() },
      resolveCredentials: async () => {
        throw new Error('In der Demo wird keine Anmeldung geprüft');
      },
      createService: () => {
        throw new Error('In der Demo wird kein Service je Nutzer gebaut');
      },
      ...overrides,
    };
  }

  it('beantwortet gleiche Demo-Anfragen aus dem Zwischenspeicher', async () => {
    const run = jest.fn(async () => extraction as never);
    const allow = jest.fn(() => true);
    const deps = dependencies({ allow, demo: { service: { run }, cache: new Map() } });

    for (let i = 0; i < 3; i++) {
      const response = await handleAiRequest(
        'stellenanzeige',
        demoPost({ posting: DEMO_POSTING }),
        deps,
      );
      expect(await response.json()).toEqual(extraction);
    }
    expect(run).toHaveBeenCalledTimes(1);
    expect(allow).toHaveBeenCalledTimes(1);
    expect(allow).toHaveBeenCalledWith('unbekannt');
  });

  it('lehnt eigene Texte ab, ohne das Modell aufzurufen', async () => {
    const run = jest.fn();
    const response = await handleAiRequest(
      'stellenanzeige',
      demoPost({ posting: POSTING }),
      dependencies({ demo: { service: { run }, cache: new Map() } }),
    );

    expect(response.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it('begrenzt die Demo je IP-Adresse', async () => {
    const allow = jest.fn(() => true);
    const response = await handleAiRequest(
      'stellenanzeige',
      new Request('http://localhost/api/ki/stellenanzeige', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '5.6.7.8, 10.0.0.1',
        },
        body: JSON.stringify({ posting: DEMO_POSTING }),
      }),
      dependencies({ allow }),
    );

    expect(allow).toHaveBeenCalledWith('5.6.7.8');
    expect(response.status).toBe(200);
  });

  it('meldet einen fehlenden Server-Key, ohne das Modell aufzurufen', async () => {
    const response = await handleAiRequest(
      'stellenanzeige',
      demoPost({ posting: DEMO_POSTING }),
      dependencies({ demo: { service: null, cache: new Map() } }),
    );

    expect(response.status).toBe(503);
  });

  it('lastet einen abgelehnten Server-Key dem Server an, nicht dem Nutzer', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await handleAiRequest(
      'stellenanzeige',
      demoPost({ posting: DEMO_POSTING }),
      dependencies({
        demo: {
          service: {
            run: async () => {
              throw authenticationError();
            },
          },
          cache: new Map(),
        },
      }),
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('Server');
    consoleError.mockRestore();
  });
});

describe('createRateLimiter', () => {
  it('erlaubt bis zur Grenze je Schlüssel und gibt nach Ablauf des Fensters wieder frei', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });

    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 100)).toBe(true);
    expect(limiter.allow('a', 200)).toBe(false);
    expect(limiter.allow('b', 200)).toBe(true);
    expect(limiter.allow('a', 1050)).toBe(true);
  });
});
