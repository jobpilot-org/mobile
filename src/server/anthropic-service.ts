import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';

import { responseSchemas, type AiAction, type AiResponse, type requestSchemas } from '@/domain/ai';
import {
  AiApiError,
  AiIncompleteError,
  AiRefusalError,
  EFFORT,
  type AiService,
} from '@/server/ai-contract';
import { PROMPTS } from '@/server/prompts';

export const ANTHROPIC_MODEL = 'claude-opus-5-5';

type MessagesClient = Pick<Anthropic, 'beta'>;

export function createAnthropicService(client: MessagesClient): AiService {
  return {
    async run<A extends AiAction>(
      action: A,
      input: z.infer<(typeof requestSchemas)[A]>,
    ): Promise<AiResponse<A>> {
      const { system, user } = PROMPTS[action](input);
      try {
        // Gestreamt: Längere Antworten (z. B. die Gesprächsvorbereitung) brauchen über eine
        // Minute – ohne laufenden Datenfluss brechen Server-Laufzeiten solche Anfragen ab
        const stream = client.beta.messages.stream({
          model: ANTHROPIC_MODEL,
          max_tokens: 16000,
          // Lehnt das Modell ab, springt serverseitig ein passendes Ersatzmodell ein
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: {
            effort: EFFORT[action],
            format: betaZodOutputFormat(responseSchemas[action]),
          },
          system,
          messages: [{ role: 'user', content: user }],
        });
        const message = await stream.finalMessage();

        if (message.stop_reason === 'refusal') throw new AiRefusalError();
        if (message.stop_reason === 'max_tokens' || !message.parsed_output) {
          throw new AiIncompleteError();
        }
        return message.parsed_output as AiResponse<A>;
      } catch (error) {
        // SDK-Fehler nicht nach außen tragen: Der Aufrufer kennt nur die provider-neutralen Fehler
        if (error instanceof Anthropic.APIError) throw new AiApiError(error.status);
        throw error;
      }
    },
  };
}
