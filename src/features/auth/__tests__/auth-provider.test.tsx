import type { Session } from '@supabase/supabase-js';
import { act, render, renderHook, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';

import { AuthProvider, useAuth } from '@/features/auth/auth-provider';

/** Von der Session interessiert die App nur die E-Mail des Nutzers */
function fakeSession(email: string): Session {
  return { user: { email } } as Session;
}

let mockSession: Session | null = null;
const mockSignInError = new Error('Invalid login credentials');
const mockListeners: ((event: string, session: Session | null) => void)[] = [];
const mockUnsubscribe = jest.fn();

const mockClient = {
  auth: {
    getSession: jest.fn(async () => ({ data: { session: mockSession } })),
    onAuthStateChange: jest.fn((listener: (event: string, session: Session | null) => void) => {
      mockListeners.push(listener);
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    }),
    signInWithPassword: jest.fn(async () => ({ error: mockSignInError })),
    signOut: jest.fn(async () => ({ error: null })),
  },
};

jest.mock('@/features/auth/supabase', () => ({
  getSupabaseClient: () => mockClient,
}));

jest.mock('@/features/demo/mode', () => ({ isDemo: false }));

function Status() {
  const { session, isLoading } = useAuth();
  return <Text>{isLoading ? 'lädt' : (session?.user.email ?? 'abgemeldet')}</Text>;
}

beforeEach(() => {
  mockSession = null;
  mockListeners.length = 0;
  jest.clearAllMocks();
});

describe('AuthProvider', () => {
  it('startet ohne gespeicherte Session abgemeldet', async () => {
    await render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );

    expect(await screen.findByText('abgemeldet')).toBeOnTheScreen();
  });

  it('übernimmt eine gespeicherte Session', async () => {
    mockSession = fakeSession('anna@example.com');

    await render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );

    expect(await screen.findByText('anna@example.com')).toBeOnTheScreen();
  });

  it('sperrt die App wieder, wenn die Session abläuft oder abgemeldet wird', async () => {
    mockSession = fakeSession('anna@example.com');
    await render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );
    await screen.findByText('anna@example.com');

    await act(async () => {
      for (const listener of mockListeners) listener('SIGNED_OUT', null);
    });

    expect(screen.getByText('abgemeldet')).toBeOnTheScreen();
  });

  it('gibt den Fehler von Supabase zurück und meldet ab', async () => {
    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: PropsWithChildren) => <AuthProvider>{children}</AuthProvider>,
    });

    await expect(result.current.signIn('anna@example.com', 'geheim')).resolves.toBe(
      mockSignInError,
    );
    expect(mockClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'anna@example.com',
      password: 'geheim',
    });

    await expect(result.current.signOut()).resolves.toBeNull();
    expect(mockClient.auth.signOut).toHaveBeenCalled();
  });

  it('meldet den Listener beim Unmount ab', async () => {
    const view = await render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );

    await view.unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
