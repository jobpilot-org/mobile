import type { SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * SecureStore mag keine großen Werte (iOS lehnte historisch alles über rund 2048 Byte ab), eine
 * Supabase-Session ist mehrere Kilobyte groß. Deshalb liegt der Wert in Blöcken; `<key>.chunks`
 * merkt sich die Anzahl. Die Tokens sind base64url, ein Block Zeichen entspricht also Bytes.
 */
const CHUNK_LENGTH = 2000;

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

function chunkCountKey(key: string): string {
  return `${key}.chunks`;
}

function splitIntoChunks(value: string): string[] {
  // Auch der leere Wert belegt einen Block, damit er sich von „nichts gespeichert“ unterscheidet
  if (value.length === 0) return [''];
  const chunks: string[] = [];
  for (let start = 0; start < value.length; start += CHUNK_LENGTH) {
    chunks.push(value.slice(start, start + CHUNK_LENGTH));
  }
  return chunks;
}

async function readChunkCount(key: string): Promise<number> {
  const count = await SecureStore.getItemAsync(chunkCountKey(key));
  return count === null ? 0 : Number(count);
}

async function readValue(key: string): Promise<string | null> {
  const count = await readChunkCount(key);
  if (count === 0) return null;
  const chunks = await Promise.all(
    Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
  );
  return chunks.some((chunk) => chunk === null) ? null : chunks.join('');
}

async function writeValue(key: string, value: string): Promise<void> {
  const previousCount = await readChunkCount(key);
  const chunks = splitIntoChunks(value);
  await Promise.all(
    chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)),
  );
  // Reste eines längeren früheren Werts entfernen
  await Promise.all(
    Array.from({ length: Math.max(previousCount - chunks.length, 0) }, (_, offset) =>
      SecureStore.deleteItemAsync(chunkKey(key, chunks.length + offset)),
    ),
  );
  await SecureStore.setItemAsync(chunkCountKey(key), String(chunks.length));
}

async function deleteValue(key: string): Promise<void> {
  const count = await readChunkCount(key);
  await Promise.all(
    Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index))),
  );
  await SecureStore.deleteItemAsync(chunkCountKey(key));
}

// Schreibvorgänge laufen nacheinander: Blöcke, Zähler und Löschen dürfen sich nicht überholen
let pendingWrite: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(operation, operation);
  pendingWrite = result.catch(() => undefined);
  return result;
}

/** SecureStore-Adapter für supabase-js – Werte werden blockweise abgelegt und wieder zusammengesetzt */
export const secureStoreStorage: SupportedStorage = {
  getItem: (key) => serialize(() => readValue(key)),
  setItem: (key, value) => serialize(() => writeValue(key, value)),
  removeItem: (key) => serialize(() => deleteValue(key)),
};

/**
 * Session-Speicher für supabase-js: unter iOS und Android SecureStore, im Web der Standard des SDK
 * (localStorage) – dort bleibt es deshalb bei `undefined`.
 */
export type SessionStoragePlatform = 'web' | 'native';

export function sessionStorageFor(platform: SessionStoragePlatform): SupportedStorage | undefined {
  return platform === 'web' ? undefined : secureStoreStorage;
}

export const sessionStorage = sessionStorageFor(Platform.OS === 'web' ? 'web' : 'native');
