/**
 * @jest-environment node
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

import { bearerToken, createCredentialResolver } from '@/server/ai-credentials';
import { createServerSupabaseClient } from '@/server/supabase';

// Der echte Client würde HTTP sprechen; der Test prüft nur, wie er gebaut wird
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ mocked: true })) }));

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signatur';

const requestWith = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/ki/stellenanzeige', { method: 'POST', headers });

/** Die Fabrik, die im Betrieb einen Client mit dem Token des Aufrufers baut */
const clientFor = (client: SupabaseClient) => () => client;

type FakeClientOptions = {
  user?: { id: string } | null;
  /** Fehler, den Supabase Auth zurückgibt – `undefined` in `status` heißt: kein HTTP-Fehler */
  userError?: { status?: number; message: string } | null;
  /** Die Prüfung bricht ohne Antwort ab (z. B. Netzwerkfehler) */
  userThrows?: boolean;
  apiKey?: string | null;
  vaultError?: { message: string } | null;
};

function fakeClient({
  user = null,
  userError = null,
  userThrows,
  apiKey,
  vaultError,
}: FakeClientOptions) {
  const getUser = jest.fn(async (_token: string) => {
    if (userThrows) throw new Error('Netzwerk weg');
    return { data: { user }, error: userError };
  });
  const rpc = jest.fn(async (_fn: string) => ({
    data: apiKey ?? null,
    error: vaultError ?? null,
  }));
  return { client: { auth: { getUser }, rpc } as unknown as SupabaseClient, getUser, rpc };
}

describe('bearerToken', () => {
  it('liest das Token aus dem Authorization-Header', () => {
    expect(bearerToken(requestWith({ authorization: `Bearer ${TOKEN}` }))).toBe(TOKEN);
    expect(bearerToken(requestWith({ authorization: `bearer ${TOKEN}` }))).toBe(TOKEN);
  });

  it('liefert null ohne passenden Header', () => {
    expect(bearerToken(requestWith())).toBeNull();
    expect(bearerToken(requestWith({ authorization: 'Basic abc' }))).toBeNull();
    expect(bearerToken(requestWith({ authorization: 'Bearer' }))).toBeNull();
  });
});

