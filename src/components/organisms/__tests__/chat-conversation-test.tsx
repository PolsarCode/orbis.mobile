import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppState } from 'react-native';

import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useMessagesStore } from '@/stores/messages-store';

import { ChatConversation } from '../chat-conversation';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: object) => createElement(View, { ...props, testID: 'keyboard-avoiding' }),
  };
});

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getConversations: jest.fn(),
  getChatHistory: jest.fn(),
  markMessagesRead: jest.fn(),
  acceptMessageRequest: jest.fn(),
  declineMessageRequest: jest.fn(),
}));

const getConversations = api.getConversations as jest.Mock;
const getChatHistory = api.getChatHistory as jest.Mock;
const markMessagesRead = api.markMessagesRead as jest.Mock;
const acceptMessageRequest = api.acceptMessageRequest as jest.Mock;

const sakura: api.ChatPerson = { userId: 2, username: 'sakura', name: 'Sakura', avatarUrl: null };
const conversation: api.Conversation = {
  id: 8,
  isGroup: false,
  name: null,
  creatorId: null,
  members: [sakura],
  lastText: 'Hi',
  lastSenderId: 2,
  lastSystem: false,
  lastAt: '2026-11-07T00:00:00.000Z',
  unread: 1,
  status: 'accepted',
};
const message: api.ChatMessage = {
  id: 12,
  senderId: 2,
  sender: sakura,
  text: 'Hi',
  system: false,
  sentAt: '2026-11-07T00:00:00.000Z',
  editedAt: null,
  replyTo: null,
  reactions: [],
};

function signIn(emailVerifiedAt: string | null = '2026-10-01T00:00:00.000Z') {
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

async function openChat(chat: api.Conversation = conversation) {
  useMessagesStore.setState({ conversations: [chat], loaded: true });
  await renderRouter(
    { 'messages/[conversationId]': () => <ChatConversation /> },
    { initialUrl: `/messages/${chat.id}` },
  );
}

describe('chat conversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    useAuthStore.setState({ token: null, profile: null, sessionExpired: false });
    getConversations.mockResolvedValue([]);
    getChatHistory.mockResolvedValue({ messages: [message], members: [], hasMore: false });
    markMessagesRead.mockResolvedValue(undefined);
    acceptMessageRequest.mockResolvedValue(undefined);
    signIn();
  });

  it('replaces the composer when the server says you can’t message this person', async () => {
    getChatHistory.mockResolvedValue({
      messages: [message],
      members: [],
      hasMore: false,
      canMessage: false,
    });

    await openChat();

    expect(await screen.findByText('You can’t message this person.')).toBeTruthy();
    expect(await screen.findByText('Hi')).toBeTruthy();
    expect(screen.queryByLabelText('Message Sakura')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a reaction' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Reply to/ })).toBeNull();
  });

  it('lets you accept a message request from someone who isn’t a friend', async () => {
    await openChat({ ...conversation, status: 'request' });

    expect(await screen.findByText(
      'Sakura isn’t one of your friends. Accept to move this conversation to your chats, or delete the request.',
    )).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add a reaction' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(acceptMessageRequest).toHaveBeenCalledWith('token', 8));
  });

  it('marks an unread chat read once it is open', async () => {
    await openChat();

    await waitFor(() => expect(markMessagesRead).toHaveBeenCalledWith('token', 8));
  });

  it('keeps the chat read-only until the email is confirmed', async () => {
    signIn(null);

    await openChat();

    expect(await screen.findByText('Confirm your email to send messages.')).toBeTruthy();
    expect(await screen.findByText('Hi')).toBeTruthy();
    expect(screen.queryByLabelText('Message Sakura')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a reaction' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Reply to/ })).toBeNull();
    expect(markMessagesRead).not.toHaveBeenCalled();
  });

  it('keeps message requests unanswered until the email is confirmed', async () => {
    signIn(null);

    await openChat({ ...conversation, status: 'request' });

    expect(await screen.findByText('Confirm your email first to answer message requests.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Accept', disabled: true }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete request', disabled: true }));

    expect(acceptMessageRequest).not.toHaveBeenCalled();
    expect(api.declineMessageRequest).not.toHaveBeenCalled();
  });

  it('shows a placeholder when a reply quotes someone you blocked', async () => {
    getChatHistory.mockResolvedValue({
      messages: [{
        ...message,
        id: 13,
        senderId: 1,
        sender: { userId: 1, username: 'naruto', name: null, avatarUrl: null },
        text: 'Replying anyway',
        replyTo: {
          id: 11,
          senderId: 3,
          sender: { userId: 3, username: 'sasuke', name: null, avatarUrl: null },
          text: '',
          hiddenBecause: { kind: 'blocked' },
        },
      }],
      members: [],
      hasMore: false,
    });

    await openChat();

    expect(await screen.findByText('Replying anyway')).toBeTruthy();
    expect(screen.getByText('Message from someone you blocked')).toBeTruthy();
    expect(screen.queryByText('sasuke')).toBeNull();
  });

  it('offsets the keyboard by the chat header', async () => {
    useMessagesStore.setState({ conversations: [conversation], loaded: true });
    await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: true }} />,
        'messages/[conversationId]': () => <ChatConversation />,
      },
      { initialUrl: `/messages/${conversation.id}` },
    );

    expect(await screen.findByText('Hi')).toBeTruthy();
    expect(screen.getByTestId('keyboard-avoiding').props.keyboardVerticalOffset).toBeGreaterThan(0);
  });
});
