import { render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AiAccessProvider, useAiAccess } from '@/features/ai/ai-access';
import { ApiKeySettings } from '@/features/ai/api-key-settings';
import {
  apiKeyInputError,
  ApiKeyStoreError,
  deleteApiKey,
  loadApiKeyStatus,
  saveApiKey,
} from '@/features/ai/api-key-store';
import { confirm, notify } from '@/ui/dialogs';
import { showToast } from '@/ui/toast';

let mockIsDemo = false;

jest.mock('@/features/demo/mode', () => ({
  get isDemo() {
    return mockIsDemo;
  },
}));

jest.mock('@/features/ai/api-key-store', () => ({
  NO_API_KEY: { configured: false, updatedAt: null },
  ApiKeyStoreError: class ApiKeyStoreError extends Error {},
  apiKeyInputError: jest.fn(() => null),
  loadApiKeyStatus: jest.fn(),
  saveApiKey: jest.fn(),
  deleteApiKey: jest.fn(),
}));

jest.mock('@/ui/dialogs', () => ({ confirm: jest.fn(), notify: jest.fn() }));
jest.mock('@/ui/toast', () => ({ showToast: jest.fn() }));

const mockInputError = apiKeyInputError as jest.MockedFunction<typeof apiKeyInputError>;
const mockLoadStatus = loadApiKeyStatus as jest.MockedFunction<typeof loadApiKeyStatus>;
const mockSaveKey = saveApiKey as jest.MockedFunction<typeof saveApiKey>;
const mockDeleteKey = deleteApiKey as jest.MockedFunction<typeof deleteApiKey>;
const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;
const mockNotify = notify as jest.MockedFunction<typeof notify>;
const mockShowToast = showToast as jest.MockedFunction<typeof showToast>;

const CONFIGURED = { configured: true, updatedAt: '2025-11-12T09:30:00.000Z' };
const NOT_CONFIGURED = { configured: false, updatedAt: null };
const NEW_KEY = 'sk-ant-api03-ABCdef123_-xyz';

/** Zustand der gemeinsamen KI-Freigabe, wie ihn andere Bildschirme sehen */
function AiAccessProbe() {
  const { state } = useAiAccess();
  return <Text>{`KI: ${state}`}</Text>;
}

/** Die Einstellungen stehen unter dem Provider, der den Status mit der übrigen App teilt */
function renderSettings() {
  return render(
    <AiAccessProvider>
      <ApiKeySettings />
      <AiAccessProbe />
    </AiAccessProvider>,
  );
}

/** Tippen wie im Feld: `userEvent.type` wartet die Zustandsänderungen ab */
async function typeKey(value: string) {
  await userEvent.type(screen.getByLabelText('Anthropic-API-Key'), value);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsDemo = false;
  mockInputError.mockReturnValue(null);
  mockLoadStatus.mockResolvedValue(NOT_CONFIGURED);
  mockConfirm.mockResolvedValue(true);
});

