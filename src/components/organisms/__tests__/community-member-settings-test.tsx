import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { CommunityMemberSettings } from '../community-member-settings';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getMembers: jest.fn(),
  setNickname: jest.fn(),
  setShowLibraryUpdates: jest.fn(),
}));

const getMembers = api.getMembers as jest.Mock;
const setNickname = api.setNickname as jest.Mock;
const setShowLibraryUpdates = api.setShowLibraryUpdates as jest.Mock;

const community: api.Community = {
  id: 5,
  name: 'Konoha',
  iconUrl: null,
  role: 'member',
  showLibraryUpdates: true,
};

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

describe('community member settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  it('keeps the nickname and library sharing read-only until the email is confirmed', async () => {
    useAuthStore.setState({ token: 'token', profile: profile(null), sessionExpired: false });
    await renderRouter({ index: () => <CommunityMemberSettings community={community} /> });

    const nickname = await screen.findByLabelText('Community nickname');
    expect(nickname.props.editable).toBe(false);
    expect(screen.getByText('Save nickname')).toBeDisabled();
    expect(screen.getByText('Confirm your email first to change your nickname.')).toBeTruthy();
    expect(screen.getByLabelText('Share library updates with Konoha')).toBeDisabled();
    expect(screen.getByText('Confirm your email first to change this.')).toBeTruthy();

    await fireEvent(screen.getByLabelText('Share library updates with Konoha'), 'valueChange', false);
    expect(setShowLibraryUpdates).not.toHaveBeenCalled();
    expect(setNickname).not.toHaveBeenCalled();
  });

  it('leaves both settings editable for confirmed accounts', async () => {
    useAuthStore.setState({
      token: 'token',
      profile: profile('2026-10-01T00:00:00.000Z'),
      sessionExpired: false,
    });
    await renderRouter({ index: () => <CommunityMemberSettings community={community} /> });

    expect((await screen.findByLabelText('Community nickname')).props.editable).toBe(true);
    expect(screen.getByLabelText('Share library updates with Konoha')).toBeEnabled();
    expect(screen.queryByText(/Confirm your email first/)).toBeNull();
  });
});
