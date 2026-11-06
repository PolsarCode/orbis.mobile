import { Alert, Platform, Share } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { CommunityInvites } from '../community-invites';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  createInvite: jest.fn(),
  createPermanentInvite: jest.fn(),
  getInvites: jest.fn(),
  revokeInvite: jest.fn(),
  setInviteEnabled: jest.fn(),
}));

const createInvite = api.createInvite as jest.Mock;
const createPermanentInvite = api.createPermanentInvite as jest.Mock;
const getInvites = api.getInvites as jest.Mock;
const revokeInvite = api.revokeInvite as jest.Mock;
const setInviteEnabled = api.setInviteEnabled as jest.Mock;

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

function invite(overrides: Partial<api.Invite> = {}): api.Invite {
  return {
    code: 'leaf1234',
    maxUses: null,
    uses: 0,
    expiresAt: null,
    permanent: false,
    disabledAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    creator: { id: 1, username: 'naruto', name: 'Naruto', avatarUrl: null },
    ...overrides,
  };
}

async function openInvites() {
  await renderRouter({
    index: () => <CommunityInvites communityId="5" communityName="Konoha" />,
  });
  expect(await screen.findByText('Konoha invites')).toBeTruthy();
}

describe('community invites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      token: 'token',
      profile: profile('2026-10-01T00:00:00.000Z'),
      sessionExpired: false,
    });
    getInvites.mockResolvedValue([
      invite(),
      invite({ code: 'card', permanent: true }),
    ]);
  });

  it('asks before revoking a link and shows it as pending until the server answers', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let finish: () => void = () => undefined;
    revokeInvite.mockReturnValue(new Promise<void>((resolve) => {
      finish = resolve;
    }));
    await openInvites();

    await fireEvent.press(screen.getByLabelText('Revoke invite leaf1234'));
    expect(revokeInvite).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][0]).toBe('Revoke invite leaf1234?');
    const buttons = alert.mock.calls[0][2] ?? [];
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Revoke']);

    await act(async () => buttons.find((button) => button.text === 'Revoke')?.onPress?.());
    expect(revokeInvite).toHaveBeenCalledWith('token', 5, 'leaf1234');
    expect(screen.getByLabelText('Revoke invite leaf1234')).toBeDisabled();

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByText('leaf1234')).toBeNull());
    expect(screen.getByText('No active invite links.')).toBeTruthy();
    alert.mockRestore();
  });

  it('keeps the link when revoking is canceled', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await openInvites();

    await fireEvent.press(screen.getByLabelText('Revoke invite leaf1234'));
    const buttons = alert.mock.calls[0][2] ?? [];
    await act(async () => buttons.find((button) => button.text === 'Cancel')?.onPress?.());

    expect(revokeInvite).not.toHaveBeenCalled();
    expect(screen.getByText('leaf1234')).toBeTruthy();
    alert.mockRestore();
  });

  it('shares the invite link once instead of as both a message and a URL', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await openInvites();

    await fireEvent.press(screen.getAllByText('Share')[0]);

    expect(share).toHaveBeenCalledWith({
      title: 'Community invite',
      url: `${api.WEB_URL}/invite/leaf1234`,
    });
    share.mockRestore();
  });

  it('shares the invite link as the message on Android, which ignores URLs', async () => {
    const platform = Platform.OS;
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    try {
      await openInvites();
      Platform.OS = 'android';

      await fireEvent.press(screen.getAllByText('Share')[0]);

      expect(share).toHaveBeenCalledWith({
        title: 'Community invite',
        message: `${api.WEB_URL}/invite/leaf1234`,
      });
    } finally {
      Platform.OS = platform;
      share.mockRestore();
    }
    expect(Platform.OS).toBe(platform);
  });

  it('lets unconfirmed accounts share links but not create, revoke or toggle them', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useAuthStore.setState({ profile: profile(null) });
    await openInvites();

    expect(screen.getByText('Generate invite link')).toBeDisabled();
    expect(screen.getByLabelText('Revoke invite leaf1234')).toBeDisabled();
    expect(screen.getByText('Turn off')).toBeDisabled();
    expect(screen.getAllByText('Share')[0]).toBeEnabled();
    expect(screen.getByText('Confirm your email first to create or revoke invite links.')).toBeTruthy();
    expect(screen.getByText('Confirm your email first to change the permanent invite.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Generate invite link'));
    await fireEvent.press(screen.getByLabelText('Revoke invite leaf1234'));
    await fireEvent.press(screen.getByText('Turn off'));
    expect(createInvite).not.toHaveBeenCalled();
    expect(setInviteEnabled).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('keeps permanent invite creation disabled for unconfirmed accounts', async () => {
    useAuthStore.setState({ profile: profile(null) });
    getInvites.mockResolvedValue([]);
    await openInvites();

    expect(screen.getByText('Create permanent invite')).toBeDisabled();
    await fireEvent.press(screen.getByText('Create permanent invite'));
    expect(createPermanentInvite).not.toHaveBeenCalled();
  });
});
