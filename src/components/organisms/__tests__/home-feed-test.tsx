import { renderRouter, screen } from 'expo-router/testing-library';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { HomeFeed } from '../home-feed';

jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: object) => createElement(View, { ...props, testID: 'keyboard-avoiding' }),
  };
});

jest.mock('@/lib/storage', () => ({
  secureStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getFeed: jest.fn(),
  getCommunities: jest.fn(),
}));

const getFeed = api.getFeed as jest.Mock;
const getCommunities = api.getCommunities as jest.Mock;

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

const repost: api.Post = {
  type: 'post',
  id: 1,
  communityId: null,
  content: '<p>Worth reading</p>',
  linkUrl: null,
  spoiler: null,
  commentCount: 0,
  likeCount: 0,
  liked: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  author: { id: 8, username: 'naruto', name: 'Naruto', avatarUrl: null },
  community: null,
  wallUser: null,
  repostedBy: { people: [{ id: 9, username: 'hinata', name: 'Hinata', avatarUrl: null }], total: 1 },
  quote: { available: false },
};

describe('home feed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getFeed.mockResolvedValue({ items: [repost], nextCursor: null });
    getCommunities.mockResolvedValue([]);
    useAuthStore.setState({
      token: 'token',
      sessionExpired: false,
      profile,
      preferencesPending: false,
    });
  });

  it('shows reposts and quotes from the server feed', async () => {
    await renderRouter({ index: HomeFeed });

    expect(await screen.findByText('Reposted by Hinata')).toBeTruthy();
    expect(screen.getByText('Worth reading')).toBeTruthy();
    expect(screen.getByText('This post isn’t available')).toBeTruthy();
  });

  it('keeps the composers above the keyboard', async () => {
    await renderRouter({ index: HomeFeed });

    expect(await screen.findByLabelText('What’s on your mind?')).toBeTruthy();
    expect(screen.getByTestId('keyboard-avoiding').props.behavior).toBe('padding');
  });
});
