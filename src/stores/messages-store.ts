import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';

import * as api from '@/lib/api';
import type { ChatHistory, ChatMessage, ChatPerson, Conversation } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

type History = ChatHistory & {
  failed?: boolean;
  loading?: boolean;
  loadingOlder?: boolean;
};

type MessageEvent = { conversation: Conversation; message: ChatMessage };
type MessageUpdateEvent = { conversationId: number; message: ChatMessage };
type ReadEvent = { conversationId: number; userId: number; readAt: string };
type TypingEvent = { conversationId: number; userId: number; typing: boolean };

type MessagesState = {
  conversations: Conversation[];
  histories: Record<number, History>;
  typing: Record<number, number[]>;
  loaded: boolean;
  loading: boolean;
  failed: boolean;
  connected: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
  loadHistory: (id: number) => Promise<void>;
  loadOlder: (id: number) => Promise<void>;
  send: (id: number, text: string, replyToId?: number) => Promise<void>;
  edit: (id: number, messageId: number, text: string) => Promise<void>;
  react: (id: number, messageId: number, emoji: string) => Promise<void>;
  markRead: (id: number) => Promise<void>;
  acceptRequest: (id: number) => Promise<void>;
  declineRequest: (id: number) => Promise<void>;
  openDirect: (person: ChatPerson) => Promise<number>;
  receive: (event: MessageEvent) => void;
  updated: (event: MessageUpdateEvent) => void;
  upsert: (conversation: Conversation) => void;
  removed: (id: number) => void;
  seen: (event: ReadEvent) => void;
  setTyping: (event: TypingEvent) => void;
  emitTyping: (id: number, typing: boolean) => void;
};

const empty = {
  conversations: [],
  histories: {},
  typing: {},
  loaded: false,
  loading: false,
  failed: false,
  connected: false,
  error: null,
};

const viewing = new Set<number>();
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const historyRequests = new Map<number, number>();
const markingRead = new Set<string>();
let socket: Socket | null = null;
let socketToken: string | null = null;
let refreshSequence = 0;
let conversationRevision = 0;
let nextHistoryRequest = 0;

function tokenOrThrow() {
  const { token } = useAuthStore.getState();
  if (!token) throw new Error('Please log in again.');
  return token;
}

function closeSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  socketToken = null;
}

function mergeMessages(...pages: ChatMessage[][]) {
  const messages = new Map<number, ChatMessage>();
  pages.flat().forEach((message) => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id - b.id);
}

function patchHistory(
  set: (partial: Partial<MessagesState> | ((state: MessagesState) => Partial<MessagesState>)) => void,
  id: number,
  patch: (history: History) => History,
) {
  set((state) => {
    const history = state.histories[id];
    if (!history) return state;
    return { histories: { ...state.histories, [id]: patch(history) } };
  });
}

