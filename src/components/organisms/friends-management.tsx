import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchPeople, type Friend, type FriendUser } from '@/lib/api';
import { presenceLabel, presenceStatus } from '@/lib/presence';
import { useReadOnly } from '@/lib/read-only';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';

type ViewTab = 'friends' | 'requests';
type RequestTab = 'received' | 'sent';

function PersonCard({
  person,
  status,
  playing,
}: {
  person: FriendUser;
  status?: Friend['status'];
  playing?: string | null;
}) {
  const theme = useTheme();
  const label = person.name || person.username;
  const dotColor = status
    ? {
        online: '#30a46c',
        idle: '#e5a000',
        busy: theme.accent,
        streaming: '#9146ff',
        offline: theme.textSecondary,
      }[status]
    : theme.textSecondary;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`View ${label}’s profile`}
      onPress={() => router.push(`/users/${encodeURIComponent(person.username)}` as Href)}
      style={({ pressed }) => [
        styles.personCard,
        { backgroundColor: theme.surface, borderColor: theme.divider, opacity: pressed ? 0.8 : 1 },
      ]}>
      {person.avatarUrl ? (
        <Image source={{ uri: person.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.rail }]}>
          <Atom.ThemedText type="smallBold">{Array.from(label)[0]?.toUpperCase()}</Atom.ThemedText>
        </View>
      )}
      <View style={styles.personInfo}>
        <Atom.ThemedText type="smallBold" numberOfLines={1}>
          {label}{person.isVerified ? ' · Verified' : ''}
        </Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          @{person.username}
          {status ? ` · ${presenceLabel(status)}` : ''}
          {status === 'streaming' && playing ? ` · ${playing}` : ''}
        </Atom.ThemedText>
      </View>
      {status ? (
        <View
          accessibilityLabel={presenceLabel(status)}
          style={[styles.presenceDot, { backgroundColor: dotColor }]}
        />
      ) : null}
    </Pressable>
  );
}

function ReadOnlyHint({ action }: { action: string }) {
  return (
    <Atom.ThemedText type="small" themeColor="textSecondary">
      {`Confirm your email first to ${action}.`}
    </Atom.ThemedText>
  );
}

