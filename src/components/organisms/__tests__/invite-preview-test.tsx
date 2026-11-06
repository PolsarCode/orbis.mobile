import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { InvitePreview } from '../invite-preview';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  acceptInvite: jest.fn(),
  getCommunity: jest.fn(),
  getInvitePreview: jest.fn(),
}));

const acceptInvite = api.acceptInvite as jest.Mock;
const getCommunity = api.getCommunity as jest.Mock;
const getInvitePreview = api.getInvitePreview as jest.Mock;

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

const preview: api.InvitePreview = {
  code: 'leaf1234',
  expiresAt: null,
  creator: { id: 2, username: 'sakura', name: 'Sakura', avatarUrl: null },
  community: {
    id: 5,
    name: 'Konoha',
    iconUrl: null,
    coverUrl: null,
    backgroundUrl: null,
    isPublic: false,
    isVerified: false,
    memberCount: 12,
  },
};

async function openInvite() {
  await renderRouter(
    {
      index: () => <Text>Home</Text>,
      'invite/[code]': () => <InvitePreview code="leaf1234" />,
      'communities/[communityId]': () => <Text>Opened community</Text>,
      login: () => <Text>Log in screen</Text>,
    },
    { initialUrl: '/invite/leaf1234' },
  );
}

describe('invite preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      token: 'token',
      profile: profile('2026-10-01T00:00:00.000Z'),
      sessionExpired: false,
    });
    getInvitePreview.mockResolvedValue(preview);
    getCommunity.mockResolvedValue(null);
    acceptInvite.mockResolvedValue({ id: 5, name: 'Konoha', iconUrl: null });
  });

  it('joins the invited community and opens it', async () => {
    await openInvite();

    await fireEvent.press(await screen.findByText('Join community'));

    expect(acceptInvite).toHaveBeenCalledWith('token', 'leaf1234');
    expect(await screen.findByText('Opened community')).toBeTruthy();
    expect(getCommunity).toHaveBeenCalledWith('token', '5');
  });

  it('explains that an expired, used up or revoked invite no longer works', async () => {
    getInvitePreview.mockResolvedValue(null);
    await openInvite();

    expect(await screen.findByText('Invite invalid.')).toBeTruthy();
    expect(screen.getByText(/may have expired, reached its limit, or been revoked/)).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
    await fireEvent.press(screen.getByText('Go to Orbis'));
    expect(await screen.findByText('Home')).toBeTruthy();
  });

  it('offers a retry when the invite could not be loaded', async () => {
    getInvitePreview
      .mockRejectedValueOnce(new Error('Could not load the invite.'))
      .mockResolvedValueOnce(preview);
    await openInvite();

    expect(await screen.findByText('Could not load the invite.')).toBeTruthy();
    expect(screen.queryByText('Invite invalid.')).toBeNull();
    await fireEvent.press(screen.getByText('Try again'));

    expect(await screen.findByText('Join Konoha')).toBeTruthy();
  });

  it('sends existing members to the community instead of joining again', async () => {
    getCommunity.mockResolvedValue({ id: 5, name: 'Konoha', iconUrl: null, role: 'member' });
    await openInvite();

    expect(await screen.findByText('You’re already a member of Konoha.')).toBeTruthy();
    expect(screen.queryByText('Join community')).toBeNull();
    await fireEvent.press(screen.getByText('Open community'));

    expect(await screen.findByText('Opened community')).toBeTruthy();
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('keeps joining disabled until the email is confirmed', async () => {
    useAuthStore.setState({ profile: profile(null) });
    await openInvite();

    expect(await screen.findByText('Confirm your email first to join.')).toBeTruthy();
    expect(screen.getByText('Open the link we emailed you, then come back to this invite.')).toBeTruthy();
    expect(screen.getByText('Join community')).toBeDisabled();
    await fireEvent.press(screen.getByText('Join community'));

    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('asks signed-out visitors to log in without checking membership', async () => {
    useAuthStore.setState({ token: null, profile: null });
    await openInvite();

    await fireEvent.press(await screen.findByText('Log in to join'));

    expect(await screen.findByText('Log in screen')).toBeTruthy();
    await waitFor(() => expect(getCommunity).not.toHaveBeenCalled());
  });
});
