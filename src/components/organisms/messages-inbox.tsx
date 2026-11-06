import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { chatPreview, chatTitle, displayName } from '@/lib/chat';
import { searchChatPeople, type ChatPerson, type Conversation } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useMessagesStore } from '@/stores/messages-store';

type Folder = 'chats' | 'requests';

function PersonRow({
  person,
  onPress,
  loading,
}: {
  person: ChatPerson;
  onPress: () => void;
  loading: boolean;
}) {
  const theme = useTheme();
  const name = displayName(person);
  return (
    <View style={[styles.personRow, { borderColor: theme.divider, backgroundColor: theme.surface }]}>
      {person.avatarUrl ? (
        <Image source={{ uri: person.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.rail }]}>
          <Atom.ThemedText type="smallBold">{Array.from(name)[0]?.toUpperCase()}</Atom.ThemedText>
        </View>
      )}
      <View style={styles.personInfo}>
        <Atom.ThemedText type="smallBold" numberOfLines={1}>{name}</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          @{person.username}
        </Atom.ThemedText>
      </View>
      <Atom.Button label="Message" loading={loading} onPress={onPress} />
    </View>
  );
}

function ConversationRow({
  conversation,
  me,
  onPress,
}: {
  conversation: Conversation;
  me?: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const unread = conversation.unread > 0;
  const title = chatTitle(conversation, me);
  const preview = chatPreview(conversation, me);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${unread ? ', unread' : ''}. ${preview}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.conversationRow,
        { backgroundColor: theme.surface, borderColor: theme.divider, opacity: pressed ? 0.75 : 1 },
      ]}>
      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.rail }]}>
        <Atom.ThemedText type="smallBold">{Array.from(title)[0]?.toUpperCase()}</Atom.ThemedText>
      </View>
      <View style={styles.personInfo}>
        <Atom.ThemedText type={unread ? 'smallBold' : 'small'} numberOfLines={1}>
          {title}{conversation.status === 'request' ? ' · Request' : ''}
        </Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {preview}
        </Atom.ThemedText>
      </View>
      {unread ? <View accessibilityLabel="Unread" style={[styles.unreadDot, { backgroundColor: theme.accent }]} /> : null}
    </Pressable>
  );
}

