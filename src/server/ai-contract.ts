import type { z } from 'zod';

import type { AiAction, AiResponse, requestSchemas } from '@/domain/ai';

// Gemeinsamer Vertrag aller KI-Provider: Fehlerformen, Aufwand je Aufgabe und die
// Schnittstelle, die jede Route erwartet. Hier steht nichts anbieterspezifisches.

/**
 * Aufwand je Aufgabe: Das Übernehmen einer Anzeige ist Extraktion (low), Abgleich,
 * Vorbereitung und Texte brauchen mehr Urteilsvermögen (medium).
 * Beide Provider bilden denselben Aufwand auf ihren eigenen Parameter ab.
 */
export const EFFORT: Record<AiAction, 'low' | 'medium'> = {
  stellenanzeige: 'low',
  passung: 'medium',
  vorbereitung: 'medium',
  entwurf: 'medium',
};

/** Das Modell hat die Anfrage aus Sicherheitsgründen abgelehnt */
export class AiRefusalError extends Error {}
/** Antwort kam nicht vollständig oder nicht im erwarteten Format an */
export class AiIncompleteError extends Error {}
/** Der KI-Dienst hat mit einem HTTP-Status geantwortet (provider-unabhängig) */
export class AiApiError extends Error {
  /** undefined, wenn der Dienst ohne HTTP-Antwort gescheitert ist (z. B. Verbindungsfehler) */
  readonly status: number | undefined;

  constructor(status: number | undefined) {
    super(`Der KI-Dienst hat mit Status ${status ?? 'ohne Status'} geantwortet.`);
    this.status = status;
  }
}

/** Was ein Provider können muss: eine Aktion ausführen und deren Antwortschema erfüllen */
export interface AiService {
  run<A extends AiAction>(
    action: A,
    input: z.infer<(typeof requestSchemas)[A]>,
  ): Promise<AiResponse<A>>;
}
