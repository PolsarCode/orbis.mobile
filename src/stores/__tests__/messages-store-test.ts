import { io, type Socket } from 'socket.io-client';

import * as api from '@/lib/api';
import type { Profile } from '@/lib/api';
import { markConversationViewing, useMessagesStore } from '@/stores/messages-store';
import { useAuthStore } from '@/stores/auth-store';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

async function waitForHistory(id: number, ids: number[]) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = useMessagesStore.getState().histories[id]?.messages.map((item) => item.id) ?? [];
    if (current.join() === ids.join()) return;
    await Promise.resolve();
  }
}

describe('messages store', () => {
  const handlers: Record<string, (payload?: unknown) => void> = {};
  const socket = {
    on: jest.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = handler;
      return socket;
    }),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
  } as unknown as Socket;
  const ioMock = jest.mocked(io);
  const getConversations = jest.spyOn(api, 'getConversations');
  const getChatHistory = jest.spyOn(api, 'getChatHistory');
  const markMessagesRead = jest.spyOn(api, 'markMessagesRead');

  const conversation: api.Conversation = {
    id: 8,
    isGroup: false,
    name: null,
    creatorId: null,
    members: [{ userId: 2, username: 'sakura', name: null, avatarUrl: null }],
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
    sender: conversation.members[0],
    text: 'Hi',
    system: false,
    sentAt: '2026-11-07T00:00:00.000Z',
    editedAt: null,
    replyTo: null,
    reactions: [],
  };

  beforeEach(() => {
    useAuthStore.setState({ token: null, profile: null });
    ioMock.mockReset();
    ioMock.mockReturnValue(socket);
    getConversations.mockReset();
    getConversations.mockResolvedValue([]);
    getChatHistory.mockReset();
    getChatHistory.mockResolvedValue({ messages: [message], members: [], hasMore: false });
    markMessagesRead.mockReset();
    markMessagesRead.mockResolvedValue();
    Object.keys(handlers).forEach((key) => delete handlers[key]);
    socket.on = jest.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = handler;
      return socket;
    }) as Socket['on'];
    socket.emit = jest.fn();
    socket.connect = jest.fn();
    socket.disconnect = jest.fn();
    socket.removeAllListeners = jest.fn();
  });

  afterEach(() => {
    markConversationViewing(8, false);
    useAuthStore.setState({ token: null, profile: null });
    jest.clearAllMocks();
  });

  it('connects with the auth token and refreshes the inbox on connect', async () => {
    useAuthStore.setState({ token: 'session-token' });
    useMessagesStore.getState().connect();

    expect(ioMock).toHaveBeenCalledWith(expect.any(String), {
      auth: { token: 'session-token' },
      autoConnect: false,
    });
    handlers.connect?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(getConversations).toHaveBeenCalledWith('session-token');
    expect(useMessagesStore.getState().connected).toBe(true);
  });

  it('retries an inbox refresh if a socket update arrives during the request', async () => {
    let resolveList: (value: api.Conversation[]) => void = () => undefined;
    getConversations
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveList = resolve;
      }))
      .mockResolvedValueOnce([conversation]);
    useAuthStore.setState({ token: 'session-token' });

    const request = useMessagesStore.getState().refresh();
    useMessagesStore.getState().upsert(conversation);
    resolveList([]);
    await request;

    expect(getConversations).toHaveBeenCalledTimes(2);
    expect(useMessagesStore.getState().conversations).toEqual([conversation]);
    expect(useMessagesStore.getState().loaded).toBe(true);
  });

  it('deduplicates echoed socket messages and marks a viewed conversation read', async () => {
    useAuthStore.setState({ token: 'session-token' });
    useMessagesStore.setState({
      conversations: [conversation],
      histories: {
        8: { messages: [], members: [], hasMore: false },
      },
    });
    markConversationViewing(8, true);

    useMessagesStore.getState().receive({ conversation, message });
    useMessagesStore.getState().receive({ conversation, message });
    await Promise.resolve();

    expect(useMessagesStore.getState().histories[8].messages).toEqual([message]);
    expect(markMessagesRead).toHaveBeenCalledWith('session-token', 8);
  });

  it('merges paginated history without duplicating realtime messages', async () => {
    const older = { ...message, id: 11, text: 'Earlier', sentAt: '2026-11-06T00:00:00.000Z' };
    getChatHistory.mockResolvedValueOnce({ messages: [older, message], members: [], hasMore: true });
    getChatHistory.mockResolvedValueOnce({ messages: [older], members: [], hasMore: false });
    useAuthStore.setState({ token: 'session-token' });
    await useMessagesStore.getState().loadHistory(8);
    useMessagesStore.getState().receive({ conversation, message });
    await useMessagesStore.getState().loadOlder(8);

    expect(getChatHistory).toHaveBeenNthCalledWith(2, 'session-token', 8, 11);
    expect(useMessagesStore.getState().histories[8].messages.map(({ id }) => id)).toEqual([11, 12]);
    expect(useMessagesStore.getState().histories[8].hasMore).toBe(false);
  });

  it('keeps unread state until the server confirms the read update', async () => {
    useAuthStore.setState({ token: 'session-token' });
    useMessagesStore.setState({ conversations: [conversation] });
    markMessagesRead.mockRejectedValueOnce(new Error('Could not mark messages as read.'));

    await expect(useMessagesStore.getState().markRead(8)).rejects.toThrow(
      'Could not mark messages as read.',
    );
    expect(useMessagesStore.getState().conversations[0].unread).toBe(1);
    expect(useMessagesStore.getState().error).toBe('Could not mark messages as read.');

    await useMessagesStore.getState().markRead(8);
    expect(useMessagesStore.getState().conversations[0].unread).toBe(0);
    expect(useMessagesStore.getState().error).toBeNull();
  });

  it('refetches the open chat on reconnect and drops other cached chats', async () => {
    const missed = { ...message, id: 13, text: 'Are you there?', sentAt: '2026-11-07T00:05:00.000Z' };
    useAuthStore.setState({ token: 'session-token' });
    useMessagesStore.getState().connect();
    handlers.connect?.();
    await useMessagesStore.getState().loadHistory(8);
    markConversationViewing(8, true);
    useMessagesStore.setState((state) => ({
      histories: { ...state.histories, 9: { messages: [{ ...message, id: 40 }], members: [], hasMore: false } },
    }));

    useMessagesStore.getState().disconnect();
    getChatHistory.mockClear();
    getChatHistory.mockResolvedValueOnce({ messages: [message, missed], members: [], hasMore: false });
    useMessagesStore.getState().connect();
    handlers.connect?.();
    await waitForHistory(8, [12, 13]);

    expect(getChatHistory).toHaveBeenCalledTimes(1);
    expect(getChatHistory).toHaveBeenCalledWith('session-token', 8);
    expect(useMessagesStore.getState().histories[8].messages.map(({ id }) => id)).toEqual([12, 13]);
    expect(useMessagesStore.getState().histories[9]).toBeUndefined();
  });

  it('replaces a chat that can’t join the latest page and ignores an older page in flight', async () => {
    const older = { ...message, id: 5, sentAt: '2026-11-06T00:00:00.000Z' };
    const latest = { ...message, id: 90, sentAt: '2026-11-07T01:00:00.000Z' };
    const live = { ...message, id: 91, sentAt: '2026-11-07T01:01:00.000Z' };
    let resolveOlder: (value: api.ChatHistory) => void = () => undefined;
    let resolveLatest: (value: api.ChatHistory) => void = () => undefined;
    getChatHistory
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveOlder = resolve;
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveLatest = resolve;
      }));
    useAuthStore.setState({ token: 'session-token' });
    useMessagesStore.setState({
      histories: { 8: { messages: [message], members: [], hasMore: true } },
    });
    markConversationViewing(8, true);

    const olderRequest = useMessagesStore.getState().loadOlder(8);
    useMessagesStore.getState().connect();
    handlers.connect?.();
    useMessagesStore.getState().receive({ conversation, message: live });
    resolveLatest({ messages: [latest], members: [], hasMore: true });
    await waitForHistory(8, [90, 91]);
    resolveOlder({ messages: [older], members: [], hasMore: false });
    await olderRequest;

    expect(useMessagesStore.getState().histories[8]).toMatchObject({
      messages: [latest, live],
      hasMore: true,
      loadingOlder: false,
    });
  });

  it('says live updates stopped when the server closes the socket, until it reconnects', () => {
    useAuthStore.setState({ token: 'session-token' });
    useMessagesStore.getState().connect();
    handlers.connect?.();

    handlers.disconnect?.('transport close');
    expect(useMessagesStore.getState()).toMatchObject({ connected: false, connectionError: null });

    handlers.disconnect?.('io server disconnect');
    expect(useMessagesStore.getState().connectionError).toBe(
      'Live updates stopped. Reopen Orbis to reconnect.',
    );

    useMessagesStore.getState().disconnect();
    expect(useMessagesStore.getState().connectionError).toBeNull();
    useMessagesStore.getState().connect();
    handlers.connect?.();
    expect(useMessagesStore.getState()).toMatchObject({ connected: true, connectionError: null });
  });

  it('applies edits and reactions to the open history', async () => {
    const editMessage = jest.spyOn(api, 'editMessage');
    const reactToMessage = jest.spyOn(api, 'reactToMessage');
    const edited = { ...message, text: 'Hi there', editedAt: '2026-11-07T00:01:00.000Z' };
    const reacted = { ...edited, reactions: [{ emoji: '👍', userIds: [1] }] };
    editMessage.mockResolvedValueOnce(edited);
    reactToMessage.mockResolvedValueOnce(reacted);
    useAuthStore.setState({ token: 'session-token' });
    useMessagesStore.setState({
      histories: { 8: { messages: [message], members: [], hasMore: false } },
    });

    await useMessagesStore.getState().edit(8, 12, 'Hi there');
    expect(editMessage).toHaveBeenCalledWith('session-token', 8, 12, 'Hi there');
    expect(useMessagesStore.getState().histories[8].messages[0]).toEqual(edited);

    await useMessagesStore.getState().react(8, 12, '👍');
    expect(reactToMessage).toHaveBeenCalledWith('session-token', 8, 12, '👍');
    expect(useMessagesStore.getState().histories[8].messages[0]).toEqual(reacted);
  });

  it('stops showing someone as typing after a few seconds', () => {
    jest.useFakeTimers();
    try {
      useMessagesStore.getState().setTyping({ conversationId: 8, userId: 2, typing: true });
      expect(useMessagesStore.getState().typing[8]).toEqual([2]);

      jest.advanceTimersByTime(5999);
      expect(useMessagesStore.getState().typing[8]).toEqual([2]);
      jest.advanceTimersByTime(1);
      expect(useMessagesStore.getState().typing[8]).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('removes a declined request from the inbox and its history', async () => {
    const declineMessageRequest = jest.spyOn(api, 'declineMessageRequest');
    declineMessageRequest.mockResolvedValueOnce();
    useAuthStore.setState({ token: 'session-token' });
    useMessagesStore.setState({
      conversations: [{ ...conversation, status: 'request' }],
      histories: { 8: { messages: [message], members: [], hasMore: false } },
    });

    await useMessagesStore.getState().declineRequest(8);

    expect(declineMessageRequest).toHaveBeenCalledWith('session-token', 8);
    expect(useMessagesStore.getState().conversations).toEqual([]);
    expect(useMessagesStore.getState().histories[8]).toBeUndefined();
  });

  it('does not mark messages read while the email is unconfirmed', async () => {
    useAuthStore.setState({
      token: 'session-token',
      profile: { userId: 1, emailVerifiedAt: null } as Profile,
    });
    useMessagesStore.setState({ conversations: [conversation] });

    await useMessagesStore.getState().markRead(8);

    expect(markMessagesRead).not.toHaveBeenCalled();
    expect(useMessagesStore.getState().conversations[0].unread).toBe(1);
  });

  it('clears private message data and closes the socket on account change', () => {
    useAuthStore.setState({ token: 'first-token' });
    useMessagesStore.getState().connect();
    useMessagesStore.setState({ conversations: [conversation] });

    useAuthStore.setState({ token: 'second-token' });

    expect(socket.removeAllListeners).toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(useMessagesStore.getState().conversations).toEqual([]);
    expect(useMessagesStore.getState().loaded).toBe(false);
  });
});