export function MessagesInbox() {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const me = useAuthStore((state) => state.profile?.userId);
  const conversations = useMessagesStore((state) => state.conversations);
  const loaded = useMessagesStore((state) => state.loaded);
  const loading = useMessagesStore((state) => state.loading);
  const failed = useMessagesStore((state) => state.failed);
  const connected = useMessagesStore((state) => state.connected);
  const error = useMessagesStore((state) => state.error);
  const refresh = useMessagesStore((state) => state.refresh);
  const openDirect = useMessagesStore((state) => state.openDirect);
  const [folder, setFolder] = useState<Folder>('chats');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ key: string; people: ChatPerson[]; error?: string } | null>(null);
  const [searchLoading, setSearchLoading] = useState<string | null>(null);
  const [openingUser, setOpeningUser] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const normalizedQuery = query.trim();
  const searchKey = `${token ?? ''}:${normalizedQuery}`;
  const people = results?.key === searchKey ? results.people : undefined;
  const searchError = results?.key === searchKey ? results.error : undefined;
  const searching = searchLoading === searchKey;
  const listed = useMemo(
    () => conversations.filter(({ lastSenderId }) => lastSenderId !== null),
    [conversations],
  );
  const requests = listed.filter(({ status }) => status === 'request');
  const shown = folder === 'requests'
    ? requests
    : listed.filter(({ status }) => status === 'accepted');

  useFocusEffect(useCallback(() => {
    if (token) void refresh().catch(() => undefined);
  }, [refresh, token]));

  useEffect(() => {
    if (!token || normalizedQuery.length < 2) return;
    let active = true;
    const key = `${token}:${normalizedQuery}`;
    const timer = setTimeout(() => {
      setSearchLoading(key);
      void searchChatPeople(token, normalizedQuery)
        .then((people) => {
          if (active) setResults({ key, people });
        })
        .catch((cause: unknown) => {
          if (active) {
            setResults({
              key,
              people: [],
              error: cause instanceof Error ? cause.message : 'Could not search people.',
            });
          }
        })
        .finally(() => {
          if (active) setSearchLoading((current) => current === key ? null : current);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [normalizedQuery, token]);

  async function startChat(person: ChatPerson) {
    const requestToken = token;
    if (!requestToken) return;
    setOpeningUser(person.userId);
    setActionError(null);
    try {
      const id = await openDirect(person);
      if (useAuthStore.getState().token === requestToken) {
        router.push(`/messages/${id}` as Href);
      }
    } catch (cause) {
      if (useAuthStore.getState().token === requestToken) {
        setActionError(cause instanceof Error ? cause.message : 'Could not open this chat.');
      }
    } finally {
      if (useAuthStore.getState().token === requestToken) setOpeningUser(null);
    }
  }

  function openConversation(id: number) {
    router.push(`/messages/${id}` as Href);
  }

  const header = (
    <View style={styles.page}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Atom.ThemedText type="subtitle">Messages</Atom.ThemedText>
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Your conversations and message requests.
          </Atom.ThemedText>
        </View>
        <Atom.Button
          label="Refresh"
          variant="secondary"
          loading={loading}
          onPress={() => void refresh().catch(() => undefined)}
        />
      </View>

      <View style={[styles.tabs, { borderBottomColor: theme.divider }]}>
        {([
          { value: 'chats' as const, label: 'Chats' },
          { value: 'requests' as const, label: `Requests · ${requests.length}` },
        ]).map((tab) => (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: folder === tab.value }}
            onPress={() => setFolder(tab.value)}
            style={[styles.tab, folder === tab.value && { borderBottomColor: theme.accent }]}>
            <Atom.ThemedText
              type="smallBold"
              style={{ color: folder === tab.value ? theme.accent : theme.text }}>
              {tab.label}
            </Atom.ThemedText>
          </Pressable>
        ))}
      </View>

      {!connected ? (
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Live updates reconnect when your connection is available.
        </Atom.ThemedText>
      ) : null}
      {error ? <Atom.ErrorMessage>{error}</Atom.ErrorMessage> : null}
      {failed ? (
        <Atom.Button
          label="Try again"
          variant="secondary"
          loading={loading}
          onPress={() => void refresh().catch(() => undefined)}
        />
      ) : null}
      {actionError ? <Atom.ErrorMessage>{actionError}</Atom.ErrorMessage> : null}

      {folder === 'chats' ? (
        <View style={styles.searchSection}>
          <Atom.ThemedText type="smallBold">Start a direct message</Atom.ThemedText>
          <Atom.Input
            accessibilityLabel="Search people to message"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={64}
            placeholder="Search by username"
            returnKeyType="search"
            value={query}
            onChangeText={setQuery}
          />
          {normalizedQuery.length === 1 ? (
            <Atom.ThemedText type="small" themeColor="textSecondary">
              Enter at least 2 characters to search.
            </Atom.ThemedText>
          ) : null}
          {searching ? <ActivityIndicator color={theme.accent} /> : null}
          {searchError ? <Atom.ErrorMessage>{searchError}</Atom.ErrorMessage> : null}
          {people?.map((person) => (
            <PersonRow
              key={person.userId}
              person={person}
              loading={openingUser === person.userId}
              onPress={() => void startChat(person)}
            />
          ))}
          {people?.length === 0 && !searching && !searchError ? (
            <Atom.ThemedText type="small" themeColor="textSecondary">No people found.</Atom.ThemedText>
          ) : null}
        </View>
      ) : null}

      <Atom.ThemedText type="smallBold">
        {folder === 'requests' ? 'Message requests' : 'Your chats'}
      </Atom.ThemedText>
    </View>
  );
  const emptyList = !loaded && loading ? (
    <ActivityIndicator color={theme.accent} />
  ) : loaded && !failed ? (
    <Atom.ThemedText type="small" themeColor="textSecondary">
      {folder === 'requests'
        ? 'No message requests. Messages from people who are not your friends appear here.'
        : 'No chats yet. Search for someone above or open their profile to start a conversation.'}
    </Atom.ThemedText>
  ) : undefined;

  return (
    <Atom.ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={shown}
            keyExtractor={(conversation) => String(conversation.id)}
            renderItem={({ item }) => (
              <ConversationRow
                conversation={item}
                me={me}
                onPress={() => openConversation(item.id)}
              />
            )}
            ListHeaderComponent={header}
            ListEmptyComponent={emptyList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshing={loading}
            onRefresh={() => void refresh().catch(() => undefined)}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Atom.ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  page: {
    width: '100%',
    gap: Spacing.three,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headingText: {
    flex: 1,
    gap: Spacing.one,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingHorizontal: Spacing.one,
  },
  searchSection: {
    gap: Spacing.two,
  },
  separator: {
    height: Spacing.two,
  },
  personRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  conversationRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  personInfo: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
