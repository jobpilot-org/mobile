/**
 * @jest-environment node
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

import { createProviderFromEnv } from '@/server/ai-provider';
import { createAnthropicService } from '@/server/anthropic-service';
import { OPENAI_MODEL, createOpenAiService } from '@/server/openai-service';

// Die Service-Fabriken werden ersetzt: Geprüft wird nur, welcher Provider mit welchem Client
// entsteht. Die Clients selbst sind echt, führen aber ohne Aufruf keine Anfrage aus.
jest.mock('@/server/anthropic-service', () => ({
  ...jest.requireActual('@/server/anthropic-service'),
  createAnthropicService: jest.fn(() => ({ run: jest.fn() })),
}));
jest.mock('@/server/openai-service', () => ({
  ...jest.requireActual('@/server/openai-service'),
  createOpenAiService: jest.fn(() => ({ run: jest.fn() })),
}));

describe('createProviderFromEnv', () => {
  let logged: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    logged = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logged.mockRestore();
  });

  it('nutzt ohne AI_PROVIDER Anthropic und baut den Client aus dem Key', () => {
    const service = createProviderFromEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' });

    expect(service).not.toBeNull();
    const [[client]] = jest.mocked(createAnthropicService).mock.calls;
    expect(client).toBeInstanceOf(Anthropic);
    expect((client as unknown as Anthropic).apiKey).toBe('sk-ant-test');
    expect(createOpenAiService).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it('baut bei AI_PROVIDER=openai einen OpenAI-Client mit Key und Basis-URL', () => {
    const service = createProviderFromEnv({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-openai-test',
      OPENAI_BASE_URL: 'https://example.com/v1',
    });

    expect(service).not.toBeNull();
    const [[client, model]] = jest.mocked(createOpenAiService).mock.calls;
    expect(client).toBeInstanceOf(OpenAI);
    expect((client as unknown as OpenAI).apiKey).toBe('sk-openai-test');
    expect((client as unknown as OpenAI).baseURL).toBe('https://example.com/v1');
    expect(model).toBe(OPENAI_MODEL);
    expect(createAnthropicService).not.toHaveBeenCalled();
  });

  it('übernimmt OPENAI_MODEL als Modell und fällt sonst auf den Standard zurück', () => {
    createProviderFromEnv({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-openai-test' });
    expect(jest.mocked(createOpenAiService).mock.calls[0][1]).toBe(OPENAI_MODEL);

    createProviderFromEnv({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-openai-test',
      OPENAI_MODEL: 'eigenes-modell',
    });
    expect(jest.mocked(createOpenAiService).mock.calls[1][1]).toBe('eigenes-modell');
  });

  it('verwendet im angemeldeten Betrieb den übergebenen Key statt des Server-Keys', () => {
    createProviderFromEnv({ ANTHROPIC_API_KEY: 'sk-ant-server' }, 'sk-ant-user');
    const [[anthropicClient]] = jest.mocked(createAnthropicService).mock.calls;
    expect((anthropicClient as unknown as Anthropic).apiKey).toBe('sk-ant-user');

    createProviderFromEnv(
      { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-openai-server' },
      'sk-openai-user',
    );
    const [[openAiClient]] = jest.mocked(createOpenAiService).mock.calls;
    expect((openAiClient as unknown as OpenAI).apiKey).toBe('sk-openai-user');
  });

  it('liefert ohne Key für Anthropic keinen Service', () => {
    expect(createProviderFromEnv({})).toBeNull();
    expect(createProviderFromEnv({ AI_PROVIDER: 'anthropic' })).toBeNull();

    expect(createAnthropicService).not.toHaveBeenCalled();
    expect(createOpenAiService).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it('liefert ohne Key für OpenAI keinen Service', () => {
    expect(createProviderFromEnv({ AI_PROVIDER: 'openai' })).toBeNull();

    expect(createAnthropicService).not.toHaveBeenCalled();
    expect(createOpenAiService).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it('loggt einen unbekannten Provider und liefert keinen Service', () => {
    const service = createProviderFromEnv({
      AI_PROVIDER: 'gemini',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      OPENAI_API_KEY: 'sk-openai-test',
    });

    expect(service).toBeNull();
    expect(createAnthropicService).not.toHaveBeenCalled();
    expect(createOpenAiService).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('"gemini"'));
  });
});
