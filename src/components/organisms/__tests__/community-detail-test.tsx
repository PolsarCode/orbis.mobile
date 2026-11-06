import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { CommunityDetail } from '../community-detail';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getCommunity: jest.fn(),
  getCommunityPosts: jest.fn(),
}));

const getCommunity = api.getCommunity as jest.Mock;
const getCommunityPosts = api.getCommunityPosts as jest.Mock;

const profile: api.Profile = {
  userId: 7,
  username: 'sakura',
  email: 'sakura@example.test',
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

function community(role: api.CommunityRole | null): api.Community {
  return {
    id: 4,
    name: 'Konoha',
    iconUrl: null,
    role,
    description: 'Hidden Leaf',
    isPublic: true,
    memberCount: 12,
  };
}

async function openCommunity() {
  await renderRouter({ index: () => <CommunityDetail communityId="4" /> });
  expect(await screen.findByText('Konoha')).toBeTruthy();
  expect(await screen.findByText('No community activity yet.')).toBeTruthy();
}

describe('community detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCommunityPosts.mockResolvedValue({ items: [], nextCursor: null });
    useAuthStore.setState({ token: 'token', sessionExpired: false, profile });
  });

  it('offers the composer and member pages to members', async () => {
    getCommunity.mockResolvedValue(community('member'));

    await openCommunity();

    expect(screen.getByLabelText('Share something with Konoha…')).toBeTruthy();
    expect(screen.getByText('Members')).toBeTruthy();
    expect(screen.getByText('Your settings')).toBeTruthy();
  });

  it('asks an unconfirmed member to confirm their email instead of hiding the composer', async () => {
    useAuthStore.setState({ profile: { ...profile, emailVerifiedAt: null } });
    getCommunity.mockResolvedValue(community('member'));

    await openCommunity();

    expect(screen.getByText('Confirm your email to start posting.')).toBeTruthy();
    expect(screen.queryByLabelText('Share something with Konoha…')).toBeNull();
  });

  it('sends signed-out visitors to log in instead of a disabled Join button', async () => {
    useAuthStore.setState({ token: null, profile: null });
    getCommunity.mockResolvedValue(community(null));
    await renderRouter(
      {
        'communities/[communityId]': () => <CommunityDetail communityId="4" />,
        login: () => <Text>Login screen</Text>,
      },
      { initialUrl: '/communities/4' },
    );

    expect(await screen.findByText(
      'Log in to join this community, post, comment, and take part in discussions.',
    )).toBeTruthy();
    expect(screen.queryByText('Checking account…')).toBeNull();
    expect(screen.queryByText('Join community')).toBeNull();

    await fireEvent.press(screen.getByText('Log in to join'));

    expect(await screen.findByText('Login screen')).toBeTruthy();
    expect(screen).toHavePathnameWithParams(`/login?next=${encodeURIComponent('/communities/4')}`);
  });

  it('shows member pages only to people with a role', async () => {
    getCommunity.mockResolvedValue(community(null));

    await openCommunity();

    expect(screen.getByText('Join community')).toBeTruthy();
    expect(screen.queryByText('Members')).toBeNull();
    expect(screen.queryByText('Your settings')).toBeNull();
    expect(screen.queryByLabelText('Share something with Konoha…')).toBeNull();
  });
});
