import type { SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import {
  secureStoreStorage,
  sessionStorage,
  sessionStorageFor,
} from '@/features/auth/session-storage';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

/** Eine Supabase-Session ist ein JSON-String mit Tokens und Nutzerdaten – hier nachgebaut */
function fakeSession(padding: number): string {
  return JSON.stringify({ access_token: 'a'.repeat(padding), refresh_token: 'r'.repeat(64) });
}

/** Größe der abgelegten Blöcke eines Schlüssels, wie sie in SecureStore liegen */
async function storedChunks(key: string): Promise<string[]> {
  const count = Number(await SecureStore.getItemAsync(`${key}.chunks`));
  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      return (await SecureStore.getItemAsync(`${key}.${index}`)) ?? '';
    }),
  );
}

describe('secureStoreStorage', () => {
  it('gibt für unbekannte Schlüssel nichts zurück', async () => {
    await expect(secureStoreStorage.getItem('sb-unbekannt-auth-token')).resolves.toBeNull();
  });

  it('setzt große Sessions aus Blöcken wieder zusammen', async () => {
    const key = 'sb-gross-auth-token';
    const session = fakeSession(9000);

    await secureStoreStorage.setItem(key, session);

    await expect(secureStoreStorage.getItem(key)).resolves.toBe(session);
    const chunks = await storedChunks(key);
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(2000);
  });

  it('entfernt Blöcke eines längeren früheren Werts beim Überschreiben', async () => {
    const key = 'sb-ueberschreiben-auth-token';
    await secureStoreStorage.setItem(key, fakeSession(9000));
    const session = fakeSession(10);

    await secureStoreStorage.setItem(key, session);

    await expect(secureStoreStorage.getItem(key)).resolves.toBe(session);
    await expect(SecureStore.getItemAsync(`${key}.1`)).resolves.toBeNull();
  });

  it('löscht Wert und Blockschlüssel', async () => {
    const key = 'sb-loeschen-auth-token';
    await secureStoreStorage.setItem(key, fakeSession(9000));

    await secureStoreStorage.removeItem(key);

    await expect(secureStoreStorage.getItem(key)).resolves.toBeNull();
    await expect(SecureStore.getItemAsync(`${key}.0`)).resolves.toBeNull();
    await expect(SecureStore.getItemAsync(`${key}.chunks`)).resolves.toBeNull();
  });

  it('unterscheidet einen gespeicherten leeren Wert von nichts', async () => {
    const key = 'sb-leer-auth-token';
    await secureStoreStorage.setItem(key, '');

    await expect(secureStoreStorage.getItem(key)).resolves.toBe('');
  });
});

describe('sessionStorage', () => {
  it('nutzt unter iOS und Android SecureStore', () => {
    expect(sessionStorage).toBe(secureStoreStorage);
  });

  it('lässt im Web den Standard von supabase-js (localStorage) stehen', () => {
    const webStorage: SupportedStorage | undefined = sessionStorageFor('web');

    expect(webStorage).toBeUndefined();
  });
});