export function FriendsManagement() {
  const theme = useTheme();
  const readOnly = useReadOnly();
  const token = useAuthStore((state) => state.token);
  const friends = useFriendsStore((state) => state.friends);
  const incoming = useFriendsStore((state) => state.incoming);
  const outgoing = useFriendsStore((state) => state.outgoing);
  const loaded = useFriendsStore((state) => state.loaded);
  const loading = useFriendsStore((state) => state.loading);
  const failed = useFriendsStore((state) => state.failed);
  const error = useFriendsStore((state) => state.error);
  const connectionError = useFriendsStore((state) => state.connectionError);
  const connected = useFriendsStore((state) => state.connected);
  const connect = useFriendsStore((state) => state.connect);
  const fetchFriends = useFriendsStore((state) => state.fetchFriends);
  const addFriend = useFriendsStore((state) => state.addFriend);
  const removeFriend = useFriendsStore((state) => state.removeFriend);
  const [view, setView] = useState<ViewTab>('friends');
  const [requestTab, setRequestTab] = useState<RequestTab>('received');
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<{
    key: string;
    users?: FriendUser[];
    error?: string;
  } | null>(null);
  const [searchLoadingKey, setSearchLoadingKey] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ token: string; message: string } | null>(null);
  const searchQuery = query.trim();
  const searchKey = `${token ?? ''}:${searchQuery}`;
  const searchUsers = searchState?.key === searchKey ? searchState.users : undefined;
  const searchError = searchState?.key === searchKey ? searchState.error : undefined;
  const searchLoading = searchLoadingKey === searchKey;
  const friendsById = useMemo(() => new Map(friends.map((friend) => [friend.userId, friend])), [friends]);

  useFocusEffect(useCallback(() => {
    if (token) void fetchFriends().catch(() => undefined);
  }, [fetchFriends, token]));

  useEffect(() => {
    if (!token || searchQuery.length < 2) return;
    let active = true;
    const key = `${token}:${searchQuery}`;
    const timer = setTimeout(() => {
      setSearchLoadingKey(key);
      void searchPeople(token, searchQuery)
        .then((users) => {
          if (active) setSearchState({ key, users });
        })
        .catch((cause: unknown) => {
          if (active) {
            setSearchState({
              key,
              error: cause instanceof Error ? cause.message : 'Could not search people.',
            });
          }
        })
        .finally(() => {
          if (active) setSearchLoadingKey((current) => current === key ? null : current);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, token]);

  async function runAction(userId: number, action: 'add' | 'remove') {
    const requestToken = token;
    if (!requestToken) return;
    const key = `${requestToken}:${userId}:${action}`;
    if (pendingAction?.startsWith(`${requestToken}:`)) return;
    setPendingAction(key);
    setActionError(null);
    try {
      if (action === 'add') await addFriend({ userId });
      else await removeFriend(userId);
    } catch (cause) {
      if (useAuthStore.getState().token === requestToken) {
        setActionError({
          token: requestToken,
          message: cause instanceof Error ? cause.message : 'Could not update your friends.',
        });
      }
    } finally {
      if (useAuthStore.getState().token === requestToken) setPendingAction(null);
    }
  }

  const received = requestTab === 'received';
  const displayedRequests = received ? incoming : outgoing;
  const sections = [
    { title: 'Streaming', people: friends.filter((friend) => friend.online && friend.status === 'streaming') },
    { title: 'Online', people: friends.filter((friend) => friend.online && friend.status !== 'streaming') },
    { title: 'Offline', people: friends.filter((friend) => !friend.online) },
  ].filter((section) => section.people.length > 0);

  return (
    <View style={styles.page}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Atom.ThemedText type="subtitle">Friends</Atom.ThemedText>
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Find people, manage requests, and see who’s around.
          </Atom.ThemedText>
        </View>
        <Atom.Button
          label="Refresh"
          variant="secondary"
          loading={loading}
          onPress={() => void fetchFriends().catch(() => undefined)}
        />
      </View>

      <View style={[styles.tabs, { borderBottomColor: theme.divider }]}>
        {([
          { value: 'friends' as const, label: `Friends · ${friends.length}` },
          { value: 'requests' as const, label: `Requests · ${incoming.length + outgoing.length}` },
        ]).map((tab) => (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === tab.value }}
            onPress={() => setView(tab.value)}
            style={[
              styles.tab,
              view === tab.value && { borderBottomColor: theme.accent },
            ]}>
            <Atom.ThemedText
              type="smallBold"
              style={{ color: view === tab.value ? theme.accent : theme.text }}>
              {tab.label}
            </Atom.ThemedText>
          </Pressable>
        ))}
      </View>

      {!connected && connectionError ? (
        <View style={styles.errorBlock}>
          <Atom.ErrorMessage>{connectionError}</Atom.ErrorMessage>
          <Atom.Button label="Reconnect" variant="secondary" onPress={connect} />
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorBlock}>
          <Atom.ErrorMessage>{error}</Atom.ErrorMessage>
          {failed ? (
            <Atom.Button
              label="Try again"
              variant="secondary"
              loading={loading}
              onPress={() => void fetchFriends().catch(() => undefined)}
            />
          ) : null}
        </View>
      ) : null}
      {actionError?.token === token ? <Atom.ErrorMessage>{actionError.message}</Atom.ErrorMessage> : null}

      <View style={styles.content}>
        {view === 'friends' ? (
          <>
            <View style={styles.section}>
              <Atom.ThemedText type="smallBold">Find people</Atom.ThemedText>
              <Atom.Input
                accessibilityLabel="Search people by username"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={64}
                placeholder="Search by username"
                returnKeyType="search"
                value={query}
                onChangeText={setQuery}
              />
              {searchQuery.length === 1 ? (
                <Atom.ThemedText type="small" themeColor="textSecondary">
                  Enter at least 2 characters to search.
                </Atom.ThemedText>
              ) : null}
              {searchLoading ? <ActivityIndicator color={theme.accent} /> : null}
              {searchError ? <Atom.ErrorMessage>{searchError}</Atom.ErrorMessage> : null}
              {searchUsers?.map((person) => {
                const isFriend = friendsById.has(person.userId);
                const isIncoming = incoming.some((item) => item.userId === person.userId);
                const isOutgoing = outgoing.some((item) => item.userId === person.userId);
                const readOnlyAction = isIncoming
                  ? 'answer friend requests'
                  : isFriend
                    ? 'remove friends'
                    : isOutgoing
                      ? 'cancel friend requests'
                      : 'add friends';
                return (
                  <View key={person.userId} style={styles.actionCard}>
                    <PersonCard person={person} />
                    <View style={styles.actions}>
                      {isIncoming ? (
                        <>
                          <Atom.Button
                            label="Accept"
                            loading={pendingAction === `${token}:${person.userId}:add`}
                            disabled={readOnly || (pendingAction?.startsWith(`${token}:`) ?? false)}
                            onPress={() => void runAction(person.userId, 'add')}
                          />
                          <Atom.Button
                            label="Reject"
                            variant="secondary"
                            loading={pendingAction === `${token}:${person.userId}:remove`}
                            disabled={readOnly || (pendingAction?.startsWith(`${token}:`) ?? false)}
                            onPress={() => void runAction(person.userId, 'remove')}
                          />
                        </>
                      ) : (
                        <Atom.Button
                          label={isFriend ? 'Remove friend' : isOutgoing ? 'Cancel request' : 'Send request'}
                          variant="secondary"
                          loading={pendingAction !== null && pendingAction.startsWith(`${token}:${person.userId}:`)}
                          disabled={readOnly || (pendingAction?.startsWith(`${token}:`) ?? false)}
                          onPress={() => void runAction(person.userId, isFriend || isOutgoing ? 'remove' : 'add')}
                        />
                      )}
                    </View>
                    {readOnly ? <ReadOnlyHint action={readOnlyAction} /> : null}
                  </View>
                );
              })}
              {searchUsers?.length === 0 && !searchLoading ? (
                <Atom.ThemedText type="small" themeColor="textSecondary">
                  No people found. Check the username and try again.
                </Atom.ThemedText>
              ) : null}
            </View>

            <View style={styles.section}>
              <Atom.ThemedText type="smallBold">Your friends · {friends.length}</Atom.ThemedText>
              {!loaded && loading ? (
                <ActivityIndicator color={theme.accent} />
              ) : sections.length ? (
                sections.map((section) => (
                  <View key={section.title} style={styles.section}>
                    <Atom.ThemedText type="small" themeColor="textSecondary">
                      {section.title} · {section.people.length}
                    </Atom.ThemedText>
                    {section.people.map((friend) => (
                      <PersonCard
                        key={friend.userId}
                        person={friend}
                        status={presenceStatus(friend.online, friend.status)}
                        playing={friend.playing}
                      />
                    ))}
                  </View>
                ))
              ) : loaded && !failed ? (
                <Atom.ThemedText type="small" themeColor="textSecondary">
                  No friends yet. Search for people by username to send a request.
                </Atom.ThemedText>
              ) : null}
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <View style={styles.requestTabs}>
              {([
                { value: 'received' as const, label: `Received · ${incoming.length}` },
                { value: 'sent' as const, label: `Sent · ${outgoing.length}` },
              ]).map((tab) => (
                <Pressable
                  key={tab.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: requestTab === tab.value }}
                  onPress={() => setRequestTab(tab.value)}
                  style={[
                    styles.requestTab,
                    {
                      backgroundColor: requestTab === tab.value ? theme.accentSoft : theme.backgroundElement,
                      borderColor: requestTab === tab.value ? theme.accent : theme.divider,
                    },
                  ]}>
                  <Atom.ThemedText
                    type="smallBold"
                    style={{ color: requestTab === tab.value ? theme.accent : theme.text }}>
                    {tab.label}
                  </Atom.ThemedText>
                </Pressable>
              ))}
            </View>
            {!loaded && loading ? (
              <ActivityIndicator color={theme.accent} />
            ) : displayedRequests.length ? (
              displayedRequests.map((person) => (
                <View key={person.userId} style={styles.actionCard}>
                  <PersonCard person={person} />
                  <View style={styles.actions}>
                    {received ? (
                      <Atom.Button
                        label="Accept"
                        loading={pendingAction === `${token}:${person.userId}:add`}
                        disabled={readOnly || (pendingAction?.startsWith(`${token}:`) ?? false)}
                        onPress={() => void runAction(person.userId, 'add')}
                      />
                    ) : null}
                    <Atom.Button
                      label={received ? 'Reject' : 'Cancel request'}
                      variant="secondary"
                      loading={pendingAction === `${token}:${person.userId}:remove`}
                      disabled={readOnly || (pendingAction?.startsWith(`${token}:`) ?? false)}
                      onPress={() => void runAction(person.userId, 'remove')}
                    />
                  </View>
                  {readOnly ? (
                    <ReadOnlyHint action={received ? 'answer friend requests' : 'cancel friend requests'} />
                  ) : null}
                </View>
              ))
            ) : loaded && !failed ? (
              <Atom.ThemedText type="small" themeColor="textSecondary">
                {received ? 'No incoming friend requests.' : 'No outgoing friend requests.'}
              </Atom.ThemedText>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    flex: 1,
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
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  actionCard: {
    gap: Spacing.two,
  },
  personCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  presenceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  requestTabs: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  requestTab: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  errorBlock: {
    gap: Spacing.two,
  },
});
