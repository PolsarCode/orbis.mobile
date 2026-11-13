import { router, useLocalSearchParams } from 'expo-router';
import { render, screen, waitFor } from '@testing-library/react-native';

import OAuthCallbackScreen from '@/app/auth/callback';
import { completeOAuth } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

const mockStorage = new Map<string, string>();

jest.mock('@/lib/storage', () => ({
  secureStorage: {
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStorage.delete(key);
    },
  },
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  completeOAuth: jest.fn(),
}));

const replace = router.replace as jest.Mock;
const params = useLocalSearchParams as jest.Mock;
const complete = completeOAuth as jest.Mock;
const loginWithToken = jest.fn();
const nonce = 'a'.repeat(64);

function startAttempt(token: string | null, provider = 'discord') {
  mockStorage.set(
    'oauth-pending-v1',
    JSON.stringify({ provider, nonce, token, destination: '/friends', startedAt: Date.now() }),
  );
}

async function returnWith(values: Record<string, string>) {
  params.mockReturnValue(values);
  await render(<OAuthCallbackScreen />);
}

describe('OAuth callback screen', () => {
  beforeEach(() => {
    mockStorage.clear();
    replace.mockReset();
    complete.mockReset();
    loginWithToken.mockReset();
    useAuthStore.setState({ token: null, loginWithToken });
  });

  it('signs in with the returned token and goes to the saved destination', async () => {
    startAttempt(null);
    complete.mockResolvedValue({ access_token: 'new-session' });
    await returnWith({ provider: 'discord', code: 'code', state: 'state' });

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/friends'));
    expect(complete).toHaveBeenCalledWith('discord', { code: 'code', state: 'state', nonce }, null);
    expect(loginWithToken).toHaveBeenCalledWith('new-session');
    expect(mockStorage.has('oauth-pending-v1')).toBe(false);
  });

  it('sends new accounts to the username step', async () => {
    startAttempt(null, 'twitch');
    complete.mockResolvedValue({
      signup: { token: 'signup', username: 'streamer', avatarUrl: null },
    });
    await returnWith({ provider: 'twitch', code: 'code', state: 'state' });

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/oauth-signup'));
    expect(loginWithToken).not.toHaveBeenCalled();
    expect(JSON.parse(mockStorage.get('oauth-signup-v1')!)).toEqual({
      provider: 'twitch',
      token: 'signup',
      username: 'streamer',
      avatarUrl: null,
    });
  });

  it('refuses a duplicate callback once the attempt was used', async () => {
    await returnWith({ provider: 'discord', code: 'code', state: 'state' });

    expect(await screen.findByText(/expired or was already handled/)).toBeTruthy();
    expect(complete).not.toHaveBeenCalled();
  });

  it('refuses a callback when the signed-in account changed', async () => {
    startAttempt('account-a');
    useAuthStore.setState({ token: 'account-b' });
    await returnWith({ provider: 'discord', code: 'code', state: 'state' });

    expect(await screen.findByText(/Your account changed/)).toBeTruthy();
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByText('Back to Orbis')).toBeTruthy();
  });

  it('refuses a callback for a different provider', async () => {
    startAttempt(null, 'discord');
    await returnWith({ provider: 'twitch', code: 'code', state: 'state' });

    expect(await screen.findByText(/did not match/)).toBeTruthy();
    expect(complete).not.toHaveBeenCalled();
  });

  it('shows a cancellation when authorization was denied', async () => {
    startAttempt(null);
    await returnWith({ provider: 'discord', error: 'access_denied' });

    expect(await screen.findByText('Sign-in was cancelled.')).toBeTruthy();
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByText('Back to log in')).toBeTruthy();
  });

  it('shows the server error for an expired or invalid state', async () => {
    startAttempt(null);
    complete.mockRejectedValue(new Error('That sign-in link expired. Please try again.'));
    await returnWith({ provider: 'discord', code: 'code', state: 'stale' });

    expect(await screen.findByText('That sign-in link expired. Please try again.')).toBeTruthy();
    expect(loginWithToken).not.toHaveBeenCalled();
  });
});
