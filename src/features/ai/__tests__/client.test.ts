import { AiRequestError, callAi } from '@/features/ai/client';

const draft = { subject: 'Danke für das Gespräch', body: 'Hallo …' };
const payload = { kind: 'dankeschoen' as const, company: 'Nordlicht', role: 'Dev' };
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signatur';

let mockIsDemo = false;
const mockGetSession = jest.fn();

jest.mock('@/features/demo/mode', () => ({
  get isDemo() {
    return mockIsDemo;
  },
}));

jest.mock('@/features/auth/supabase', () => ({
  getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }),
}));

function fakeFetch(status: number, body: unknown) {
  return jest.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

function signedIn(accessToken: string | null) {
  mockGetSession.mockResolvedValue({
    data: { session: accessToken ? { access_token: accessToken } : null },
    error: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsDemo = false;
  signedIn(TOKEN);
});

describe('callAi', () => {
  it('schickt die Anfrage an die passende Route und liefert die geprüfte Antwort', async () => {
    const fetchImpl = fakeFetch(200, draft);

    await expect(callAi('entwurf', payload, fetchImpl)).resolves.toEqual(draft);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/ki/entwurf',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
    );
  });

  it('schickt das Access-Token der angemeldeten Session mit', async () => {
    const fetchImpl = fakeFetch(200, draft);

    await callAi('entwurf', payload, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/ki/entwurf',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      }),
    );
  });

  it('schickt ohne Session kein Token', async () => {
    signedIn(null);
    const fetchImpl = fakeFetch(200, draft);

    await callAi('entwurf', payload, fetchImpl);

    const [, options] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(options.headers).not.toHaveProperty('Authorization');
  });

  it('bleibt in der Demo ohne Anmeldung und ohne Token', async () => {
    mockIsDemo = true;
    const fetchImpl = fakeFetch(200, draft);

    await callAi('entwurf', payload, fetchImpl);

    expect(mockGetSession).not.toHaveBeenCalled();
    const [, options] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(options.headers).not.toHaveProperty('Authorization');
  });

  it('reicht die Fehlermeldung des Servers durch', async () => {
    await expect(
      callAi('entwurf', payload, fakeFetch(429, { error: 'Zu viele Anfragen.' })),
    ).rejects.toThrow(new AiRequestError('Zu viele Anfragen.'));
  });

  it('lehnt Antworten im falschen Format ab', async () => {
    await expect(callAi('entwurf', payload, fakeFetch(200, { text: 'x' }))).rejects.toThrow(
      'unerwartetes Format',
    );
  });

  it('meldet fehlende Verbindung verständlich', async () => {
    const offline = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(callAi('entwurf', payload, offline)).rejects.toThrow('Bist du online?');
  });
});
