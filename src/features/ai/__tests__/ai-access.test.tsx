import { render, screen, userEvent } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import { AiAccessProvider, useAiAccess } from '@/features/ai/ai-access';
import {
  ApiKeyStoreError,
  loadApiKeyStatus,
  NO_API_KEY,
  type ApiKeyStatus,
} from '@/features/ai/api-key-store';
import { Button } from '@/ui/button';

let mockIsDemo = false;

jest.mock('@/features/demo/mode', () => ({
  get isDemo() {
    return mockIsDemo;
  },
}));

jest.mock('@/features/ai/api-key-store', () => ({
  NO_API_KEY: { configured: false, updatedAt: null },
  ApiKeyStoreError: class ApiKeyStoreError extends Error {},
  loadApiKeyStatus: jest.fn(),
}));

const mockLoadStatus = loadApiKeyStatus as jest.MockedFunction<typeof loadApiKeyStatus>;

const CONFIGURED: ApiKeyStatus = { configured: true, updatedAt: '2025-11-12T09:30:00.000Z' };

/** Zeigt den gemeinsamen Zustand und die beiden Wege, ihn von außen zu ändern */
function Probe() {
  const { state, status, retry, applyStatus } = useAiAccess();
  const key = status === null ? 'unbekannt' : status.configured ? 'Key' : 'kein Key';
  return (
    <View>
      <Text>{`KI: ${state}`}</Text>
      <Text>{`Status: ${key}`}</Text>
      <Button label="Erneut versuchen" compact onPress={retry} />
      <Button label="Key gespeichert" compact onPress={() => applyStatus(CONFIGURED)} />
      <Button label="Key gelöscht" compact onPress={() => applyStatus(NO_API_KEY)} />
    </View>
  );
}

/** Ein zweiter Leser im selben Baum, der den Zustand anders beschriftet */
function OtherScreen() {
  const { state } = useAiAccess();
  return <Text>{`Anderer Bildschirm: ${state}`}</Text>;
}

function renderAccess() {
  return render(
    <AiAccessProvider>
      <Probe />
      <OtherScreen />
    </AiAccessProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsDemo = false;
  mockLoadStatus.mockResolvedValue(NO_API_KEY);
});

describe('AiAccessProvider', () => {
  it('zeigt den Ladezustand, solange der Status gelesen wird', async () => {
    mockLoadStatus.mockReturnValue(new Promise(() => {}));

    await renderAccess();

    expect(screen.getByText('KI: loading')).toBeOnTheScreen();
    expect(screen.getByText('Status: unbekannt')).toBeOnTheScreen();
  });

  it('meldet einen hinterlegten Key als verfügbar', async () => {
    mockLoadStatus.mockResolvedValue(CONFIGURED);

    await renderAccess();

    expect(await screen.findByText('KI: configured')).toBeOnTheScreen();
    expect(screen.getByText('Status: Key')).toBeOnTheScreen();
    expect(screen.getByText('Anderer Bildschirm: configured')).toBeOnTheScreen();
  });

  it('unterscheidet einen fehlenden Key vom Laden', async () => {
    await renderAccess();

    expect(await screen.findByText('KI: missing')).toBeOnTheScreen();
    expect(screen.getByText('Status: kein Key')).toBeOnTheScreen();
  });

  it('meldet einen Ladefehler als unbekannt und lädt auf Wunsch erneut', async () => {
    mockLoadStatus
      .mockRejectedValueOnce(new ApiKeyStoreError('weg'))
      .mockResolvedValueOnce(CONFIGURED);

    await renderAccess();

    expect(await screen.findByText('KI: error')).toBeOnTheScreen();
    expect(screen.getByText('Status: unbekannt')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByText('KI: configured')).toBeOnTheScreen();
    expect(mockLoadStatus).toHaveBeenCalledTimes(2);
  });

  it('zieht bei Speichern und Löschen auf allen Bildschirmen sofort mit', async () => {
    await renderAccess();
    await screen.findByText('KI: missing');

    await userEvent.press(screen.getByRole('button', { name: 'Key gespeichert' }));

    expect(screen.getByText('KI: configured')).toBeOnTheScreen();
    expect(screen.getByText('Status: Key')).toBeOnTheScreen();
    expect(screen.getByText('Anderer Bildschirm: configured')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Key gelöscht' }));

    expect(screen.getByText('KI: missing')).toBeOnTheScreen();
    expect(screen.getByText('Status: kein Key')).toBeOnTheScreen();
    expect(screen.getByText('Anderer Bildschirm: missing')).toBeOnTheScreen();
  });

  it('fragt in der Demo keinen Key ab und meldet die KI als verfügbar', async () => {
    mockIsDemo = true;

    await renderAccess();

    expect(screen.getByText('KI: configured')).toBeOnTheScreen();
    expect(screen.getByText('Status: Key')).toBeOnTheScreen();
    expect(mockLoadStatus).not.toHaveBeenCalled();
  });
});
