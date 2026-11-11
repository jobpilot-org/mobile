jest.mock('@/features/auth/session-storage', () => ({
  sessionStorage: undefined,
}));

const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalPublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/** Das Modul frisch laden, damit die EXPO_PUBLIC-Variablen der Umgebung gelesen werden */
function loadSupabaseModule(): typeof import('@/features/auth/supabase') {
  let loaded: typeof import('@/features/auth/supabase') | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Neuladen im Test, um die Umgebung erneut zu lesen
    loaded = require('@/features/auth/supabase');
  });
  if (!loaded) throw new Error('Modul nicht geladen');
  return loaded;
}

afterEach(() => {
  restoreEnv('EXPO_PUBLIC_SUPABASE_URL', originalUrl);
  restoreEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', originalPublishableKey);
});

describe('supabase', () => {
  it('liest Projekt-URL und Key aus den EXPO_PUBLIC-Variablen', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://testprojekt.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

    const { supabaseUrl, supabasePublishableKey } = loadSupabaseModule();

    expect(supabaseUrl).toBe('https://testprojekt.supabase.co');
    expect(supabasePublishableKey).toBe('test-publishable-key');
  });

  it('baut einen Client und verwendet ihn wieder', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://testprojekt.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

    const { getSupabaseClient } = loadSupabaseModule();
    const client = getSupabaseClient();

    expect(client).toBeDefined();
    expect(getSupabaseClient()).toBe(client);
  });

  it('meldet fehlende Konfiguration mit den Variablennamen', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const { getSupabaseClient } = loadSupabaseModule();

    expect(() => getSupabaseClient()).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });
});
