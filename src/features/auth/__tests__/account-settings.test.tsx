import type { AuthError, Session } from '@supabase/supabase-js';
import { render, screen, userEvent } from '@testing-library/react-native';

import { AccountSettings } from '@/features/auth/account-settings';
import { confirm, notify } from '@/ui/dialogs';

const mockSignOut = jest.fn(async (): Promise<AuthError | null> => null);

const mockUseAuth: {
  session: Session | null;
  isLoading: boolean;
  signIn: jest.Mock;
  signOut: typeof mockSignOut;
} = {
  session: null,
  isLoading: false,
  signIn: jest.fn(),
  signOut: mockSignOut,
};

jest.mock('@/features/auth/auth-provider', () => ({ useAuth: () => mockUseAuth }));
jest.mock('@/ui/dialogs', () => ({ confirm: jest.fn(), notify: jest.fn() }));

const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;
const mockNotify = notify as jest.MockedFunction<typeof notify>;

/** Von der Session interessiert die Einstellungen nur die E-Mail des Nutzers */
function signedIn(email: string) {
  mockUseAuth.session = { user: { email } } as Session;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.session = null;
  mockSignOut.mockResolvedValue(null);
  mockConfirm.mockResolvedValue(true);
});

describe('AccountSettings', () => {
  it('zeigt die E-Mail des angemeldeten Nutzers', async () => {
    signedIn('anna@example.com');

    await render(<AccountSettings />);

    expect(screen.getByText('anna@example.com')).toBeOnTheScreen();
  });

  it('zeigt ohne Session nichts an', async () => {
    await render(<AccountSettings />);

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('meldet nach Bestätigung ab', async () => {
    signedIn('anna@example.com');
    await render(<AccountSettings />);

    await userEvent.press(screen.getByRole('button', { name: 'Abmelden' }));

    expect(mockConfirm).toHaveBeenCalledWith({
      title: 'Abmelden?',
      message: 'Du landest wieder auf der Anmeldung. Deine Daten bleiben auf diesem Gerät.',
      confirmLabel: 'Abmelden',
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('meldet nicht ab, wenn die Rückfrage abgelehnt wird', async () => {
    signedIn('anna@example.com');
    mockConfirm.mockResolvedValue(false);
    await render(<AccountSettings />);

    await userEvent.press(screen.getByRole('button', { name: 'Abmelden' }));

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler von Supabase als Hinweis', async () => {
    signedIn('anna@example.com');
    mockSignOut.mockResolvedValue({ message: 'Failed to fetch' } as AuthError);
    await render(<AccountSettings />);

    await userEvent.press(screen.getByRole('button', { name: 'Abmelden' }));

    expect(mockNotify).toHaveBeenCalledWith(
      'Abmelden hat nicht geklappt',
      'Bitte prüfe deine Verbindung und versuche es noch einmal.',
    );
  });
});
