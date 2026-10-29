import * as api from '@/lib/api';
import { clearOAuthState } from '@/lib/oauth';

import { useAuthStore } from '../auth-store';

jest.mock('@/lib/storage', () => {
  const mockItems = new Map<string, string>();
  return {
    secureStorage: {
      getItem: async (key: string) => mockItems.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        mockItems.set(key, value);
      },
      removeItem: async (key: string) => {
        mockItems.delete(key);
      },
    },
  };
});

jest.mock('@/lib/oauth', () => ({ clearOAuthState: jest.fn(async () => undefined) }));

jest.mock('@/lib/api', () => ({
  getProfile: jest.fn(),
  login: jest.fn(),
  signup: jest.fn(),
  updatePreferences: jest.fn(),
  setUnauthorizedHandler: jest.fn(),
}));

const getProfile = api.getProfile as jest.Mock;
const updatePreferences = api.updatePreferences as jest.Mock;
const setUnauthorizedHandler = api.setUnauthorizedHandler as jest.Mock;
const unauthorizedHandler: (token: string) => void = setUnauthorizedHandler.mock.calls[0][0];

function profileFor(userId: number, username: string): api.Profile {
  return {
    userId,
    username,
    email: `${username}@anime.test`,
    avatarUrl: null,
    coverUrl: null,
    backgroundUrl: null,
    theme: 'dark',
    appearOffline: false,
    status: 'online',
    isPublic: true,
    showNsfw: false,
    showChangelog: true,
    isAdmin: false,
    isHeadAdmin: false,
    emailVerifiedAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('auth store', () => {
  beforeEach(() => {
    getProfile.mockReset();
    updatePreferences.mockReset();
    (clearOAuthState as jest.Mock).mockClear();
    useAuthStore.setState({
      token: null,
      profile: null,
      sessionExpired: false,
      preferencesPending: false,
      preferencesVersion: 0,
    });
  });

  it('ignores a profile that arrives after switching accounts', async () => {
    let finishFirst: (profile: api.Profile) => void = () => undefined;
    getProfile.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)));
    useAuthStore.getState().loginWithToken('token-a');

    const loading = useAuthStore.getState().fetchProfile();
    useAuthStore.getState().loginWithToken('token-b');
    finishFirst(profileFor(1, 'naruto'));

    await expect(loading).resolves.toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
    expect(useAuthStore.getState().token).toBe('token-b');
  });

  it('signs out only when the rejected token is the current one', () => {
    useAuthStore.getState().loginWithToken('token-b');

    unauthorizedHandler('token-a');
    expect(useAuthStore.getState().token).toBe('token-b');

    unauthorizedHandler('token-b');
    expect(useAuthStore.getState()).toMatchObject({ token: null, sessionExpired: true });
    expect(clearOAuthState).toHaveBeenCalled();
  });

  it('clears user data and pending sign-ins on logout', () => {
    useAuthStore.setState({ token: 'token-a', profile: profileFor(1, 'naruto') });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({ token: null, profile: null, sessionExpired: false });
    expect(clearOAuthState).toHaveBeenCalled();
  });

  it('forgets the expired-session notice after logging in again', () => {
    useAuthStore.setState({ sessionExpired: true });

    useAuthStore.getState().loginWithToken('token-c');

    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });

  it('updates preferences and refreshes the preference version on success', async () => {
    const profile = profileFor(1, 'naruto');
    const updatedProfile = { ...profile, showNsfw: true };
    useAuthStore.setState({ token: 'token-a', profile });
    updatePreferences.mockResolvedValueOnce(updatedProfile);

    await useAuthStore.getState().updatePreferences({ showNsfw: true });

    expect(updatePreferences).toHaveBeenCalledWith('token-a', { showNsfw: true });
    expect(useAuthStore.getState()).toMatchObject({
      profile: updatedProfile,
      preferencesPending: false,
      preferencesVersion: 1,
    });
  });

  it('rolls back failed preference updates and refreshes affected data', async () => {
    const profile = profileFor(1, 'naruto');
    useAuthStore.setState({ token: 'token-a', profile });
    updatePreferences.mockRejectedValueOnce(new Error('Could not save your preferences.'));

    await expect(
      useAuthStore.getState().updatePreferences({ showNsfw: true }),
    ).rejects.toThrow('Could not save your preferences.');

    expect(useAuthStore.getState()).toMatchObject({
      profile,
      preferencesPending: false,
      preferencesVersion: 1,
    });
  });
});
