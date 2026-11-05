# 7. Wechselbarer KI-Provider (Anthropic oder OpenAI-kompatibel)

**Status:** angenommen (Phase 5)

## Kontext

ADR 5 legt den Assistenten auf die Anthropic-API mit `claude-opus-5-5` fest. Wer den Assistenten
mit einem anderen Anbieter oder einem Gateway betreiben will, muss den Code ändern. Das ist
unpraktisch: Die Anfragen sind einfache Chat-Aufrufe mit erzwungenem Antwortschema, und der
Markt für OpenAI-kompatible Endpunkte (`/v1/chat/completions`) ist groß.

Der Grund, bisher bei Anthropic zu bleiben, war Structured Outputs: Die Prompts setzen darauf,
dass die Antwort exakt dem zod-Schema aus `src/domain/ai.ts` entspricht, weil sie direkt Formulare
füllt. Anthropic erzwingt das über `output_config.format` (im SDK `betaZodOutputFormat`).
Anthropic-kompatible Dritt-Endpunkte übernehmen diese Erweiterung aber nicht zwingend und können
den Parameter stillschweigend ignorieren – die Antwort käme dann als freier Text zurück.
OpenAI-kompatible Dienste haben für dieselbe Aufgabe ein eigenständiges Feature:
`response_format` mit `json_schema` (im SDK `zodResponseFormat`), ebenfalls mit den gemeinsamen
zod-Schemas.

## Entscheidung

- **Zwei Provider hinter einem gemeinsamen Vertrag** (`src/server/ai-contract.ts`): `AiService`
  mit einer `run`-Methode je Aktion, dazu die provider-neutralen Fehler `AiRefusalError`,
  `AiIncompleteError` und `AiApiError` (nur mit HTTP-Status) sowie der Aufwand je Aufgabe
  (`EFFORT`). Beide Provider liegen spiegelbildlich nebeneinander:
  `createAnthropicService`/`ANTHROPIC_MODEL` und `createOpenAiService`/`OPENAI_MODEL`.
- **Auswahl über `AI_PROVIDER`** (`src/server/ai-provider.ts`): `anthropic` ist der Standard, `openai` spricht `/v1/chat/completions`. Für OpenAI gibt es `OPENAI_MODEL` (Standard `gpt-6-astra`) und optional `OPENAI_BASE_URL` für kompatible Dienste oder Gateways. Angemeldete Nutzer verwenden entsprechend ADR 6 ihren eigenen Schlüssel aus dem Supabase Vault; `ANTHROPIC_API_KEY` und `OPENAI_API_KEY` sind nur die Server-Schlüssel der öffentlichen Demo. Unbekannter Wert oder fehlender Demo-Key: geloggt, der Service bleibt `null`, der Assistent antwortet mit 503 – App und Server starten normal (wie in ADR 5).
- **Streaming in beiden Pfaden**, damit lange Antworten nicht an Zeitlimits der Server-Laufzeit
  scheitern.
- **Fehler-Mapping nach HTTP-Status im Routen-Handler**, nicht nach SDK-Klassen: Ablehnung → 422, unvollständige oder nicht schema-konforme Antwort → 502, 429 → 429, sonstiger API-Fehler → 502. Bei 401/403 verweist der angemeldete Betrieb mit 400 auf den eigenen Key in den Einstellungen; die Demo meldet den Server-Key mit 503 als Einrichtungsfehler. So bleibt der Handler frei von SDK-Importen.
- **`reasoning_effort`** bildet denselben Aufwand ab wie bei Anthropic (`low` für die Extraktion,
  `medium` für Abgleich, Vorbereitung und Texte). OpenAI-kompatible Endpunkte können den Parameter
  ignorieren – das ist zulässig und ändert nur die Qualität, nicht die Form der Antwort.
- Die Prompts (`src/server/prompts.ts`) und die Schemas (`src/domain/ai.ts`) bleiben unverändert
  gemeinsam genutzt; kein Provider bekommt eigene Schemas.

## Konsequenzen

- Ein Provider-Wechsel ist eine Konfigurationsfrage (`AI_PROVIDER`, Modell), keine Codeänderung; ein Rollback genügt ohne Datenbank- oder App-Vertragsänderung. Nutzer müssen nach einem Wechsel einen gültigen eigenen Key für den neuen Provider hinterlegen.
- Die Standardmodelle sind laut Herstellerdoku Streaming- und Structured-Outputs-fähig. **Gegen
  einen echten OpenAI-kompatiblen Endpunkt wurde nicht getestet:** Alle Tests arbeiten mit
  nachgebauten Clients. Den Betrieb gegen einen Live-Endpunkt – Antwortqualität, `reasoning_effort`,
  Einhaltung des Schemas – prüft und verantwortet der Betreiber manuell.
- Kleinere oder günstigere Modelle halten die Schemas erfahrungsgemäß weniger zuverlässig ein; sie
  sind eine Konfigurationsfrage, keine Garantie.
- Zwei SDKs statt einem (`@anthropic-ai/sdk`, `openai`). Beide laufen nur serverseitig, ohne
  nativen Code.
- Die Demo-Absicherung (`JOBPILOT_DEMO=1`) und das Rate-Limit gelten unabhängig vom Provider.
