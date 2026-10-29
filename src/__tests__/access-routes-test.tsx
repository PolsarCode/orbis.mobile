import { router, type Href } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '@/app/_layout';
import ProtectedLayout, { unstable_settings } from '@/app/(protected)/_layout';
import CommunitySettingsScreen from '@/app/(protected)/communities/[communityId]/settings';
import DirectoryScreen from '@/app/(protected)/directory';
import ReportsScreen from '@/app/(protected)/reports';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

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

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getProfile: jest.fn(),
  getCommunity: jest.fn(),
}));

const getProfile = api.getProfile as jest.Mock;
const getCommunity = api.getCommunity as jest.Mock;

function stub(label: string) {
  return function Screen() {
    return <Text>{label}</Text>;
  };
}

const routes = {
  _layout: RootLayout,
  index: stub('Welcome'),
  login: stub('Log in'),
  register: stub('Sign up'),
  '(protected)/_layout': { default: ProtectedLayout, unstable_settings },
  '(protected)/(tabs)/index': stub('Home'),
  '(protected)/directory': DirectoryScreen,
  '(protected)/reports': ReportsScreen,
  '(protected)/communities/[communityId]': stub('Community'),
  '(protected)/communities/[communityId]/settings': CommunitySettingsScreen,
};

function profile(isAdmin: boolean): api.Profile {
  return {
    userId: 1,
    username: 'naruto',
    email: 'naruto@anime.test',
    avatarUrl: null,
    coverUrl: null,
    backgroundUrl: null,
    theme: 'dark',
    appearOffline: false,
    status: 'online',
    isPublic: true,
    showNsfw: false,
    showChangelog: true,
    isAdmin,
    isHeadAdmin: false,
    emailVerifiedAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('role-restricted routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ token: 'token', profile: null, sessionExpired: false });
  });

  it('shows a loading state while checking access', async () => {
    getProfile.mockReturnValue(new Promise(() => undefined));

    await renderRouter(routes, { initialUrl: '/directory' });

    expect(await screen.findByText('Checking your access…')).toBeTruthy();
  });

  it('tells members the directory is for site admins', async () => {
    getProfile.mockResolvedValue(profile(false));

    await renderRouter(routes, { initialUrl: '/directory' });

    expect(await screen.findByText('You don’t have access.')).toBeTruthy();
    expect(screen.getByText('Only site admins can see the directory.')).toBeTruthy();
    expect(screen.queryByText('Open on the web')).toBeNull();
  });

  it('lets admins retry after a failed check and then open the directory', async () => {
    getProfile.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(profile(true));

    await renderRouter(routes, { initialUrl: '/directory' });
    await fireEvent.press(await screen.findByText('Try again'));

    expect(await screen.findByText('Directory')).toBeTruthy();
    expect(screen.getByText('Open on the web')).toBeTruthy();
  });

  it('shows members their own reports and admins every report', async () => {
    getProfile.mockResolvedValue(profile(false));
    await renderRouter(routes, { initialUrl: '/reports' });
    expect(await screen.findByText('My reports')).toBeTruthy();

    useAuthStore.setState({ profile: profile(true) });
    expect(await screen.findByText('Reviewing reports isn’t in the app yet. You can review them on the Orbis website in the meantime.')).toBeTruthy();
  });

  it('keeps community settings to the owner and admins', async () => {
    getCommunity.mockResolvedValue({ id: 5, name: 'Konoha', iconUrl: null, role: 'member' });

    await renderRouter(routes, { initialUrl: '/communities/5' });
    await act(() => router.push('/communities/5/settings' as Href));

    expect(await screen.findByText('Only the owner and admins can make changes to Konoha.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Back to community'));
    expect(await screen.findByText('Community')).toBeTruthy();
    expect(screen).toHavePathname('/communities/5');

    await act(() => router.back());
    expect(await screen.findByText('Home')).toBeTruthy();
  });

  it('opens community settings for a community admin', async () => {
    getCommunity.mockResolvedValue({ id: 5, name: 'Konoha', iconUrl: null, role: 'admin' });

    await renderRouter(routes, { initialUrl: '/communities/5/settings' });

    expect(await screen.findByText('Community settings aren’t in the app yet. You can change them on the Orbis website in the meantime.')).toBeTruthy();
    expect(getCommunity).toHaveBeenCalledWith('token', '5');
  });

  it('treats a missing or hidden community as no access', async () => {
    getCommunity.mockResolvedValue(null);

    await renderRouter(routes, { initialUrl: '/communities/404/settings' });

    expect(await screen.findByText('Only a community’s owner and admins can change its settings.')).toBeTruthy();
  });
});
