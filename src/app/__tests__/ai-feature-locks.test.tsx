import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ApplicationScreen from '@/app/bewerbung/[id]/index';
import AssistantScreen from '@/app/bewerbung/[id]/ki';
import FromPostingScreen from '@/app/bewerbung/aus-anzeige';
import NewApplicationScreen from '@/app/bewerbung/neu';
import type { AiAccessState } from '@/features/ai/ai-access';
import {
  AI_KEY_MISSING_CONFIRM,
  AI_KEY_MISSING_HINT,
  AI_KEY_MISSING_TITLE,
} from '@/features/ai/ai-feature-lock';
import { callAi } from '@/features/ai/client';
import { ensureAiConsent } from '@/features/ai/consent';
import { confirm } from '@/ui/dialogs';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockParams: { id: string; aufgabe?: string } = { id: 'a1', aufgabe: 'passung' };
let mockAiState: AiAccessState = 'configured';
let mockIsDemo = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));

jest.mock('@/features/demo/mode', () => ({
  get isDemo() {
    return mockIsDemo;
  },
}));

// Der Sperrzustand kommt aus der gemeinsamen KI-Freigabe; hier reicht der Zustand selbst
jest.mock('@/features/ai/ai-access', () => ({
  useAiAccess: () => ({
    state: mockAiState,
    status: null,
    retry: jest.fn(),
    applyStatus: jest.fn(),
  }),
}));

jest.mock('@/features/ai/client', () => ({ callAi: jest.fn() }));
jest.mock('@/features/ai/consent', () => ({ ensureAiConsent: jest.fn() }));
jest.mock('@/ui/dialogs', () => ({ confirm: jest.fn(), notify: jest.fn() }));

const mockApplication = {
  id: 'a1',
  company: 'Nordlicht',
  role: 'Frontend-Entwicklerin',
  location: 'Hamburg',
  appliedAt: '2025-11-12',
  status: 'applied',
  priority: 'medium',
  jobDescription: 'Wir suchen eine Frontend-Entwicklerin für unser Team in Hamburg.',
};

const mockRepositories = {
  applications: {
    create: jest.fn(),
    changeStatus: jest.fn(),
    setJobDescription: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
  },
  details: { saveContact: jest.fn(), addNote: jest.fn() },
  reminders: {},
  settings: {},
};

let mockLiveData: unknown;

jest.mock('@/db/hooks', () => ({
  useLive: () => mockLiveData,
  useRepositories: () => mockRepositories,
}));

// Das Formular selbst ist hier nicht Gegenstand; es reicht, dass der Kopfbereich erscheint
jest.mock('@/features/applications/components/application-form', () => ({
  ApplicationForm: ({ header }: { header?: ReactNode }) => header ?? null,
}));

const mockCallAi = callAi as jest.MockedFunction<typeof callAi>;
const mockEnsureConsent = ensureAiConsent as jest.MockedFunction<typeof ensureAiConsent>;
const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;

/** Details einer Bewerbung ohne Termine, Kontakte, Notizen und Erinnerungen */
function applicationDetail() {
  return {
    application: mockApplication,
    events: [],
    contacts: [],
    notes: [],
    appointments: [],
    reminders: [],
  };
}

/** Zustand der KI-Freigabe so setzen, wie ihn die gemeinsame Quelle liefert */
function aiAccess(state: AiAccessState) {
  mockAiState = state;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsDemo = false;
  mockAiState = 'configured';
  mockParams.id = 'a1';
  mockParams.aufgabe = 'passung';
  mockLiveData = applicationDetail();
  mockConfirm.mockResolvedValue(true);
  mockEnsureConsent.mockResolvedValue(true);
  mockCallAi.mockRejectedValue(new Error('Kein Netz'));
});

describe('Neue Bewerbung', () => {
  it('lässt den Anzeigen-Import bei fehlendem Key sichtbar und gesperrt', async () => {
    aiAccess('missing');

    await render(<NewApplicationScreen />);

    const button = screen.getByRole('button', { name: 'Aus Anzeige übernehmen' });
    expect(button).toBeOnTheScreen();
    expect(button.props.accessibilityHint).toBe(AI_KEY_MISSING_HINT);

    await userEvent.press(button);

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: AI_KEY_MISSING_TITLE,
        confirmLabel: AI_KEY_MISSING_CONFIRM,
      }),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/einstellungen');
  });

  it('öffnet den Anzeigen-Import ohne Rückfrage, sobald ein Key hinterlegt ist', async () => {
    await render(<NewApplicationScreen />);

    const button = screen.getByRole('button', { name: 'Aus Anzeige übernehmen' });
    expect(button.props.accessibilityHint).toBeUndefined();

    await userEvent.press(button);

    expect(mockReplace).toHaveBeenCalledWith('/bewerbung/aus-anzeige');
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it.each(['loading', 'error'] as const)(
    'behält bei unbekanntem Status (%s) den bisherigen Weg',
    async (state) => {
      aiAccess(state);

      await render(<NewApplicationScreen />);
      await userEvent.press(screen.getByRole('button', { name: 'Aus Anzeige übernehmen' }));

      expect(mockReplace).toHaveBeenCalledWith('/bewerbung/aus-anzeige');
      expect(mockConfirm).not.toHaveBeenCalled();
    },
  );
});

