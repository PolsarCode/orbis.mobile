import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { CommunityExplorer } from '../community-explorer';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getCommunities: jest.fn(),
  getProfile: jest.fn(),
  getRailLayout: jest.fn(),
  joinCommunity: jest.fn(),
  searchCommunities: jest.fn(),
}));

const getCommunities = api.getCommunities as jest.Mock;
const getProfile = api.getProfile as jest.Mock;
const getRailLayout = api.getRailLayout as jest.Mock;
const joinCommunity = api.joinCommunity as jest.Mock;
const searchCommunities = api.searchCommunities as jest.Mock;

function profile(emailVerifiedAt: string | null): api.Profile {
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
    isAdmin: false,
    isHeadAdmin: false,
    emailVerifiedAt,
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}

async function openExplore() {
  await renderRouter({
    index: () => <CommunityExplorer />,
    'communities/create': () => <Text>Create screen</Text>,
  });
  expect(await screen.findByText(/Konoha/)).toBeTruthy();
}

describe('community explorer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCommunities.mockResolvedValue([]);
    getRailLayout.mockResolvedValue([]);
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
  });

  it('keeps creating and joining disabled until the email is confirmed', async () => {
    useAuthStore.setState({ token: 'token', profile: profile(null), sessionExpired: false });
    await openExplore();

    expect(screen.getByText('Create')).toBeDisabled();
    expect(screen.getByText('Confirm your email first to create a community.')).toBeTruthy();
    expect(screen.getByText('Confirm email to join')).toBeDisabled();
    await fireEvent.press(screen.getByText('Create'));
    await fireEvent.press(screen.getByText('Confirm email to join'));

    expect(screen.queryByText('Create screen')).toBeNull();
    expect(joinCommunity).not.toHaveBeenCalled();
  });

  it('opens community creation for confirmed accounts', async () => {
    useAuthStore.setState({
      token: 'token',
      profile: profile('2026-10-01T00:00:00.000Z'),
      sessionExpired: false,
    });
    await openExplore();

    expect(screen.queryByText('Confirm your email first to create a community.')).toBeNull();
    expect(screen.getByText('Join')).toBeEnabled();
    await fireEvent.press(screen.getByText('Create'));

    expect(await screen.findByText('Create screen')).toBeTruthy();
  });

  it('still holds joining back while the account is being checked', async () => {
    getProfile.mockReturnValue(new Promise(() => undefined));
    useAuthStore.setState({ token: 'token', profile: null, sessionExpired: false });
    await openExplore();

    expect(screen.getByText('Confirm email to join')).toBeDisabled();
    expect(screen.getByText('Create')).toBeEnabled();
  });
});
