import type { SupabaseClient } from '@supabase/supabase-js';

import {
  apiKeyInputError,
  ApiKeyStoreError,
  deleteApiKey,
  loadApiKeyStatus,
  NO_API_KEY,
  saveApiKey,
} from '@/features/ai/api-key-store';

// Der Client kommt in jedem Test von außen; die Standard-Auflösung braucht kein Supabase
jest.mock('@/features/auth/supabase', () => ({
  getSupabaseClient: () => {
    throw new Error('Im Test wird der Client übergeben');
  },
}));

const UPDATED_AT = '2025-11-12T09:30:00.000Z';

/** Nachgebauter Client für `from('ai_api_keys').select(...).maybeSingle()` */
function fakeReadClient(result: {
  data?: { updated_at: string } | null;
  error?: { message: string } | null;
}) {
  const maybeSingle = jest.fn(async () => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));
  const select = jest.fn(() => ({ maybeSingle }));
  const from = jest.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select };
}

/** Nachgebauter Client für RPC-Aufrufe */
function fakeRpcClient(result: { data?: unknown; error?: { message: string } | null } = {}) {
  const rpc = jest.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('apiKeyInputError', () => {
  it('akzeptiert eine Eingabe, auch mit Leerraum am Rand', () => {
    expect(apiKeyInputError('sk-ant-api03-ABCdef123_-xyz')).toBeNull();
    expect(apiKeyInputError('  sk-ant-api03-ABCdef123_-xyz\n')).toBeNull();
    // Kein festes Präfix erzwingen: Key-Formate können sich ändern
    expect(apiKeyInputError('sk-live-2027-format')).toBeNull();
  });

  it('verlangt eine Eingabe', () => {
    expect(apiKeyInputError('')).toMatch('Bitte gib deinen Anthropic-API-Key ein.');
    expect(apiKeyInputError('   ')).toMatch('Bitte gib deinen Anthropic-API-Key ein.');
  });

  it('weist Leerraum mitten in der Eingabe ab', () => {
    expect(apiKeyInputError('sk-ant-api03-mit leerzeichen')).toMatch('keine Leerzeichen');
  });
});

describe('loadApiKeyStatus', () => {
  it('liest nur die eigene Metadatenzeile', async () => {
    const { client, from, select } = fakeReadClient({ data: { updated_at: UPDATED_AT } });

    await expect(loadApiKeyStatus(client)).resolves.toEqual({
      configured: true,
      updatedAt: UPDATED_AT,
    });
    expect(from).toHaveBeenCalledWith('ai_api_keys');
    expect(select).toHaveBeenCalledWith('updated_at');
  });

  it('meldet einen Nutzer ohne Key', async () => {
    const { client } = fakeReadClient({ data: null });

    await expect(loadApiKeyStatus(client)).resolves.toEqual(NO_API_KEY);
  });

  it('übersetzt einen Fehler von Supabase in einen anzeigbaren Text', async () => {
    const { client } = fakeReadClient({ error: { message: 'JWT expired' } });

    await expect(loadApiKeyStatus(client)).rejects.toThrow(ApiKeyStoreError);
    await expect(loadApiKeyStatus(client)).rejects.toThrow('konnte nicht geladen werden');
  });
});

describe('saveApiKey', () => {
  it('speichert den getrimmten Key über die RPC und liefert die Metadaten', async () => {
    const { client, rpc } = fakeRpcClient({
      data: [{ user_id: 'user-1', created_at: UPDATED_AT, updated_at: UPDATED_AT }],
    });

    await expect(saveApiKey('  sk-ant-api03-ABCdef123_-xyz ', client)).resolves.toEqual({
      configured: true,
      updatedAt: UPDATED_AT,
    });
    expect(rpc).toHaveBeenCalledWith('save_ai_api_key', {
      api_key: 'sk-ant-api03-ABCdef123_-xyz',
    });
  });

  it('spricht die RPC nicht an, wenn die Eingabe unbrauchbar ist', async () => {
    const { client, rpc } = fakeRpcClient();

    await expect(saveApiKey('   ', client)).rejects.toThrow(ApiKeyStoreError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler der RPC als anzeigbaren Text', async () => {
    const { client } = fakeRpcClient({ error: { message: 'permission denied' } });

    await expect(saveApiKey('sk-ant-api03-ABCdef123_-xyz', client)).rejects.toThrow(
      'Der API-Key konnte nicht gespeichert werden.',
    );
  });
});

describe('deleteApiKey', () => {
  it('löscht die eigenen Credentials über die RPC', async () => {
    const { client, rpc } = fakeRpcClient();

    await deleteApiKey(client);

    expect(rpc).toHaveBeenCalledWith('delete_ai_api_key');
  });

  it('meldet einen Fehler der RPC als anzeigbaren Text', async () => {
    const { client } = fakeRpcClient({ error: { message: 'permission denied' } });

    await expect(deleteApiKey(client)).rejects.toThrow('Der API-Key konnte nicht gelöscht werden.');
  });
});
