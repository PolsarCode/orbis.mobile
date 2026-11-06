import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chatTitle, displayName, MESSAGE_MAX_LENGTH, MESSAGE_REACTIONS } from '@/lib/chat';
import type { ChatMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { markConversationViewing, useMessagesStore } from '@/stores/messages-store';

function MessageItem({
  message,
  mine,
  me,
  isRequest,
  showReactions,
  onToggleReactions,
  onReply,
  onEdit,
  onReact,
}: {
  message: ChatMessage;
  mine: boolean;
  me: number;
  isRequest: boolean;
  showReactions: boolean;
  onToggleReactions: () => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onReact: (message: ChatMessage, emoji: string) => void;
}) {
  const theme = useTheme();
  if (message.system) {
    return (
      <View style={styles.systemMessage}>
        <Atom.ThemedText type="small" themeColor="textSecondary">{message.text}</Atom.ThemedText>
      </View>
    );
  }
  const content = message.hiddenBecause ? 'This message is hidden.' : message.text;
  const sender = mine ? 'You' : displayName(message.sender);
  const sentTime = new Date(message.sentAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <View style={[styles.messageLine, mine && styles.messageLineMine]}>
      {!mine ? (
        message.sender.avatarUrl ? (
          <Image source={{ uri: message.sender.avatarUrl }} style={styles.messageAvatar} />
        ) : (
          <View style={[styles.messageAvatar, styles.avatarFallback, { backgroundColor: theme.rail }]}>
            <Atom.ThemedText type="smallBold">{Array.from(sender)[0]?.toUpperCase()}</Atom.ThemedText>
          </View>
        )
      ) : null}
      <View style={[styles.messageColumn, mine && styles.messageColumnMine]}>
        <Atom.ThemedText type="small" themeColor="textSecondary" style={mine && styles.alignRight}>
          {sender}
        </Atom.ThemedText>
        {message.replyTo && !message.replyTo.hiddenBecause ? (
          <View style={[styles.replyQuote, { backgroundColor: theme.backgroundElement }]}>
            <Atom.ThemedText type="smallBold">
              {message.replyTo.senderId === me ? 'You' : displayName(message.replyTo.sender)}
            </Atom.ThemedText>
            <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {message.replyTo.text}
            </Atom.ThemedText>
          </View>
        ) : null}
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: mine ? theme.accent : theme.backgroundElement,
              borderColor: mine ? theme.accent : theme.divider,
            },
          ]}>
          <Atom.ThemedText
            selectable
            style={{ color: mine ? theme.accentForeground : theme.text }}>
            {content}
            {message.editedAt ? ' (edited)' : ''}
          </Atom.ThemedText>
        </View>
        <Atom.ThemedText type="small" themeColor="textSecondary" style={mine && styles.alignRight}>
          {sentTime}
        </Atom.ThemedText>
        {!isRequest && !message.hiddenBecause ? (
          <>
            <View style={[styles.messageTools, mine && styles.messageToolsMine]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a reaction"
                onPress={onToggleReactions}
                style={styles.toolButton}>
                <Atom.ThemedText type="small" themeColor="textSecondary">React</Atom.ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reply to ${sender}'s message`}
                onPress={() => onReply(message)}
                style={styles.toolButton}>
                <Atom.ThemedText type="small" themeColor="textSecondary">Reply</Atom.ThemedText>
              </Pressable>
              {mine ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit message"
                  onPress={() => onEdit(message)}
                  style={styles.toolButton}>
                  <Atom.ThemedText type="small" themeColor="textSecondary">Edit</Atom.ThemedText>
                </Pressable>
              ) : null}
            </View>
            {showReactions ? (
              <View style={[styles.reactions, mine && styles.messageToolsMine]}>
                {MESSAGE_REACTIONS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={`React with ${emoji}`}
                    onPress={() => onReact(message, emoji)}
                    style={styles.emojiButton}>
                    <Atom.ThemedText>{emoji}</Atom.ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
        {message.reactions.length ? (
          <View style={[styles.reactions, mine && styles.messageToolsMine]}>
            {message.reactions.map((reaction) => (
              <Pressable
                key={reaction.emoji}
                accessibilityRole="button"
                accessibilityLabel={`${reaction.emoji}, ${reaction.userIds.length} reactions`}
                disabled={isRequest}
                onPress={() => onReact(message, reaction.emoji)}
                style={[
                  styles.reaction,
                  {
                    borderColor: theme.divider,
                    backgroundColor: reaction.userIds.includes(me) ? theme.accentSoft : theme.surface,
                  },
                ]}>
                <Atom.ThemedText type="small">
                  {reaction.emoji} {reaction.userIds.length}
                </Atom.ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function ChatConversation() {
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const rawId = Array.isArray(params.conversationId) ? params.conversationId[0] : params.conversationId;
  const id = Number(rawId);
  const validId = Number.isSafeInteger(id) && id > 0;
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const me = useAuthStore((state) => state.profile?.userId);
  const conversation = useMessagesStore((state) =>
    validId ? state.conversations.find((item) => item.id === id) : undefined,
  );
  const history = useMessagesStore((state) => validId ? state.histories[id] : undefined);
  const typers = useMessagesStore((state) => validId ? state.typing[id] ?? [] : []);
  const loaded = useMessagesStore((state) => state.loaded);
  const failed = useMessagesStore((state) => state.failed);
  const error = useMessagesStore((state) => state.error);
  const loadHistory = useMessagesStore((state) => state.loadHistory);
  const loadOlder = useMessagesStore((state) => state.loadOlder);
  const send = useMessagesStore((state) => state.send);
  const edit = useMessagesStore((state) => state.edit);
  const react = useMessagesStore((state) => state.react);
  const markRead = useMessagesStore((state) => state.markRead);
  const refresh = useMessagesStore((state) => state.refresh);
  const acceptRequest = useMessagesStore((state) => state.acceptRequest);
  const declineRequest = useMessagesStore((state) => state.declineRequest);
  const emitTyping = useMessagesStore((state) => state.emitTyping);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const atBottom = useRef(true);
  const initialScrollDone = useRef(false);
  const previousContentHeight = useRef<number | null>(null);
  const previousMessageCount = useRef<number | null>(null);
  const typingSentAt = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = conversation?.status === 'request';
  const conversationExists = Boolean(conversation);
  const conversationStatus = conversation?.status;
  const conversationUnread = conversation?.unread ?? 0;
  const historyReady = Boolean(history && !history.loading);
  const messages = history?.messages ?? [];

  useFocusEffect(useCallback(() => {
    if (!validId) return;
    setFocused(true);
    markConversationViewing(id, AppState.currentState === 'active');
    if (!loaded || !conversationExists) void refresh().catch(() => undefined);
    if (conversationExists) void loadHistory(id).catch(() => undefined);
    return () => {
      markConversationViewing(id, false);
      setFocused(false);
    };
  }, [conversationExists, id, loaded, loadHistory, refresh, validId]));

  useEffect(() => {
    if (!validId || conversationStatus !== 'accepted') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && focused) {
        markConversationViewing(id, true);
        void markRead(id).catch(() => undefined);
      } else {
        markConversationViewing(id, false);
      }
    });
    return () => subscription.remove();
  }, [conversationStatus, focused, id, markRead, validId]);

  useEffect(() => {
    if (
      focused &&
      AppState.currentState === 'active' &&
      conversationStatus === 'accepted' &&
      conversationUnread > 0
    ) {
      void markRead(id).catch(() => undefined);
    }
  }, [conversationStatus, conversationUnread, focused, id, markRead]);

  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (
      validId &&
      token &&
      useAuthStore.getState().token === token &&
      typingSentAt.current !== 0
    ) {
      emitTyping(id, false);
    }
    if (validId) markConversationViewing(id, false);
  }, [emitTyping, id, token, validId]);

  useEffect(() => {
    if (!initialScrollDone.current && historyReady) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
      initialScrollDone.current = true;
    } else if (atBottom.current) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [historyReady, history?.messages.length]);

  function handleContentSizeChange(_width: number, height: number) {
    if (previousContentHeight.current !== null) {
      const offset = height - previousContentHeight.current;
      if (
        previousMessageCount.current !== null &&
        messages.length > previousMessageCount.current
      ) {
        listRef.current?.scrollToOffset({ offset, animated: false });
      }
      previousContentHeight.current = null;
      previousMessageCount.current = null;
    } else if (!initialScrollDone.current) {
      listRef.current?.scrollToEnd({ animated: false });
      initialScrollDone.current = historyReady;
    }
  }

  useEffect(() => {
    if (
      !history?.loadingOlder &&
      previousMessageCount.current !== null &&
      messages.length <= previousMessageCount.current
    ) {
      previousContentHeight.current = null;
      previousMessageCount.current = null;
    }
  }, [history?.loadingOlder, messages.length]);

  function handleScroll(event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number } } }) {
    const { y } = event.nativeEvent.contentOffset;
    const { height } = event.nativeEvent.contentSize;
    atBottom.current = height - y < 1200;
    if (y < 70 && history?.hasMore && !history.loadingOlder) {
      previousContentHeight.current = height;
      previousMessageCount.current = messages.length;
      void loadOlder(id);
    }
  }

  function changeDraft(value: string) {
    setDraft(value);
    if (editing || !validId) return;
    if (!value.trim()) {
      if (typingSentAt.current !== 0) emitTyping(id, false);
      typingSentAt.current = 0;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      return;
    }
    if (Date.now() - typingSentAt.current > 2000) {
      typingSentAt.current = Date.now();
      emitTyping(id, true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      emitTyping(id, false);
      typingSentAt.current = 0;
    }, 3000);
  }

  async function submitMessage() {
    const text = draft.trim();
    if (!text || submitting || !validId) return;
    setSubmitting(true);
    setActionError(null);
    try {
      if (editing) {
        await edit(id, editing.id, text);
        setEditing(null);
      } else {
        await send(id, text, replyTo?.id);
        setReplyTo(null);
      }
      setDraft('');
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = null;
      if (typingSentAt.current !== 0) emitTyping(id, false);
      typingSentAt.current = 0;
      atBottom.current = true;
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not send your message.');
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(action: () => Promise<void>) {
    setActionError(null);
    setActionLoading(true);
    try {
      await action();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not update this conversation.');
    } finally {
      setActionLoading(false);
    }
  }

  async function toggleReaction(message: ChatMessage, emoji: string) {
    await runAction(() => react(id, message.id, emoji));
  }

  const title = conversation && me ? chatTitle(conversation, me) : 'Conversation';
  const canSend = conversation?.canMessage !== false && history?.canMessage !== false;
  const typingPeople = conversation?.members.filter(({ userId }) => typers.includes(userId)) ?? [];
  const latestMessage = [...messages].reverse().find((message) => !message.system);
  const otherReadAt = history?.members.find((member) => member.userId !== me)?.readAt;
  const seen = Boolean(
    conversation &&
      !conversation.isGroup &&
      latestMessage &&
      latestMessage.senderId === me &&
      otherReadAt &&
      new Date(otherReadAt).getTime() >= new Date(latestMessage.sentAt).getTime(),
  );

  if (!validId) {
    return <Atom.ErrorMessage>This conversation link is not valid.</Atom.ErrorMessage>;
  }
  if (!loaded && !conversation) {
    return <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>;
  }
  if (!conversation && failed) {
    return (
      <View style={styles.center}>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Messages are unavailable right now.
        </Atom.ThemedText>
        <Atom.Button
          label="Try again"
          variant="secondary"
          onPress={() => void useMessagesStore.getState().refresh().catch(() => undefined)}
        />
      </View>
    );
  }
  if (!conversation) {
    return (
      <View style={styles.center}>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          This conversation is no longer available.
        </Atom.ThemedText>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          style={[styles.screen, { backgroundColor: theme.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {history?.loadingOlder ? <ActivityIndicator color={theme.accent} /> : null}
          {history?.failed ? (
            <View style={styles.loadError}>
              <Atom.ErrorMessage>Could not load this chat.</Atom.ErrorMessage>
              <Atom.Button
                label="Retry"
                variant="secondary"
                onPress={() => void loadHistory(id).catch(() => undefined)}
              />
            </View>
          ) : null}
          {error && !history?.failed ? (
            <View style={styles.loadError}>
              <Atom.ErrorMessage>{error}</Atom.ErrorMessage>
              {conversationUnread > 0 && conversationStatus === 'accepted' ? (
                <Atom.Button
                  label="Retry marking read"
                  variant="secondary"
                  onPress={() => void markRead(id).catch(() => undefined)}
                />
              ) : null}
            </View>
          ) : null}
          {actionError ? <Atom.ErrorMessage>{actionError}</Atom.ErrorMessage> : null}

          <FlatList
            ref={listRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            data={messages}
            keyExtractor={(message) => String(message.id)}
            keyboardShouldPersistTaps="handled"
            onScroll={handleScroll}
            onContentSizeChange={handleContentSizeChange}
            scrollEventThrottle={16}
            ListEmptyComponent={
              history?.loading ? <ActivityIndicator color={theme.accent} /> : (
                <View style={styles.emptyHistory}>
                  <Atom.ThemedText type="smallBold">{title}</Atom.ThemedText>
                  <Atom.ThemedText type="small" themeColor="textSecondary">
                    Say hi to start the conversation.
                  </Atom.ThemedText>
                </View>
              )
            }
            renderItem={({ item }) => (
              <MessageItem
                message={item}
                mine={item.senderId === me}
                me={me ?? 0}
                isRequest={Boolean(request)}
                showReactions={reactionTarget === item.id}
                onToggleReactions={() =>
                  setReactionTarget((current) => current === item.id ? null : item.id)
                }
                onReply={(message) => {
                  setEditing(null);
                  setReplyTo(message);
                }}
                onEdit={(message) => {
                  setReplyTo(null);
                  setEditing(message);
                  setDraft(message.text);
                }}
                onReact={(message, emoji) => void toggleReaction(message, emoji)}
              />
            )}
            ListFooterComponent={typingPeople.length || seen ? (
              <View style={styles.listFooter}>
                {typingPeople.length ? (
                  <Atom.ThemedText type="small" themeColor="textSecondary">
                    {typingPeople.map(displayName).join(', ')} {typingPeople.length === 1 ? 'is' : 'are'} typing…
                  </Atom.ThemedText>
                ) : null}
                {seen ? <Atom.ThemedText type="small" themeColor="textSecondary">Seen</Atom.ThemedText> : null}
              </View>
            ) : undefined}
          />

          {request ? (
            <View style={[styles.requestBanner, { borderTopColor: theme.divider }]}>
              <Atom.ThemedText type="small" themeColor="textSecondary">
                {title} isn’t one of your friends. Accept to move this conversation to your chats, or delete the request.
              </Atom.ThemedText>
              <View style={styles.requestActions}>
                <Atom.Button
                  label="Accept"
                  loading={actionLoading}
                  disabled={actionLoading}
                  onPress={() => void runAction(() => acceptRequest(id))}
                />
                <Atom.Button
                  label="Delete request"
                  variant="secondary"
                  disabled={actionLoading}
                  onPress={() => void runAction(async () => {
                    await declineRequest(id);
                    router.back();
                  })}
                />
              </View>
            </View>
          ) : null}
          <View style={[styles.composer, { borderTopColor: theme.divider }]}>
            {replyTo ? (
              <View style={styles.composeContext}>
                <Atom.ThemedText type="smallBold">
                  Replying to {replyTo.senderId === me ? 'yourself' : displayName(replyTo.sender)}
                </Atom.ThemedText>
                <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {replyTo.text}
                </Atom.ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReplyTo(null)}
                  style={styles.contextButton}>
                  <Atom.ThemedText type="small" themeColor="textSecondary">Cancel</Atom.ThemedText>
                </Pressable>
              </View>
            ) : null}
            {editing ? (
              <View style={styles.composeContext}>
                <Atom.ThemedText type="smallBold">Editing message</Atom.ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setEditing(null);
                    setDraft('');
                  }}
                  style={styles.contextButton}>
                  <Atom.ThemedText type="small" themeColor="textSecondary">Cancel</Atom.ThemedText>
                </Pressable>
              </View>
            ) : null}
            {canSend ? (
              <View style={styles.composerRow}>
                <Atom.Input
                  accessibilityLabel={`Message ${title}`}
                  editable={!submitting}
                  maxLength={MESSAGE_MAX_LENGTH}
                  multiline
                  placeholder="Write a message"
                  returnKeyType="default"
                  value={draft}
                  onChangeText={changeDraft}
                  style={styles.input}
                />
                <Atom.Button
                  label={editing ? 'Save' : 'Send'}
                  loading={submitting}
                  disabled={!draft.trim() || submitting}
                  onPress={() => void submitMessage()}
                />
              </View>
            ) : (
              <Atom.ThemedText type="small" themeColor="textSecondary">
                You can’t send messages in this conversation.
              </Atom.ThemedText>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  listFooter: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  emptyHistory: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  systemMessage: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
  messageLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.one,
    maxWidth: '90%',
  },
  messageLineMine: {
    alignSelf: 'flex-end',
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageColumn: {
    maxWidth: '100%',
    gap: Spacing.one,
  },
  messageColumnMine: {
    alignItems: 'flex-end',
  },
  alignRight: {
    alignSelf: 'flex-end',
  },
  replyQuote: {
    maxWidth: '100%',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  bubble: {
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  messageTools: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  messageToolsMine: {
    alignSelf: 'flex-end',
  },
  toolButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  reaction: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 18,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  requestBanner: {
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  composer: {
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    paddingTop: Spacing.two,
    textAlignVertical: 'top',
  },
  composeContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  contextButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  emojiButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadError: {
    alignItems: 'center',
    gap: Spacing.two,
  },
});