describe('createCredentialResolver', () => {
  it('prüft das Token und liefert den Key des angemeldeten Nutzers', async () => {
    const { client, getUser, rpc } = fakeClient({
      user: { id: 'user-1' },
      apiKey: 'sk-ant-user-1',
    });
    const resolve = createCredentialResolver(clientFor(client));

    const result = await resolve(requestWith({ authorization: `Bearer ${TOKEN}` }));

    expect(result).toEqual({ status: 'ok', userId: 'user-1', apiKey: 'sk-ant-user-1' });
    expect(getUser).toHaveBeenCalledWith(TOKEN);
    // Kein Nutzer-Parameter: die RPC liest den Key von `auth.uid()` des Tokens
    expect(rpc).toHaveBeenCalledWith('get_ai_api_key');
  });

  it('baut den Client mit dem Token des Aufrufers und ohne Nutzer-ID für den Vault', async () => {
    const { client } = fakeClient({ user: { id: 'user-1' }, apiKey: 'sk-ant-user-1' });
    const clientForToken = jest.fn(() => client);

    await createCredentialResolver(clientForToken)(
      requestWith({ authorization: `Bearer ${TOKEN}` }),
    );

    expect(clientForToken).toHaveBeenCalledWith(TOKEN);
    expect(clientForToken).toHaveBeenCalledTimes(1);
  });

  it('weist Anfragen ohne Token ab, ohne Supabase zu fragen', async () => {
    const { client, getUser, rpc } = fakeClient({
      user: { id: 'user-1' },
      apiKey: 'sk-ant-user-1',
    });
    const clientForToken = jest.fn(clientFor(client));

    const result = await createCredentialResolver(clientForToken)(requestWith());

    expect(result).toEqual({ status: 'unauthorized' });
    expect(clientForToken).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('weist ungültige oder abgelaufene Tokens ab, ohne den Vault zu lesen', async () => {
    const { client, rpc } = fakeClient({
      userError: { status: 401, message: 'invalid JWT' },
    });

    const result = await createCredentialResolver(clientFor(client))(
      requestWith({ authorization: `Bearer ${TOKEN}` }),
    );

    expect(result).toEqual({ status: 'unauthorized' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('meldet einen Nutzer ohne hinterlegten Key als missing-key', async () => {
    for (const apiKey of [null, '']) {
      const { client } = fakeClient({ user: { id: 'user-1' }, apiKey });

      const result = await createCredentialResolver(clientFor(client))(
        requestWith({ authorization: `Bearer ${TOKEN}` }),
      );

      expect(result).toEqual({ status: 'missing-key' });
    }
  });

  it('unterscheidet einen Ausfall der Token-Prüfung von einem ungültigen Token', async () => {
    const failing = fakeClient({
      userError: { status: 503, message: 'upstream nicht erreichbar' },
    });
    expect(
      await createCredentialResolver(clientFor(failing.client))(
        requestWith({ authorization: `Bearer ${TOKEN}` }),
      ),
    ).toEqual({
      status: 'unavailable',
    });

    const offline = fakeClient({ userThrows: true });
    expect(
      await createCredentialResolver(clientFor(offline.client))(
        requestWith({ authorization: `Bearer ${TOKEN}` }),
      ),
    ).toEqual({
      status: 'unavailable',
    });

    const withoutStatus = fakeClient({ userError: { message: 'Auth session missing!' } });
    expect(
      await createCredentialResolver(clientFor(withoutStatus.client))(
        requestWith({ authorization: `Bearer ${TOKEN}` }),
      ),
    ).toEqual({
      status: 'unavailable',
    });
  });

  it('meldet einen Fehler aus dem Vault als Ausfall und loggt keinen Key', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeClient({
      user: { id: 'user-1' },
      vaultError: { message: 'permission denied for function get_ai_api_key' },
    });

    const result = await createCredentialResolver(clientFor(client))(
      requestWith({ authorization: `Bearer ${TOKEN}` }),
    );

    expect(result).toEqual({ status: 'unavailable' });
    const logged = consoleError.mock.calls.flat().join(' ');
    expect(logged).toContain('get_ai_api_key');
    expect(logged).not.toContain('sk-ant');
    consoleError.mockRestore();
  });

  it('löst für zwei Tokens je einen eigenen Client und damit nur den eigenen Key auf', async () => {
    const users: Record<string, { id: string; apiKey: string }> = {
      'token-a': { id: 'user-a', apiKey: 'sk-ant-user-a' },
      'token-b': { id: 'user-b', apiKey: 'sk-ant-user-b' },
    };
    // Der echte Client trägt das Token im Authorization-Header; hier steht der Nutzer dafür ein
    const clientForToken = jest.fn((token: string) => {
      const user = users[token];
      return {
        auth: {
          getUser: jest.fn(async () => ({ data: { user: { id: user.id } }, error: null })),
        },
        rpc: jest.fn(async () => ({ data: user.apiKey, error: null })),
      } as unknown as SupabaseClient;
    });
    const resolve = createCredentialResolver(clientForToken);

    expect(await resolve(requestWith({ authorization: 'Bearer token-a' }))).toEqual({
      status: 'ok',
      userId: 'user-a',
      apiKey: 'sk-ant-user-a',
    });
    expect(await resolve(requestWith({ authorization: 'Bearer token-b' }))).toEqual({
      status: 'ok',
      userId: 'user-b',
      apiKey: 'sk-ant-user-b',
    });
    expect(clientForToken).toHaveBeenNthCalledWith(1, 'token-a');
    expect(clientForToken).toHaveBeenNthCalledWith(2, 'token-b');
  });
});

describe('createServerSupabaseClient', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalPublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  afterEach(() => {
    restoreEnv('EXPO_PUBLIC_SUPABASE_URL', originalUrl);
    restoreEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', originalPublishableKey);
    jest.mocked(createClient).mockClear();
  });

  it('baut den Client mit öffentlichem Key und dem Token des Aufrufers', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://testprojekt.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

    createServerSupabaseClient(TOKEN);

    expect(createClient).toHaveBeenCalledWith(
      'https://testprojekt.supabase.co',
      'test-publishable-key',
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${TOKEN}` } },
      },
    );
  });

  it('meldet fehlende Konfiguration mit den Variablennamen', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(() => createServerSupabaseClient(TOKEN)).toThrow(/EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});
