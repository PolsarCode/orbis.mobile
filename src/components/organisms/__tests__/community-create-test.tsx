import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { CommunityCreate } from '../community-create';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  createCommunity: jest.fn(),
}));

const createCommunity = api.createCommunity as jest.Mock;

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

describe('community creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      token: 'token',
      profile: profile('2026-10-01T00:00:00.000Z'),
      sessionExpired: false,
    });
  });

  it('creates a private community and opens it', async () => {
    createCommunity.mockResolvedValue({ id: 8, name: 'Konoha', isPublic: false });
    await renderRouter({
      index: () => <CommunityCreate />,
      'communities/[communityId]': () => <Text>Opened community</Text>,
    });

    await fireEvent.changeText(screen.getByLabelText('Community name'), 'Konoha');
    await fireEvent.press(screen.getByLabelText('Public community'));
    await fireEvent.press(screen.getByText('Create community'));

    await waitFor(() => {
      expect(createCommunity).toHaveBeenCalledWith('token', 'Konoha', false);
    });
    expect(await screen.findByText('Opened community')).toBeTruthy();
  });

  it('shows server creation errors without navigating away', async () => {
    createCommunity.mockRejectedValue(new Error('You can’t create more communities.'));
    await renderRouter({ index: () => <CommunityCreate /> });

    await fireEvent.changeText(screen.getByLabelText('Community name'), 'Konoha');
    await fireEvent.press(screen.getByText('Create community'));

    expect(await screen.findByText('You can’t create more communities.')).toBeTruthy();
  });

  it('asks unconfirmed accounts to confirm their email before creating', async () => {
    useAuthStore.setState({ profile: profile(null) });
    await renderRouter({ index: () => <CommunityCreate /> });

    await fireEvent.changeText(screen.getByLabelText('Community name'), 'Konoha');
    expect(screen.getByText('Confirm your email first to create a community.')).toBeTruthy();
    expect(screen.getByText('Create community')).toBeDisabled();
    await fireEvent(screen.getByLabelText('Community name'), 'submitEditing');

    expect(createCommunity).not.toHaveBeenCalled();
  });
});
