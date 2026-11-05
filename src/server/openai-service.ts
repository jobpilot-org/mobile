import OpenAI, { APIError } from 'openai';
import { LengthFinishReasonError } from 'openai/error';
import { zodResponseFormat } from 'openai/helpers/zod';
import { ZodError, type z } from 'zod';

import { responseSchemas, type AiAction, type AiResponse, type requestSchemas } from '@/domain/ai';
import {
  AiApiError,
  AiIncompleteError,
  AiRefusalError,
  EFFORT,
  type AiService,
} from '@/server/ai-contract';
import { PROMPTS } from '@/server/prompts';

/** Standard-Modell für OpenAI und kompatible Endpunkte; muss Structured Outputs unterstützen */
export const OPENAI_MODEL = 'gpt-6-astra';

type ChatClient = Pick<OpenAI, 'chat'>;

export function createOpenAiService(
  client: ChatClient,
  // Die Server-Konfiguration kann das Modell überschreiben; sonst gilt der Standard oben
  model: string = OPENAI_MODEL,
): AiService {
  return {
    async run<A extends AiAction>(
      action: A,
      input: z.infer<(typeof requestSchemas)[A]>,
    ): Promise<AiResponse<A>> {
      const { system, user } = PROMPTS[action](input);
      try {
        // Gestreamt wie beim Anthropic-Provider: Längere Antworten (z. B. die
        // Gesprächsvorbereitung) brauchen über eine Minute – ohne laufenden Datenfluss brechen
        // Server-Laufzeiten solche Anfragen ab
        const stream = client.chat.completions.stream({
          model,
          // Bei OpenAI heißt derselbe Aufwand reasoning_effort; kompatible Endpunkte können ihn ignorieren
          reasoning_effort: EFFORT[action],
          // Das Schema kommt aus den gemeinsamen Verträgen – der Dienst erzwingt die Form
          response_format: zodResponseFormat(responseSchemas[action], action),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        });
        const completion = await stream.finalChatCompletion();
        const choice = completion.choices[0];

        if (choice?.message.refusal) throw new AiRefusalError();
        if (choice?.finish_reason === 'length' || !choice?.message.parsed) {
          throw new AiIncompleteError();
        }
        return choice.message.parsed as AiResponse<A>;
      } catch (error) {
        // Das SDK wirft bei Token-Limit und bei nicht schema-konformer Antwort eigene Fehler
        if (error instanceof LengthFinishReasonError) throw new AiIncompleteError();
        if (error instanceof ZodError || error instanceof SyntaxError) {
          throw new AiIncompleteError();
        }
        // SDK-Fehler nicht nach außen tragen: Der Aufrufer kennt nur die provider-neutralen Fehler
        if (error instanceof APIError) throw new AiApiError(error.status);
        throw error;
      }
    },
  };
}
