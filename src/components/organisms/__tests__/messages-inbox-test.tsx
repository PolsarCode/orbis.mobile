import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useMessagesStore } from '@/stores/messages-store';

import { MessagesInbox } from '../messages-inbox';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getConversations: jest.fn(),
  searchChatPeople: jest.fn(),
  openDirectChat: jest.fn(),
}));

const getConversations = api.getConversations as jest.Mock;
const searchChatPeople = api.searchChatPeople as jest.Mock;
const openDirectChat = api.openDirectChat as jest.Mock;

function signIn(emailVerifiedAt: string | null) {
  useAuthStore.setState({
    token: 'token',
    sessionExpired: false,
    profile: {
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
    },
  });
}

describe('messages inbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ token: null, profile: null, sessionExpired: false });
    getConversations.mockResolvedValue([]);
    searchChatPeople.mockResolvedValue([
      { userId: 2, username: 'sakura', name: 'Sakura', avatarUrl: null },
    ]);
  });

  it('keeps starting a chat disabled until the email is confirmed', async () => {
    signIn(null);

    await renderRouter({ index: () => <MessagesInbox /> });
    expect(screen.queryByText('Confirm your email first to send messages.')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Search people to message'), 'sakura');
    expect(await screen.findByText('Sakura')).toBeTruthy();
    expect(screen.getByText('Confirm your email first to send messages.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Message', disabled: true }));

    expect(openDirectChat).not.toHaveBeenCalled();
  });

  it('still opens an existing chat before the email is confirmed', async () => {
    signIn(null);
    getConversations.mockResolvedValue([{
      id: 8,
      isGroup: false,
      name: null,
      creatorId: null,
      members: [{ userId: 2, username: 'sakura', name: 'Sakura', avatarUrl: null }],
      lastText: 'Hi',
      lastSenderId: 2,
      lastSystem: false,
      lastAt: '2026-11-07T00:00:00.000Z',
      unread: 0,
      status: 'accepted',
    }]);

    await renderRouter({ index: () => <MessagesInbox />, 'messages/[conversationId]': () => null });
    expect(await screen.findByRole('button', { name: /^Sakura\. Hi/ })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search people to message'), 'sakura');
    await fireEvent.press(await screen.findByRole('button', { name: 'Message', disabled: false }));

    expect(screen.queryByText('Confirm your email first to send messages.')).toBeNull();
    expect(openDirectChat).not.toHaveBeenCalled();
    await waitFor(() => expect(screen).toHavePathname('/messages/8'));
  });

  it('says when live updates need the app reopened', async () => {
    signIn('2026-10-01T00:00:00.000Z');
    useMessagesStore.setState({
      connected: false,
      connectionError: 'Live updates stopped. Reopen Orbis to reconnect.',
    });

    await renderRouter({ index: () => <MessagesInbox /> });

    expect(screen.getByText('Live updates stopped. Reopen Orbis to reconnect.')).toBeTruthy();
    expect(screen.queryByText('Live updates reconnect when your connection is available.')).toBeNull();
  });

  it('starts a chat once the email is confirmed', async () => {
    signIn('2026-10-01T00:00:00.000Z');
    openDirectChat.mockResolvedValue({
      id: 8,
      isGroup: false,
      name: null,
      creatorId: null,
      members: [{ userId: 2, username: 'sakura', name: 'Sakura', avatarUrl: null }],
      lastText: null,
      lastSenderId: null,
      lastSystem: false,
      lastAt: '2026-11-07T00:00:00.000Z',
      unread: 0,
      status: 'accepted',
    });

    await renderRouter({ index: () => <MessagesInbox />, 'messages/[conversationId]': () => null });
    expect(screen.queryByText('Confirm your email first to send messages.')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Search people to message'), 'sakura');
    await fireEvent.press(await screen.findByRole('button', { name: 'Message' }));

    await waitFor(() => expect(openDirectChat).toHaveBeenCalledWith('token', 2));
  });
});
