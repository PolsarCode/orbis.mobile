import { io, type Socket } from 'socket.io-client';

import * as api from '@/lib/api';
import { markConversationViewing, useMessagesStore } from '@/stores/messages-store';
import { useAuthStore } from '@/stores/auth-store';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

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