export function markConversationViewing(id: number, active: boolean) {
  if (active) viewing.add(id);
  else viewing.delete(id);
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  ...empty,
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
      set({ connected: true, error: null });
      void get().refresh().catch(() => undefined);
    });
    client.on('disconnect', () => {
      if (socket === client) set({ connected: false });
    });
    client.on('connect_error', (cause: Error) => {
      if (socket === client) {
        set({ connected: false, error: cause.message || 'Could not connect to messages.' });
      }
    });
    client.on('message', (event: MessageEvent) => {
      if (socket === client && useAuthStore.getState().token === token) get().receive(event);
    });
    client.on('message:updated', (event: MessageUpdateEvent) => {
      if (socket === client && useAuthStore.getState().token === token) get().updated(event);
    });
    client.on('conversation', ({ conversation }: { conversation: Conversation }) => {
      if (socket === client && useAuthStore.getState().token === token) get().upsert(conversation);
    });
    client.on('conversation:removed', ({ id }: { id: number }) => {
      if (socket === client && useAuthStore.getState().token === token) get().removed(id);
    });
    client.on('messages:read', (event: ReadEvent) => {
      if (socket === client && useAuthStore.getState().token === token) get().seen(event);
    });
    client.on('typing', (event: TypingEvent) => {
      if (socket === client && useAuthStore.getState().token === token) get().setTyping(event);
    });
    client.connect();
  },
  disconnect: () => {
    refreshSequence += 1;
    closeSocket();
    set({ connected: false, loading: false });
  },
  refresh: async () => {
    const { token } = useAuthStore.getState();
    if (!token) return;
    const sequence = ++refreshSequence;
    const revision = conversationRevision;
    set({ loading: true, failed: false, error: null });
    try {
      const conversations = await api.getConversations(token);
      if (sequence !== refreshSequence || useAuthStore.getState().token !== token) return;
      if (revision !== conversationRevision) {
        await get().refresh();
        return;
      }
      set({
        conversations: conversations.sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
        loaded: true,
        loading: false,
        failed: false,
        error: null,
      });
    } catch (cause) {
      if (sequence !== refreshSequence || useAuthStore.getState().token !== token) return;
      const message = cause instanceof Error ? cause.message : 'Could not load your messages.';
      set({ loaded: true, loading: false, failed: true, error: message });
      throw cause;
    }
  },
  loadHistory: async (id) => {
    const current = get().histories[id];
    if (current?.loading || (current?.messages && !current.failed)) return;
    const token = tokenOrThrow();
    const requestId = ++nextHistoryRequest;
    historyRequests.set(id, requestId);
    set((state) => ({
      histories: {
        ...state.histories,
        [id]: { messages: [], members: [], hasMore: false, loading: true },
      },
    }));
    try {
      const result = await api.getChatHistory(token, id);
      if (
        historyRequests.get(id) !== requestId ||
        useAuthStore.getState().token !== token
      ) return;
      set((state) => {
        const latest = state.histories[id];
        return {
          histories: {
            ...state.histories,
            [id]: {
              ...result,
              messages: mergeMessages(result.messages, latest?.messages ?? []),
              loading: false,
            },
          },
          error: null,
        };
      });
    } catch (cause) {
      if (
        historyRequests.get(id) !== requestId ||
        useAuthStore.getState().token !== token
      ) return;
      patchHistory(set, id, (history) => ({ ...history, loading: false, failed: true }));
      set({
        error: cause instanceof Error ? cause.message : 'Could not load this chat.',
      });
      throw cause;
    } finally {
      if (historyRequests.get(id) === requestId) historyRequests.delete(id);
    }
  },
  loadOlder: async (id) => {
    const history = get().histories[id];
    const before = history?.messages[0]?.id;
    if (!history?.hasMore || history.loadingOlder || before === undefined) return;
    const token = tokenOrThrow();
    const requestId = ++nextHistoryRequest;
    historyRequests.set(id, requestId);
    patchHistory(set, id, (current) => ({ ...current, loadingOlder: true }));
    try {
      const older = await api.getChatHistory(token, id, before);
      if (
        historyRequests.get(id) !== requestId ||
        useAuthStore.getState().token !== token
      ) return;
      patchHistory(set, id, (current) => ({
        ...current,
        messages: mergeMessages(older.messages, current.messages),
        members: older.members,
        hasMore: older.hasMore,
        loadingOlder: false,
      }));
      set({ error: null });
    } catch (cause) {
      if (
        historyRequests.get(id) !== requestId ||
        useAuthStore.getState().token !== token
      ) return;
      patchHistory(set, id, (current) => ({ ...current, loadingOlder: false }));
      set({
        error: cause instanceof Error ? cause.message : 'Could not load older messages.',
      });
    } finally {
      if (historyRequests.get(id) === requestId) historyRequests.delete(id);
    }
  },
  send: async (id, text, replyToId) => {
    const token = tokenOrThrow();
    const message = await api.sendMessage(token, id, text, replyToId);
    if (useAuthStore.getState().token !== token) return;
    patchHistory(set, id, (history) => ({
      ...history,
      messages: mergeMessages(history.messages, [message]),
    }));
  },
  edit: async (id, messageId, text) => {
    const token = tokenOrThrow();
    const message = await api.editMessage(token, id, messageId, text);
    if (useAuthStore.getState().token === token) get().updated({ conversationId: id, message });
  },
  react: async (id, messageId, emoji) => {
    const token = tokenOrThrow();
    const message = await api.reactToMessage(token, id, messageId, emoji);
    if (useAuthStore.getState().token === token) get().updated({ conversationId: id, message });
  },
  markRead: async (id) => {
    const conversation = get().conversations.find((item) => item.id === id);
    if (!conversation || conversation.status !== 'accepted' || conversation.unread === 0) return;
    const token = useAuthStore.getState().token;
    if (!token) return;
    const readKey = `${token}:${id}`;
    if (markingRead.has(readKey)) return;
    markingRead.add(readKey);
    try {
      await api.markMessagesRead(token, id);
      if (useAuthStore.getState().token !== token) return;
      conversationRevision += 1;
      set((state) => ({
        conversations: state.conversations.map((item) =>
          item.id === id ? { ...item, unread: 0 } : item,
        ),
        error: null,
      }));
    } catch (cause) {
      if (useAuthStore.getState().token !== token) return;
      set({
        error: cause instanceof Error ? cause.message : 'Could not mark messages as read.',
      });
      throw cause;
    } finally {
      markingRead.delete(readKey);
    }
  },
  acceptRequest: async (id) => {
    const token = tokenOrThrow();
    await api.acceptMessageRequest(token, id);
    if (useAuthStore.getState().token !== token) return;
    conversationRevision += 1;
    set((state) => ({
      conversations: state.conversations.map((item) =>
        item.id === id ? { ...item, status: 'accepted', unread: 0 } : item,
      ),
    }));
    void get().refresh().catch(() => undefined);
  },
  declineRequest: async (id) => {
    const token = tokenOrThrow();
    await api.declineMessageRequest(token, id);
    if (useAuthStore.getState().token === token) get().removed(id);
  },
  openDirect: async (person) => {
    const existing = get().conversations.find(
      (conversation) =>
        !conversation.isGroup &&
        conversation.members.some((member) => member.userId === person.userId),
    );
    if (existing) return existing.id;
    const token = tokenOrThrow();
    const conversation = await api.openDirectChat(token, person.userId);
    if (useAuthStore.getState().token !== token) throw new Error('Your account changed. Try again.');
    get().upsert(conversation);
    return conversation.id;
  },
  receive: ({ conversation, message }) => {
    const id = conversation.id;
    get().upsert(conversation);
    patchHistory(set, id, (history) => ({
      ...history,
      messages: mergeMessages(history.messages, [message]),
    }));
    if (message.senderId !== useAuthStore.getState().profile?.userId) {
      get().setTyping({ conversationId: id, userId: message.senderId, typing: false });
      if (conversation.status === 'accepted' && viewing.has(id)) {
        void get().markRead(id).catch(() => undefined);
      }
    }
  },
  updated: ({ conversationId, message }) => {
    patchHistory(set, conversationId, (history) => ({
      ...history,
      messages: history.messages.map((current) =>
        current.id === message.id
          ? message
          : current.replyTo?.id === message.id &&
              !message.hiddenBecause &&
              !current.replyTo.hiddenBecause
            ? { ...current, replyTo: { ...current.replyTo, text: message.text } }
            : current,
      ),
    }));
  },
  upsert: (conversation) => {
    conversationRevision += 1;
    set((state) => ({
      conversations: [
        conversation,
        ...state.conversations.filter((item) => item.id !== conversation.id),
      ].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    }));
  },
  removed: (id) => {
    conversationRevision += 1;
    historyRequests.delete(id);
    set((state) => {
      const histories = { ...state.histories };
      delete histories[id];
      const typing = { ...state.typing };
      delete typing[id];
      return {
        conversations: state.conversations.filter((item) => item.id !== id),
        histories,
        typing,
      };
    });
  },
  seen: ({ conversationId, userId, readAt }) => {
    patchHistory(set, conversationId, (history) => ({
      ...history,
      members: history.members.map((member) =>
        member.userId === userId ? { ...member, readAt } : member,
      ),
    }));
  },
  setTyping: ({ conversationId, userId, typing }) => {
    const key = `${conversationId}:${userId}`;
    clearTimeout(typingTimers.get(key));
    typingTimers.delete(key);
    if (typing) {
      typingTimers.set(
        key,
        setTimeout(() => get().setTyping({ conversationId, userId, typing: false }), 6000),
      );
    }
    set((state) => {
      const current = state.typing[conversationId] ?? [];
      if (current.includes(userId) === typing) return state;
      return {
        typing: {
          ...state.typing,
          [conversationId]: typing
            ? [...current, userId]
            : current.filter((id) => id !== userId),
        },
      };
    });
  },
  emitTyping: (id, typing) => {
    socket?.emit('typing', { conversationId: id, typing });
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.token === previous.token) return;
  refreshSequence += 1;
  conversationRevision = 0;
  historyRequests.clear();
  markingRead.clear();
  closeSocket();
  viewing.clear();
  typingTimers.forEach((timer) => clearTimeout(timer));
  typingTimers.clear();
  useMessagesStore.setState(empty);
});
