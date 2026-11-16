import { render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import { AiAccessProvider } from '@/features/ai/ai-access';
import {
  AI_KEY_MISSING_CONFIRM,
  AI_KEY_MISSING_MESSAGE,
  AI_KEY_MISSING_TITLE,
  useAiFeatureLock,
} from '@/features/ai/ai-feature-lock';
import {
  ApiKeyStoreError,
  loadApiKeyStatus,
  NO_API_KEY,
  type ApiKeyStatus,
} from '@/features/ai/api-key-store';
import { Button } from '@/ui/button';
import { confirm } from '@/ui/dialogs';

const mockPush = jest.fn();
let mockIsDemo = false;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

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

jest.mock('@/ui/dialogs', () => ({ confirm: jest.fn(), notify: jest.fn() }));

const mockLoadStatus = loadApiKeyStatus as jest.MockedFunction<typeof loadApiKeyStatus>;
const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;

const CONFIGURED: ApiKeyStatus = { configured: true, updatedAt: '2025-11-12T09:30:00.000Z' };

/** Zeigt die Sperre und was `ensureUnlocked` für eine Aktion zurückgibt */
function Probe() {
  const { locked, ensureUnlocked } = useAiFeatureLock();
  const [outcome, setOutcome] = useState('noch nicht gefragt');
  return (
    <>
      <Text>{`gesperrt: ${locked ? 'ja' : 'nein'}`}</Text>
      <Text>{`Ergebnis: ${outcome}`}</Text>
      <Button
        label="KI starten"
        onPress={async () => setOutcome((await ensureUnlocked()) ? 'frei' : 'gesperrt')}
      />
    </>
  );
}

function renderLock() {
  return render(
    <AiAccessProvider>
      <Probe />
    </AiAccessProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsDemo = false;
  mockLoadStatus.mockResolvedValue(NO_API_KEY);
  mockConfirm.mockResolvedValue(true);
});

describe('useAiFeatureLock', () => {
  it('lässt konfigurierte Nutzer ohne Rückfrage arbeiten', async () => {
    mockLoadStatus.mockResolvedValue(CONFIGURED);
    await renderLock();
    await screen.findByText('gesperrt: nein');

    await userEvent.press(screen.getByRole('button', { name: 'KI starten' }));

    expect(await screen.findByText('Ergebnis: frei')).toBeOnTheScreen();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('erklärt die Sperre und öffnet die Einstellungen erst nach Bestätigung', async () => {
    await renderLock();
    await screen.findByText('gesperrt: ja');

    await userEvent.press(screen.getByRole('button', { name: 'KI starten' }));

    expect(mockConfirm).toHaveBeenCalledWith({
      title: AI_KEY_MISSING_TITLE,
      message: AI_KEY_MISSING_MESSAGE,
      confirmLabel: AI_KEY_MISSING_CONFIRM,
    });
    expect(await screen.findByText('Ergebnis: gesperrt')).toBeOnTheScreen();
    expect(mockPush).toHaveBeenCalledWith('/einstellungen');
  });

  it('navigiert nicht, wenn die Rückfrage abgelehnt wird', async () => {
    mockConfirm.mockResolvedValue(false);
    await renderLock();
    await screen.findByText('gesperrt: ja');

    await userEvent.press(screen.getByRole('button', { name: 'KI starten' }));

    expect(await screen.findByText('Ergebnis: gesperrt')).toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('sperrt während des Ladens nicht', async () => {
    mockLoadStatus.mockReturnValue(new Promise(() => {}));
    await renderLock();

    expect(screen.getByText('gesperrt: nein')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'KI starten' }));

    expect(await screen.findByText('Ergebnis: frei')).toBeOnTheScreen();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('sperrt nach einem Ladefehler nicht', async () => {
    mockLoadStatus.mockRejectedValue(new ApiKeyStoreError('weg'));
    await renderLock();
    await screen.findByText('gesperrt: nein');

    await userEvent.press(screen.getByRole('button', { name: 'KI starten' }));

    expect(await screen.findByText('Ergebnis: frei')).toBeOnTheScreen();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('sperrt in der Demo nicht und fragt keinen Key ab', async () => {
    mockIsDemo = true;
    await renderLock();

    expect(screen.getByText('gesperrt: nein')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'KI starten' }));

    expect(await screen.findByText('Ergebnis: frei')).toBeOnTheScreen();
    expect(mockLoadStatus).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
