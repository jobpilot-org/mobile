import type { AuthError } from '@supabase/supabase-js';
import { act, render, screen, userEvent } from '@testing-library/react-native';

import { isCredentialsError, LoginScreen, validateLogin } from '@/features/auth/login-screen';
import { showToast } from '@/ui/toast';

const mockSignIn = jest.fn<Promise<AuthError | null>, [string, string]>();

const mockUseAuth = {
  session: null,
  isLoading: false,
  signIn: mockSignIn,
  signOut: jest.fn(),
};

jest.mock('@/features/auth/auth-provider', () => ({ useAuth: () => mockUseAuth }));
jest.mock('@/ui/toast', () => ({ showToast: jest.fn() }));

/** Füllt das Formular aus und drückt „Anmelden“ (Felder, die leer bleiben sollen, weglassen) */
async function submitLogin(email?: string, password?: string) {
  await render(<LoginScreen />);
  if (email) await userEvent.type(screen.getByLabelText('E-Mail'), email);
  if (password) await userEvent.type(screen.getByLabelText('Passwort'), password);
  await userEvent.press(screen.getByRole('button', { name: 'Anmelden' }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('validateLogin', () => {
  it('verlangt E-Mail und Passwort', () => {
    expect(validateLogin({ email: '   ', password: '' })).toEqual({
      email: 'Bitte E-Mail-Adresse eingeben',
      password: 'Bitte Passwort eingeben',
    });
  });

  it('weist unvollständige E-Mail-Adressen zurück', () => {
    expect(validateLogin({ email: 'anna@example', password: 'geheim' })).toEqual({
      email: 'Bitte eine gültige E-Mail-Adresse eingeben',
    });
  });

  it('lässt vollständige Eingaben durch', () => {
    expect(validateLogin({ email: ' anna@example.com ', password: 'geheim' })).toEqual({});
  });
});

describe('isCredentialsError', () => {
  it('erkennt falsche Zugangsdaten', () => {
    expect(isCredentialsError({ code: 'invalid_credentials' } as AuthError)).toBe(true);
  });

  it('ordnet einen Netzwerkfehler nicht den Zugangsdaten zu', () => {
    const offline = {
      name: 'AuthRetryableFetchError',
      message: 'Failed to fetch',
      status: 0,
    } as AuthError;

    expect(isCredentialsError(offline)).toBe(false);
  });
});

describe('LoginScreen', () => {
  it('fragt bei leeren Feldern nach und meldet niemanden an', async () => {
    await submitLogin();

    expect(screen.getByText('Bitte E-Mail-Adresse eingeben')).toBeOnTheScreen();
    expect(screen.getByText('Bitte Passwort eingeben')).toBeOnTheScreen();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('meldet mit getrimmter E-Mail an und übernimmt eine angezeigte Korrektur', async () => {
    mockSignIn.mockResolvedValue(null);
    await submitLogin(' anna@example.com ', 'geheim');

    expect(mockSignIn).toHaveBeenCalledWith('anna@example.com', 'geheim');
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('zeigt falsche Zugangsdaten als Formularfehler', async () => {
    mockSignIn.mockResolvedValue({ code: 'invalid_credentials' } as AuthError);
    await submitLogin('anna@example.com', 'falsch');

    expect(await screen.findByText('E-Mail oder Passwort falsch')).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('meldet Netzwerkfehler als Hinweis statt als Formularfehler', async () => {
    mockSignIn.mockResolvedValue({
      name: 'AuthRetryableFetchError',
      message: 'Failed to fetch',
      status: 0,
    } as AuthError);
    await submitLogin('anna@example.com', 'geheim');

    expect(showToast).toHaveBeenCalledWith({
      message: 'Anmeldung gerade nicht möglich. Bitte prüfe deine Verbindung.',
    });
    expect(screen.queryByText('E-Mail oder Passwort falsch')).not.toBeOnTheScreen();
  });

  it('verhindert einen zweiten Klick, solange die Anmeldung läuft', async () => {
    let finish: (error: AuthError | null) => void = () => {};
    mockSignIn.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)) as Promise<AuthError | null>,
    );
    await submitLogin('anna@example.com', 'geheim');

    await userEvent.press(screen.getByRole('button'));

    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Anmelden …' })).toBeDisabled();

    await act(async () => finish(null));
  });
});
