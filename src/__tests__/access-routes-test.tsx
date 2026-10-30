import { router, type Href } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '@/app/_layout';
import ProtectedLayout, { unstable_settings } from '@/app/(protected)/_layout';
import CommunitiesTab from '@/app/(protected)/(tabs)/communities';
import CommunityDetailScreen from '@/app/(protected)/communities/[communityId]';
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
  getCommunityPosts: jest.fn(),
  getDirectoryUsers: jest.fn(),
  getDirectoryCommunities: jest.fn(),
  searchCommunities: jest.fn(),
  joinCommunity: jest.fn(),
}));

const getProfile = api.getProfile as jest.Mock;
const getCommunity = api.getCommunity as jest.Mock;
const getCommunityPosts = api.getCommunityPosts as jest.Mock;
const getDirectoryUsers = api.getDirectoryUsers as jest.Mock;
const getDirectoryCommunities = api.getDirectoryCommunities as jest.Mock;
const searchCommunities = api.searchCommunities as jest.Mock;
const joinCommunity = api.joinCommunity as jest.Mock;

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
  '(protected)/(tabs)/communities': CommunitiesTab,
  '(protected)/directory': DirectoryScreen,
  '(protected)/reports': ReportsScreen,
  '(protected)/communities/[communityId]': CommunityDetailScreen,
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
    isPublic: true,
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
    getCommunityPosts.mockResolvedValue({ items: [], nextCursor: null });
    getDirectoryUsers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    getDirectoryCommunities.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    searchCommunities.mockResolvedValue([]);
    joinCommunity.mockResolvedValue({ id: 8, name: 'Konoha', iconUrl: null, role: 'member' });
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
    expect(await screen.findByText('0 users')).toBeTruthy();
  });

  it('lets admins browse users and communities in either directory view', async () => {
    getProfile.mockResolvedValue(profile(true));
    getDirectoryUsers.mockResolvedValue({
      items: [{
        userId: 2,
        username: 'sakura',
        name: 'Sakura',
        email: 'sakura@anime.test',
        emailVerifiedAt: null,
        avatarUrl: null,
        coverUrl: null,
        isAdmin: false,
        isHeadAdmin: false,
        isVerified: false,
        communityCount: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
      }],
      total: 21,
      page: 1,
      pageSize: 20,
    });
    getDirectoryUsers.mockResolvedValueOnce({
      items: [{
        userId: 2,
        username: 'sakura',
        name: 'Sakura',
        email: 'sakura@anime.test',
        emailVerifiedAt: null,
        avatarUrl: null,
        coverUrl: null,
        isAdmin: false,
        isHeadAdmin: false,
        isVerified: false,
        communityCount: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
      }],
      total: 21,
      page: 1,
      pageSize: 20,
    }).mockResolvedValueOnce({
      items: [{
        userId: 3,
        username: 'hinata',
        name: 'Hinata',
        email: 'hinata@anime.test',
        emailVerifiedAt: '2026-10-01T00:00:00.000Z',
        avatarUrl: null,
        coverUrl: null,
        isAdmin: false,
        isHeadAdmin: false,
        isVerified: false,
        communityCount: 0,
        createdAt: '2026-09-01T00:00:00.000Z',
      }],
      total: 21,
      page: 2,
      pageSize: 20,
    });

    await renderRouter(routes, { initialUrl: '/directory' });
    expect(await screen.findByText('Sakura')).toBeTruthy();
    expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Next'));
    expect(await screen.findByText('Hinata')).toBeTruthy();
    expect(await screen.findByText('Page 2 of 2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Communities'));
    expect(await screen.findByText('0 communities')).toBeTruthy();
    await fireEvent.press(screen.getByText('List'));
    expect(screen.getByText('List')).toBeTruthy();
    await fireEvent.press(screen.getByText('Users'));
    expect(await screen.findByText('List')).toBeTruthy();
  });

  it('shows public communities on the Communities tab', async () => {
    getProfile.mockResolvedValue(profile(false));
    searchCommunities.mockResolvedValue([{
      id: 8,
      name: 'Konoha',
      description: 'Hidden Leaf Village',
      iconUrl: null,
      coverUrl: null,
      isVerified: true,
      memberCount: 12,
      joined: true,
      members: [],
      mutuals: [],
      mutualCount: 0,
    }]);

    await renderRouter(routes, { initialUrl: '/communities' });
    expect(await screen.findByText(/Konoha/)).toBeTruthy();
    expect(screen.getByText(/12\s+members/)).toBeTruthy();
  });

  it('allows guests to view public communities but not private communities', async () => {
    useAuthStore.setState({ token: null, profile: null, sessionExpired: false });
    getCommunity.mockResolvedValue({
      id: 5,
      name: 'Konoha',
      description: 'Hidden Leaf Village',
      iconUrl: null,
      coverUrl: null,
      isPublic: true,
      isVerified: false,
      memberCount: 3,
      role: null,
    });

    await renderRouter(routes, { initialUrl: '/communities/5' });

    expect(await screen.findByText(/Konoha/)).toBeTruthy();
    expect(getCommunity).toHaveBeenCalledWith(null, '5');

    getCommunity.mockResolvedValueOnce(null);
    await act(() => router.navigate('/communities/99' as Href));
    expect(await screen.findByText('This community is private or no longer available.')).toBeTruthy();
    expect(screen.queryByText('Hidden Leaf Village')).toBeNull();

    await act(() => router.navigate('/directory' as Href));
    expect(await screen.findByText('Log in')).toBeTruthy();
  });

  it('joins a community and opens its page', async () => {
    useAuthStore.setState({
      token: 'token',
      profile: { ...profile(false), emailVerifiedAt: '2026-10-01T00:00:00.000Z' },
      sessionExpired: false,
    });
    getCommunity.mockResolvedValue({
      id: 8,
      name: 'Konoha',
      iconUrl: null,
      isPublic: true,
      memberCount: 12,
      role: 'member',
    });
    searchCommunities.mockResolvedValue([{
      id: 8,
      name: 'Konoha',
      description: null,
      iconUrl: null,
      coverUrl: null,
      isVerified: false,
      memberCount: 12,
      joined: false,
      members: [],
      mutuals: [],
      mutualCount: 0,
    }]);

    await renderRouter(routes, { initialUrl: '/communities' });
    await fireEvent.press(await screen.findByText('Join'));

    expect(joinCommunity).toHaveBeenCalledWith('token', 8);
    expect(await screen.findByText(/Konoha/)).toBeTruthy();
  });

  it('lets a verified user join from the community page', async () => {
    useAuthStore.setState({
      token: 'token',
      profile: { ...profile(false), emailVerifiedAt: '2026-10-01T00:00:00.000Z' },
      sessionExpired: false,
    });
    getCommunity.mockResolvedValue({
      id: 5,
      name: 'Konoha',
      iconUrl: null,
      coverUrl: null,
      description: 'Hidden Leaf Village',
      isPublic: true,
      isVerified: false,
      memberCount: 0,
      role: null,
    });

    await renderRouter(routes, { initialUrl: '/communities/5' });
    await fireEvent.press(await screen.findByText('Join community'));

    expect(joinCommunity).toHaveBeenCalledWith('token', 5);
    expect(await screen.findByText(/1\s+member/)).toBeTruthy();
  });

  it('shows members their own reports and admins every report', async () => {
    getProfile.mockResolvedValue(profile(false));
    await renderRouter(routes, { initialUrl: '/reports' });
    expect(await screen.findByText('My reports')).toBeTruthy();

    await act(() => useAuthStore.setState({ profile: profile(true) }));
    expect(await screen.findByText('Reviewing reports isn’t in the app yet. You can review them on the Orbis website in the meantime.')).toBeTruthy();
  });

  it('keeps community settings to the owner and admins', async () => {
    getCommunity.mockResolvedValue({ id: 5, name: 'Konoha', iconUrl: null, role: 'member' });

    await renderRouter(routes, { initialUrl: '/communities/5' });
    await act(() => router.push('/communities/5/settings' as Href));

    expect(await screen.findByText('Only the owner and admins can make changes to Konoha.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Back to community'));
    expect(await screen.findByText(/Konoha/)).toBeTruthy();
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