describe('ApiKeySettings', () => {
  it('zeigt ohne hinterlegten Key den Speichern-Zustand', async () => {
    await renderSettings();

    expect(await screen.findByText('Noch kein eigener Key hinterlegt.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Key speichern' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Key löschen' })).not.toBeOnTheScreen();
  });

  it('zeigt mit hinterlegtem Key den Zeitpunkt und den Ersetzen-Zustand', async () => {
    mockLoadStatus.mockResolvedValue(CONFIGURED);

    await renderSettings();

    expect(
      await screen.findByText(/Eigener Key hinterlegt · zuletzt geändert am 12\.11\.2025/),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Key ersetzen' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Key löschen' })).toBeOnTheScreen();
  });

  it('speichert den Key, leert die Eingabe und aktualisiert den Status', async () => {
    mockSaveKey.mockResolvedValue(CONFIGURED);
    await renderSettings();
    await screen.findByText('Noch kein eigener Key hinterlegt.');

    await typeKey(NEW_KEY);
    await userEvent.press(screen.getByRole('button', { name: 'Key speichern' }));

    expect(mockSaveKey).toHaveBeenCalledWith(NEW_KEY);
    expect(screen.getByLabelText('Anthropic-API-Key').props.value).toBe('');
    expect(mockShowToast).toHaveBeenCalledWith({ message: 'API-Key gespeichert' });
    expect(screen.getByRole('button', { name: 'Key ersetzen' })).toBeOnTheScreen();
    expect(screen.getByText('KI: configured')).toBeOnTheScreen();
  });

  it('weist unbrauchbare Eingaben vor dem Speichern ab', async () => {
    mockInputError.mockReturnValue('Bitte gib deinen Anthropic-API-Key ein.');
    await renderSettings();
    await screen.findByText('Noch kein eigener Key hinterlegt.');

    await typeKey('x');
    await userEvent.press(screen.getByRole('button', { name: 'Key speichern' }));

    expect(screen.getByText('Bitte gib deinen Anthropic-API-Key ein.')).toBeOnTheScreen();
    expect(mockSaveKey).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler beim Speichern am Feld', async () => {
    mockSaveKey.mockRejectedValue(new ApiKeyStoreError('Speichern fehlgeschlagen.'));
    await renderSettings();
    await screen.findByText('Noch kein eigener Key hinterlegt.');

    await typeKey(NEW_KEY);
    await userEvent.press(screen.getByRole('button', { name: 'Key speichern' }));

    expect(await screen.findByText('Speichern fehlgeschlagen.')).toBeOnTheScreen();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('löscht den Key erst nach der Rückfrage', async () => {
    mockLoadStatus.mockResolvedValue(CONFIGURED);
    await renderSettings();
    await screen.findByRole('button', { name: 'Key löschen' });

    await userEvent.press(screen.getByRole('button', { name: 'Key löschen' }));

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'API-Key löschen?', confirmLabel: 'Löschen' }),
    );
    expect(mockDeleteKey).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Noch kein eigener Key hinterlegt.')).toBeOnTheScreen();
    expect(mockShowToast).toHaveBeenCalledWith({ message: 'API-Key gelöscht' });
    expect(screen.getByText('KI: missing')).toBeOnTheScreen();
  });

  it('löscht nichts, wenn die Rückfrage abgelehnt wird', async () => {
    mockLoadStatus.mockResolvedValue(CONFIGURED);
    mockConfirm.mockResolvedValue(false);
    await renderSettings();
    await screen.findByRole('button', { name: 'Key löschen' });

    await userEvent.press(screen.getByRole('button', { name: 'Key löschen' }));

    expect(mockDeleteKey).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler beim Löschen als Hinweis', async () => {
    mockLoadStatus.mockResolvedValue(CONFIGURED);
    mockDeleteKey.mockRejectedValue(new ApiKeyStoreError('Löschen fehlgeschlagen.'));
    await renderSettings();
    await screen.findByRole('button', { name: 'Key löschen' });

    await userEvent.press(screen.getByRole('button', { name: 'Key löschen' }));

    expect(mockNotify).toHaveBeenCalledWith(
      'Löschen hat nicht geklappt',
      'Bitte prüfe deine Verbindung und versuche es noch einmal.',
    );
    expect(screen.getByRole('button', { name: 'Key löschen' })).toBeOnTheScreen();
  });

  it('bietet nach einem Ladefehler einen neuen Versuch an', async () => {
    mockLoadStatus
      .mockRejectedValueOnce(new ApiKeyStoreError('weg'))
      .mockResolvedValueOnce(NOT_CONFIGURED);
    await renderSettings();

    expect(
      await screen.findByText('Der Status deines API-Keys konnte nicht geladen werden.'),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByText('Noch kein eigener Key hinterlegt.')).toBeOnTheScreen();
    expect(mockLoadStatus).toHaveBeenCalledTimes(2);
  });

  it('zeigt in der Demo keine Key-Verwaltung', async () => {
    mockIsDemo = true;

    await renderSettings();

    expect(screen.queryByLabelText('Anthropic-API-Key')).not.toBeOnTheScreen();
    expect(mockLoadStatus).not.toHaveBeenCalled();
    // Die übrige App sieht die KI trotzdem als verfügbar
    expect(screen.getByText('KI: configured')).toBeOnTheScreen();
  });
});
