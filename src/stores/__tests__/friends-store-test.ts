import { io, type Socket } from 'socket.io-client';

import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

describe('friends store socket lifecycle', () => {
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
  const getFriends = jest.spyOn(api, 'getFriends');

  beforeEach(() => {
    useAuthStore.setState({ token: null });
    ioMock.mockReset();
    ioMock.mockReturnValue(socket);
    getFriends.mockReset();
    getFriends.mockResolvedValue({ friends: [], incoming: [], outgoing: [] });
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
    useAuthStore.setState({ token: null });
    jest.clearAllMocks();
  });

  it('connects with the session token, loads the list, and applies presence events', async () => {
    useAuthStore.setState({ token: 'session-token' });
    useFriendsStore.getState().connect();

    expect(ioMock).toHaveBeenCalledWith(api.API_URL, {
      auth: expect.any(Function),
      autoConnect: false,
    });
    const handshake = jest.fn();
    (ioMock.mock.calls[0][1]?.auth as (cb: (data: object) => void) => void)(handshake);
    expect(handshake).toHaveBeenCalledWith({ token: 'session-token', platform: 'mobile', idle: false });
    expect(socket.connect).toHaveBeenCalledTimes(1);

    handlers.connect?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(getFriends).toHaveBeenCalledWith('session-token');
    expect(socket.emit).toHaveBeenCalledWith('idle', false);

    handlers['friends:changed']?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(getFriends).toHaveBeenCalledTimes(2);

    useFriendsStore.setState({
      friends: [{
        userId: 7,
        username: 'sakura',
        name: null,
        avatarUrl: null,
        online: true,
        status: 'online',
      }],
    });
    handlers.presence?.({
      userId: 7,
      online: true,
      status: 'streaming',
      playing: 'Hades',
      twitchLogin: 'sakura_live',
    });

    expect(useFriendsStore.getState().friends[0]).toMatchObject({
      userId: 7,
      status: 'streaming',
      playing: 'Hades',
      twitchLogin: 'sakura_live',
    });
  });

  it('reports a failed connection and a lost connection', () => {
    useAuthStore.setState({ token: 'session-token' });
    useFriendsStore.getState().connect();

    handlers.connect_error?.(new Error('xhr poll error'));
    expect(useFriendsStore.getState()).toMatchObject({
      connected: false,
      connectionError: 'Could not connect to live presence. Check your connection and retry.',
    });

    handlers.connect?.();
    expect(useFriendsStore.getState()).toMatchObject({ connected: true, connectionError: null });

    handlers.disconnect?.('transport close');
    expect(useFriendsStore.getState()).toMatchObject({
      connected: false,
      connectionError: 'The live connection was lost. Reconnecting…',
    });
  });

  it('asks for a manual reconnect when the server closes the connection', () => {
    useAuthStore.setState({ token: 'session-token' });
    useFriendsStore.getState().connect();
    handlers.connect?.();

    handlers.disconnect?.('io server disconnect');
    expect(useFriendsStore.getState().connectionError).toBe(
      'The live connection was closed. Tap Reconnect to try again.',
    );

    useFriendsStore.getState().connect();
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(2);
  });

  it('refetches the list and re-sends idle state after reconnecting', async () => {
    useAuthStore.setState({ token: 'session-token' });
    useFriendsStore.getState().connect();
    handlers.connect?.();
    await Promise.resolve();

    useFriendsStore.getState().setIdle(true);
    expect(socket.emit).toHaveBeenLastCalledWith('idle', true);

    handlers.disconnect?.('transport close');
    getFriends.mockClear();
    jest.mocked(socket.emit).mockClear();
    handlers.connect?.();
    await Promise.resolve();

    expect(getFriends).toHaveBeenCalledWith('session-token');
    expect(socket.emit).toHaveBeenCalledWith('idle', true);
    expect(useFriendsStore.getState().connectionError).toBeNull();
  });

  it('refetches the list when friendships change', async () => {
    useAuthStore.setState({ token: 'session-token' });
    useFriendsStore.getState().connect();
    getFriends.mockResolvedValueOnce({
      friends: [],
      incoming: [{ userId: 9, username: 'hinata', name: null, avatarUrl: null }],
      outgoing: [],
    });

    handlers['friends:changed']?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(getFriends).toHaveBeenCalledTimes(1);
    expect(useFriendsStore.getState().incoming).toEqual([
      { userId: 9, username: 'hinata', name: null, avatarUrl: null },
    ]);
  });

  it('closes the old socket and clears relationship data when the account changes', () => {
    useAuthStore.setState({ token: 'first-token' });
    useFriendsStore.getState().connect();
    useFriendsStore.setState({
      friends: [{
        userId: 7,
        username: 'sakura',
        name: null,
        avatarUrl: null,
        online: true,
        status: 'online',
      }],
    });

    useAuthStore.setState({ token: 'second-token' });

    expect(socket.removeAllListeners).toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(useFriendsStore.getState().friends).toEqual([]);
    expect(useFriendsStore.getState().loaded).toBe(false);
    expect(useFriendsStore.getState().connected).toBe(false);
  });

  it('does not apply a friends response from the previous account', async () => {
    let resolveList: (value: api.FriendList) => void = () => undefined;
    getFriends.mockReturnValue(new Promise((resolve) => {
      resolveList = resolve;
    }));
    useAuthStore.setState({ token: 'first-token' });
    const request = useFriendsStore.getState().fetchFriends();

    useAuthStore.setState({ token: 'second-token' });
    resolveList({
      friends: [{
        userId: 7,
        username: 'sakura',
        name: null,
        avatarUrl: null,
        online: true,
        status: 'online',
      }],
      incoming: [],
      outgoing: [],
    });
    await request;

    expect(useFriendsStore.getState().friends).toEqual([]);
    expect(useFriendsStore.getState().loaded).toBe(false);
  });
});
