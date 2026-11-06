import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';

import * as api from '@/lib/api';
import type { FriendList, FriendTarget, PresenceStatus } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

type FriendsState = FriendList & {
  loaded: boolean;
  loading: boolean;
  failed: boolean;
  error: string | null;
  connectionError: string | null;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  setIdle: (idle: boolean) => void;
  fetchFriends: () => Promise<void>;
  addFriend: (target: FriendTarget) => Promise<void>;
  removeFriend: (userId: number) => Promise<void>;
};

const emptyData: FriendList = { friends: [], incoming: [], outgoing: [] };
const initialState = {
  ...emptyData,
  loaded: false,
  loading: false,
  failed: false,
  error: null,
  connectionError: null,
  connected: false,
};

type PresenceEvent = {
  userId: number;
  online: boolean;
  status: PresenceStatus;
  playing?: string | null;
  twitchLogin?: string | null;
};

let socket: Socket | null = null;
let socketToken: string | null = null;
let idle = false;
let fetchSequence = 0;

function closeSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  socketToken = null;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  ...initialState,
  connect: () => {
    const { token } = useAuthStore.getState();
    if (!token) return;
    if (socket && socketToken === token) {
      if (!socket.connected) socket.connect();
      return;
    }

    closeSocket();
    const client = io(api.API_URL, { auth: { token }, autoConnect: false });
    socket = client;
    socketToken = token;

    client.on('connect', () => {
      if (socket !== client || useAuthStore.getState().token !== token) return;
      set({ connected: true, connectionError: null });
      client.emit('idle', idle);
      void get().fetchFriends().catch(() => undefined);
    });
    client.on('disconnect', (reason: Socket.DisconnectReason) => {
      if (socket === client) {
        set({
          connected: false,
          connectionError: reason === 'io server disconnect'
            ? 'The live connection was closed. Tap Reconnect to try again.'
            : 'The live connection was lost. Reconnecting…',
        });
      }
    });
    client.on('connect_error', () => {
      if (socket === client) {
        set({
          connected: false,
          connectionError: 'Could not connect to live presence. Check your connection and retry.',
        });
      }
    });
    client.on('friends:changed', () => {
      if (socket === client && useAuthStore.getState().token === token) {
        void get().fetchFriends().catch(() => undefined);
      }
    });
    client.on('presence', (event: PresenceEvent) => {
      if (socket !== client || useAuthStore.getState().token !== token) return;
      set((state) => ({
        friends: state.friends.map((friend) =>
          friend.userId === event.userId
            ? {
                ...friend,
                online: event.online,
                status: event.status,
                playing: event.playing ?? null,
                twitchLogin: event.twitchLogin ?? null,
              }
            : friend,
        ),
      }));
    });
    client.connect();
  },
  disconnect: () => {
    fetchSequence += 1;
    closeSocket();
    set({ connected: false, loading: false });
  },
  setIdle: (nextIdle) => {
    idle = nextIdle;
    socket?.emit('idle', nextIdle);
  },
  fetchFriends: async () => {
    const { token } = useAuthStore.getState();
    if (!token) return;
    const sequence = ++fetchSequence;
    set({ loading: true, failed: false, error: null });
    try {
      const list = await api.getFriends(token);
      if (sequence !== fetchSequence || useAuthStore.getState().token !== token) return;
      set({ ...list, loaded: true, loading: false, failed: false, error: null });
    } catch (cause) {
      if (sequence !== fetchSequence || useAuthStore.getState().token !== token) return;
      const message = cause instanceof Error ? cause.message : 'Could not load your friends.';
      set({ loading: false, failed: true, error: message });
      throw cause;
    }
  },
  addFriend: async (target: FriendTarget) => {
    const { token } = useAuthStore.getState();
    if (!token) throw new Error('Please log in again.');
    await api.addFriend(token, target);
    if (useAuthStore.getState().token !== token) return;
    await get().fetchFriends();
  },
  removeFriend: async (userId: number) => {
    const { token } = useAuthStore.getState();
    if (!token) throw new Error('Please log in again.');
    await api.removeFriend(token, userId);
    if (useAuthStore.getState().token !== token) return;
    await get().fetchFriends();
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.token === previous.token) return;
  fetchSequence += 1;
  closeSocket();
  idle = false;
  useFriendsStore.setState(initialState);
});
