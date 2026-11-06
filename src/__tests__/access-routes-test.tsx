import { router, type Href } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '@/app/_layout';
import ProtectedLayout, { unstable_settings } from '@/app/(protected)/_layout';
import CommunitiesTab from '@/app/(protected)/(tabs)/communities';
import CommunityDetailScreen from '@/app/(protected)/communities/[communityId]';
import CommunityMembersScreen from '@/app/(protected)/communities/[communityId]/members';
import CommunityMemberSettingsScreen from '@/app/(protected)/communities/[communityId]/member-settings';
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

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    connected: false,
  })),
}));

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getProfile: jest.fn(),
  getCommunity: jest.fn(),
  getCommunityMembers: jest.fn(),
  getCommunityPosts: jest.fn(),
  getCommunities: jest.fn(),
  getDirectoryUsers: jest.fn(),
  getDirectoryCommunities: jest.fn(),
  getMembers: jest.fn(),
  getRailLayout: jest.fn(),
  updateRailLayout: jest.fn(),
  setNickname: jest.fn(),
  setShowLibraryUpdates: jest.fn(),
  searchCommunities: jest.fn(),
  joinCommunity: jest.fn(),
}));

const getProfile = api.getProfile as jest.Mock;
const getCommunity = api.getCommunity as jest.Mock;
const getCommunityMembers = api.getCommunityMembers as jest.Mock;
const getCommunityPosts = api.getCommunityPosts as jest.Mock;
const getCommunities = api.getCommunities as jest.Mock;
const getDirectoryUsers = api.getDirectoryUsers as jest.Mock;
const getDirectoryCommunities = api.getDirectoryCommunities as jest.Mock;
const getMembers = api.getMembers as jest.Mock;
const getRailLayout = api.getRailLayout as jest.Mock;
const updateRailLayout = api.updateRailLayout as jest.Mock;
const setNickname = api.setNickname as jest.Mock;
const setShowLibraryUpdates = api.setShowLibraryUpdates as jest.Mock;
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
  '(protected)/(tabs)/messages': stub('Messages'),
  '(protected)/(tabs)/communities': CommunitiesTab,
  '(protected)/messages/[conversationId]': stub('Conversation'),
  '(protected)/directory': DirectoryScreen,
  '(protected)/reports': ReportsScreen,
  '(protected)/communities/[communityId]': CommunityDetailScreen,
  '(protected)/communities/[communityId]/members': CommunityMembersScreen,
  '(protected)/communities/[communityId]/member-settings': CommunityMemberSettingsScreen,
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
    getCommunityPosts.mockResolvedValue({ items: [], nextCursor: null });
    getCommunityMembers.mockResolvedValue([]);
    getCommunities.mockResolvedValue([]);
    getDirectoryUsers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    getDirectoryCommunities.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    getMembers.mockResolvedValue([{
      userId: 1,
      username: 'naruto',
      name: 'Naruto',
      avatarUrl: null,
      coverUrl: null,
      isVerified: false,
      online: false,
      status: 'offline',
      nickname: null,
      joinedAt: '2026-10-01T00:00:00.000Z',
      isOwner: false,
      isAdmin: false,
    }]);
    getRailLayout.mockResolvedValue([]);
    updateRailLayout.mockImplementation(async (_token, layout) => layout);
    setNickname.mockImplementation(async (_token, _communityId, nickname) => ({ nickname }));
    setShowLibraryUpdates.mockImplementation(async (_token, _communityId, show) => ({
      showLibraryUpdates: show,
    }));
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

  it('reorders joined communities and saves the shared layout', async () => {
    useAuthStore.setState({
      token: 'token',
      profile: profile(false),
      sessionExpired: false,
    });
    getCommunities.mockResolvedValue([
      { id: 8, name: 'Konoha', iconUrl: null, role: 'member' },
      { id: 9, name: 'Suna', iconUrl: null, role: 'member' },
    ]);
    getRailLayout.mockResolvedValue([
      { type: 'community', communityId: 8 },
      { type: 'community', communityId: 9 },
    ]);

    await renderRouter(routes, { initialUrl: '/communities' });
    expect(await screen.findByText('Your communities')).toBeTruthy();
    expect(await screen.findByText('Konoha')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Move Konoha down'));

    await waitFor(() => {
      expect(updateRailLayout).toHaveBeenCalledWith('token', [
        { type: 'community', communityId: 9 },
        { type: 'community', communityId: 8 },
      ]);
    });
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

  it('lets community members edit their own community settings', async () => {
    useAuthStore.setState({
      token: 'token',
      profile: profile(false),
      sessionExpired: false,
    });
    getCommunity.mockResolvedValue({ id: 5, name: 'Konoha', iconUrl: null, role: 'member' });

    await renderRouter(routes, { initialUrl: '/communities/5' });
    await fireEvent.press(await screen.findByText('Your settings'));

    expect(await screen.findByText('Your community settings')).toBeTruthy();
    expect(await screen.findByText('Nickname')).toBeTruthy();
    expect(screen.queryByText('Community settings')).toBeNull();
    expect(getMembers).toHaveBeenCalledWith('token', 5);
  });

  it('saves a community nickname and library-sharing preference', async () => {
    useAuthStore.setState({
      token: 'token',
      profile: profile(false),
      sessionExpired: false,
    });
    getCommunity.mockResolvedValue({
      id: 5,
      name: 'Konoha',
      iconUrl: null,
      role: 'member',
      showLibraryUpdates: true,
    });

    await renderRouter(routes, { initialUrl: '/communities/5/member-settings' });
    await screen.findByText('Your community settings');
    await fireEvent.changeText(screen.getByLabelText('Community nickname'), 'Leaf');
    await fireEvent.press(screen.getByText('Save nickname'));
    expect(await screen.findByText('Nickname saved.')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Share library updates with Konoha'), 'valueChange', false);

    await waitFor(() => {
      expect(setNickname).toHaveBeenCalledWith('token', 5, 'Leaf');
      expect(setShowLibraryUpdates).toHaveBeenCalledWith('token', 5, false);
    });
  });

  it('shows member names and roles in the community member list', async () => {
    useAuthStore.setState({
      token: 'token',
      profile: profile(false),
      sessionExpired: false,
    });
    getCommunity.mockResolvedValue({ id: 5, name: 'Konoha', iconUrl: null, role: 'member' });
    getMembers.mockResolvedValue([{
      userId: 1,
      username: 'naruto',
      name: 'Naruto',
      avatarUrl: null,
      coverUrl: null,
      isVerified: false,
      online: true,
      status: 'online',
      nickname: 'Leaf',
      joinedAt: '2026-10-01T00:00:00.000Z',
      isOwner: true,
      isAdmin: false,
    }]);

    await renderRouter(routes, { initialUrl: '/communities/5/members' });

    expect(await screen.findByText('Konoha members')).toBeTruthy();
    expect(screen.getByText('Leaf')).toBeTruthy();
    expect(screen.getByText('@naruto · Owner')).toBeTruthy();
  });

  it('opens community settings for a community admin', async () => {
    useAuthStore.setState({
      token: 'token',
      profile: profile(false),
      sessionExpired: false,
    });
    getCommunity.mockResolvedValue({ id: 5, name: 'Konoha', iconUrl: null, role: 'admin' });

    await renderRouter(routes, { initialUrl: '/communities/5/settings' });

    expect(await screen.findByText('Admins')).toBeTruthy();
    expect(getCommunity).toHaveBeenCalledWith('token', '5');
  });

  it('keeps community management settings restricted to owners and admins', async () => {
    getCommunity.mockResolvedValue({ id: 5, name: 'Konoha', iconUrl: null, role: 'member' });

    await renderRouter(routes, { initialUrl: '/communities/5/settings' });

    expect(await screen.findByText('You don’t have access.')).toBeTruthy();
    expect(screen.getByText('Only the owner and admins can make changes to Konoha.')).toBeTruthy();
  });

  it('treats a missing or hidden community as no access', async () => {
    getCommunity.mockResolvedValue(null);

    await renderRouter(routes, { initialUrl: '/communities/404/settings' });

    expect(await screen.findByText('Only a community’s owner and admins can change its settings.')).toBeTruthy();
  });

  it('opens a direct conversation as a protected full-screen route', async () => {
    getProfile.mockResolvedValue(profile(false));

    await renderRouter(routes, { initialUrl: '/messages/8' });

    expect(await screen.findByText('Conversation')).toBeTruthy();
    expect(router.canGoBack()).toBe(true);
  });
});