describe('Bewerbungsdetails', () => {
  it('zeigt alle Assistenten-Zeilen mit Schloss, wenn der Key fehlt', async () => {
    aiAccess('missing');

    await render(<ApplicationScreen />);

    for (const title of [/Passt die Stelle zu mir\?/, /Gespräch vorbereiten/, /Text entwerfen/]) {
      const row = screen.getByRole('button', { name: title });
      expect(row).toBeOnTheScreen();
      expect(row.props.accessibilityHint).toBe(AI_KEY_MISSING_HINT);
    }
  });

  it('erklärt die Sperre statt den Assistenten zu öffnen', async () => {
    aiAccess('missing');
    await render(<ApplicationScreen />);

    await userEvent.press(screen.getByRole('button', { name: /Passt die Stelle zu mir\?/ }));

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: AI_KEY_MISSING_TITLE,
        confirmLabel: AI_KEY_MISSING_CONFIRM,
      }),
    );
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/bewerbung/[id]/ki' }),
    );
  });

  it('öffnet den Assistenten ohne Rückfrage, sobald ein Key hinterlegt ist', async () => {
    await render(<ApplicationScreen />);

    const row = screen.getByRole('button', { name: /Gespräch vorbereiten/ });
    expect(row.props.accessibilityHint).toBeUndefined();

    await userEvent.press(row);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/bewerbung/[id]/ki',
      params: { id: 'a1', aufgabe: 'vorbereitung' },
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('behält bei einem Ladefehler den bisherigen Weg', async () => {
    aiAccess('error');
    await render(<ApplicationScreen />);

    await userEvent.press(screen.getByRole('button', { name: /Text entwerfen/ }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/bewerbung/[id]/ki',
      params: { id: 'a1', aufgabe: 'entwurf' },
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});

describe('Aus Stellenanzeige', () => {
  const POSTING = 'a'.repeat(120);

  /** Lang genug für „Auswerten“; `waitFor` wartet den Zustandswechsel des Feldes ab */
  async function fillPosting() {
    await render(<FromPostingScreen />);
    fireEvent.changeText(screen.getByLabelText('Text der Stellenanzeige'), POSTING);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Auswerten' }).props.accessibilityState.disabled,
      ).toBe(false),
    );
  }

  it('startet ohne Key weder Zustimmung noch Anfrage', async () => {
    aiAccess('missing');
    await fillPosting();

    await userEvent.press(screen.getByRole('button', { name: 'Auswerten' }));

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: AI_KEY_MISSING_TITLE,
        confirmLabel: AI_KEY_MISSING_CONFIRM,
      }),
    );
    expect(mockEnsureConsent).not.toHaveBeenCalled();
    expect(mockCallAi).not.toHaveBeenCalled();
  });

  it('wertet die Anzeige mit Key wie bisher aus', async () => {
    await fillPosting();

    await userEvent.press(screen.getByRole('button', { name: 'Auswerten' }));

    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
    expect(mockCallAi).toHaveBeenCalledWith('stellenanzeige', { posting: POSTING });
    expect(await screen.findByText('Kein Netz')).toBeOnTheScreen();
  });
});

describe('KI-Assistent', () => {
  beforeEach(() => {
    mockLiveData = { application: mockApplication, contact: undefined, profile: 'Mein Profil' };
  });

  it('startet ohne Key weder Zustimmung noch Anfrage', async () => {
    aiAccess('missing');
    await render(<AssistantScreen />);

    await userEvent.press(screen.getByRole('button', { name: 'Erstellen' }));

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: AI_KEY_MISSING_TITLE,
        confirmLabel: AI_KEY_MISSING_CONFIRM,
      }),
    );
    expect(mockEnsureConsent).not.toHaveBeenCalled();
    expect(mockCallAi).not.toHaveBeenCalled();
  });

  it('fragt mit Key wie bisher nach Zustimmung und ruft die KI', async () => {
    await render(<AssistantScreen />);

    await userEvent.press(screen.getByRole('button', { name: 'Erstellen' }));

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
    expect(mockCallAi).toHaveBeenCalledWith('passung', {
      posting: mockApplication.jobDescription,
      profile: 'Mein Profil',
    });
  });
});
