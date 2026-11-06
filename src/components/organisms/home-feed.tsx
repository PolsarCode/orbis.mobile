import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Atom from '@atom';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createCommunityPost,
  createWallPost,
  getCommunities,
  getFeed,
  setLike,
  type Community,
  type FeedEntry,
  type Page,
} from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useFeedPreferencesHydrated, useFeedPreferencesStore } from '@/stores/feed-preferences-store';
import {
  feedContentTypes,
  filterFeedItems,
  feedItemKey,
  getNewFeedItems,
  mergeFeedItems,
  shownFeedTypes,
} from '@/lib/feed';
import { EmailConfirmNotice } from './email-confirm-notice';
import { FeedCard } from './feed-card';
import { PostComposer } from './post-composer';

function currentExcludedTypes() {
  const excluded = useFeedPreferencesStore.getState().excludedTypes;
  const shown = shownFeedTypes(excluded);
  return feedContentTypes.filter((type) => !shown.includes(type));
}

function isCurrentFeedRequest(token: string, version: number, excludedKey: string) {
  const auth = useAuthStore.getState();
  return (
    auth.token === token &&
    !auth.preferencesPending &&
    auth.preferencesVersion === version &&
    currentExcludedTypes().join(',') === excludedKey
  );
}

export function HomeFeed() {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const profile = useAuthStore((state) => state.profile);
  const preferencesPending = useAuthStore((state) => state.preferencesPending);
  const preferencesVersion = useAuthStore((state) => state.preferencesVersion);
  const fetchProfile = useAuthStore((state) => state.fetchProfile);
  const preferencesHydrated = useFeedPreferencesHydrated();
  const excludedFromStore = useFeedPreferencesStore((state) => state.excludedTypes);
  const view = useFeedPreferencesStore((state) => state.view);
  const toggleType = useFeedPreferencesStore((state) => state.toggleType);
  const setView = useFeedPreferencesStore((state) => state.setView);
  const showAllTypes = useFeedPreferencesStore((state) => state.showAll);
  const { excludedTypes, visibleTypes, excludedKey } = useMemo(() => {
    const visible = shownFeedTypes(excludedFromStore);
    const excluded = feedContentTypes.filter((type) => !visible.includes(type));
    return { excludedTypes: excluded, visibleTypes: visible, excludedKey: excluded.join(',') };
  }, [excludedFromStore]);
  const [items, setItems] = useState<FeedEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadedFeedKey, setLoadedFeedKey] = useState<string | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityId, setCommunityId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<FeedEntry[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const actionKeys = useRef(new Set<string>());
  const feedKey = `${token ?? 'signed-out'}:${preferencesVersion}:${excludedKey}`;
  const isFeedReady = !preferencesPending && preferencesHydrated && loadedFeedKey === feedKey;
  const visibleItems = isFeedReady ? items : null;
  const visibleNextCursor = isFeedReady ? nextCursor : null;
  const visibleFeedError = isFeedReady ? feedError : null;
  const visibleIncoming = isFeedReady
    ? incoming.filter((item) => visibleTypes.includes(item.type))
    : [];
  const loadedFeedKeyRef = useRef<string | null>(null);
  const feedRequestId = useRef(0);
  const feedRevision = useRef(0);
  const currentFeedRef = useRef<{ key: string; items: FeedEntry[] } | null>(null);
  const [accountToken, setAccountToken] = useState(token);

  if (accountToken !== token) {
    setAccountToken(token);
    setItems(null);
    setNextCursor(null);
    setLoadedFeedKey(null);
    setIncoming([]);
    setFeedError(null);
    setPollError(null);
    setCommunityId(null);
    setCommunities([]);
    setCommunityError(null);
    setAccountError(null);
    setActionError(null);
  }

  const commitFeedPage = useCallback((requestKey: string, page: Page<FeedEntry>) => {
    setItems(filterFeedItems(page.items, visibleTypes));
    setNextCursor(page.nextCursor);
    setIncoming([]);
    setFeedError(null);
    setPollError(null);
    loadedFeedKeyRef.current = requestKey;
    setLoadedFeedKey(requestKey);
  }, [visibleTypes]);

  const commitFeedError = useCallback((requestKey: string, cause: unknown) => {
    if (loadedFeedKeyRef.current !== requestKey) {
      setItems(null);
      setNextCursor(null);
      setIncoming([]);
    }
    loadedFeedKeyRef.current = requestKey;
    setLoadedFeedKey(requestKey);
    setFeedError(cause instanceof Error ? cause.message : 'Could not load your feed.');
    setPollError(null);
  }, []);

  const loadFeed = useCallback(async () => {
    if (!token || !preferencesHydrated || useAuthStore.getState().preferencesPending) return;
    const version = preferencesVersion;
    const requestKey = feedKey;
    const requestId = ++feedRequestId.current;
    feedRevision.current += 1;

    try {
      const page = await getFeed(token, undefined, excludedTypes);
      if (
        requestId !== feedRequestId.current ||
        !isCurrentFeedRequest(token, version, excludedKey)
      ) return;
      commitFeedPage(requestKey, page);
    } catch (cause) {
      if (
        requestId !== feedRequestId.current ||
        !isCurrentFeedRequest(token, version, excludedKey)
      ) return;
      commitFeedError(requestKey, cause);
    }
  }, [
    excludedKey,
    excludedTypes,
    feedKey,
    preferencesHydrated,
    preferencesVersion,
    token,
    commitFeedError,
    commitFeedPage,
  ]);

  const refreshFeed = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFeed();
    } finally {
      setRefreshing(false);
    }
  }, [loadFeed]);

  useEffect(() => {
    if (!token || preferencesPending || !preferencesHydrated) return;
    let active = true;
    const requestKey = feedKey;
    const version = preferencesVersion;
    const requestId = ++feedRequestId.current;
    feedRevision.current += 1;

    getFeed(token, undefined, excludedTypes)
      .then((page) => {
        if (
          !active ||
          requestId !== feedRequestId.current ||
          !isCurrentFeedRequest(token, version, excludedKey)
        ) return;
        commitFeedPage(requestKey, page);
      })
      .catch((cause: unknown) => {
        if (
          !active ||
          requestId !== feedRequestId.current ||
          !isCurrentFeedRequest(token, version, excludedKey)
        ) return;
        commitFeedError(requestKey, cause);
      });

    return () => {
      active = false;
      if (requestId === feedRequestId.current) feedRequestId.current += 1;
    };
  }, [
    excludedKey,
    excludedTypes,
    feedKey,
    preferencesHydrated,
    preferencesPending,
    preferencesVersion,
    token,
    commitFeedError,
    commitFeedPage,
  ]);

  useEffect(() => {
    currentFeedRef.current = isFeedReady && visibleItems
      ? { key: feedKey, items: visibleItems }
      : null;
  }, [feedKey, isFeedReady, visibleItems]);

  useEffect(() => {
    if (!token || profile) return;
    let active = true;
    fetchProfile()
      .then((result) => {
        if (active && useAuthStore.getState().token === token && !result) {
          setAccountError('Your profile could not be loaded. Please log in again.');
        }
      })
      .catch((error: unknown) => {
        if (active && useAuthStore.getState().token === token) {
          setAccountError(error instanceof Error ? error.message : 'Your profile could not be loaded.');
        }
      });
    return () => {
      active = false;
    };
  }, [fetchProfile, profile, token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    getCommunities(token)
      .then((result) => {
        if (active && useAuthStore.getState().token === token) setCommunities(result);
      })
      .catch((error: unknown) => {
        if (active && useAuthStore.getState().token === token) {
          setCommunityError(error instanceof Error ? error.message : 'Could not load your communities.');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  useFocusEffect(useCallback(() => {
    const activeToken = token ?? '';
    if (!activeToken || !preferencesHydrated || preferencesPending) return undefined;
    let active = true;
    let checking = false;

    async function checkForNewItems() {
      if (checking || AppState.currentState !== 'active') return;
      const snapshot = currentFeedRef.current;
      if (!snapshot || snapshot.key !== feedKey) return;
      checking = true;
      try {
        const page = await getFeed(activeToken, undefined, excludedTypes);
        if (!active || !isCurrentFeedRequest(activeToken, preferencesVersion, excludedKey)) return;
        const fresh = getNewFeedItems(snapshot.items, filterFeedItems(page.items, visibleTypes));
        if (fresh.length) {
          setIncoming((current) => mergeFeedItems(fresh, current));
        }
        setPollError(null);
      } catch (cause) {
        if (active && isCurrentFeedRequest(activeToken, preferencesVersion, excludedKey)) {
          setPollError(cause instanceof Error ? cause.message : 'Could not check for new posts.');
        }
      } finally {
        checking = false;
      }
    }

    const timer = setInterval(() => {
      void checkForNewItems();
    }, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForNewItems();
    });
    void checkForNewItems();
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [
    excludedKey,
    excludedTypes,
    feedKey,
    preferencesHydrated,
    preferencesPending,
    preferencesVersion,
    token,
    visibleTypes,
  ]));

  const loadMore = useCallback(async () => {
    if (
      !token ||
      preferencesPending ||
      !preferencesHydrated ||
      !isFeedReady ||
      !nextCursor ||
      loadingMoreRef.current
    ) return;
    const version = preferencesVersion;
    const requestKey = feedKey;
    const revision = feedRevision.current;
    const cursor = nextCursor;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setFeedError(null);
    try {
      const page = await getFeed(token, cursor, excludedTypes);
      if (
        revision !== feedRevision.current ||
        loadedFeedKeyRef.current !== requestKey ||
        !isCurrentFeedRequest(token, version, excludedKey)
      ) return;
      const visiblePage = filterFeedItems(page.items, visibleTypes);
      setItems((current) => (current ? mergeFeedItems(current, visiblePage) : visiblePage));
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (
        revision === feedRevision.current &&
        loadedFeedKeyRef.current === requestKey &&
        isCurrentFeedRequest(token, version, excludedKey)
      ) {
        setFeedError(cause instanceof Error ? cause.message : 'Could not load more posts.');
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [
    excludedKey,
    excludedTypes,
    feedKey,
    isFeedReady,
    nextCursor,
    preferencesHydrated,
    preferencesPending,
    preferencesVersion,
    token,
    visibleTypes,
  ]);

  async function handlePost(message: string, url?: string) {
    if (!token || !profile) throw new Error('Your account could not be loaded. Please try again.');
    const requestToken = token;
    const requestFeedKey = feedKey;
    const post = communityId === null
      ? await createWallPost(requestToken, profile.username, message, url)
      : await createCommunityPost(requestToken, communityId, message, url);
    if (useAuthStore.getState().token !== requestToken) return;
    if (visibleTypes.includes('post') && loadedFeedKeyRef.current === requestFeedKey) {
      setItems((current) => current ? mergeFeedItems([post], current) : current);
    }
    setActionError(null);
  }

  function handleFeedChange(updated: FeedEntry) {
    const key = feedItemKey(updated);
    setItems((current) => current?.map((item) => feedItemKey(item) === key ? updated : item) ?? null);
  }

  async function handleLike(item: FeedEntry) {
    if (!token) return;
    const key = feedItemKey(item);
    const actionKey = `${token}:${key}`;
    if (actionKeys.current.has(actionKey)) return;
    actionKeys.current.add(actionKey);
    const liked = !item.liked;
    const nextCount = item.likeCount + (liked ? 1 : -1);
    setItems((current) => current?.map((entry) =>
    feedItemKey(entry) === key
        ? { ...entry, liked, likeCount: nextCount }
        : entry,
    ) ?? null);
    setActionError(null);
    try {
      const result = await setLike(token, item.type, item.id, liked);
      if (useAuthStore.getState().token !== token) return;
      setItems((current) => current?.map((entry) =>
        feedItemKey(entry) === key
          ? { ...entry, ...result }
          : entry,
      ) ?? null);
    } catch (error) {
      if (useAuthStore.getState().token !== token) return;
      setItems((current) => current?.map((entry) =>
        feedItemKey(entry) === key
          ? { ...entry, liked: item.liked, likeCount: item.likeCount }
          : entry,
      ) ?? null);
      setActionError(error instanceof Error ? error.message : 'Could not save your like.');
    } finally {
      actionKeys.current.delete(actionKey);
    }
  }

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.pageHeading}>
        <Atom.ThemedText type="subtitle" style={styles.heading}>
          Home
        </Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Posts and conversations from your communities.
        </Atom.ThemedText>
      </View>
      <View style={styles.feedOptions}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}>
          {feedContentTypes.map((type) => {
            const selected = visibleTypes.includes(type);
            return (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityState={{
                  selected,
                  disabled: !preferencesHydrated || (selected && visibleTypes.length === 1),
                }}
                disabled={!preferencesHydrated || (selected && visibleTypes.length === 1)}
                onPress={() => toggleType(type)}
                style={({ pressed }) => [
                  styles.filterChip,
                  {
                    backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
                    borderColor: selected ? theme.accent : theme.divider,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}>
                <Atom.ThemedText
                  type="smallBold"
                  style={{ color: selected ? theme.accent : theme.text }}>
                  {type === 'post' ? 'Posts' : 'Library updates'}
                </Atom.ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.viewOptions}>
          {(['card', 'compact'] as const).map((mode) => (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected: view === mode, disabled: !preferencesHydrated }}
              disabled={!preferencesHydrated}
              onPress={() => setView(mode)}
              style={({ pressed }) => [
                styles.viewChip,
                {
                  backgroundColor: view === mode ? theme.accent : theme.backgroundElement,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}>
              <Atom.ThemedText
                type="smallBold"
                style={{ color: view === mode ? theme.accentForeground : theme.text }}>
                {mode === 'card' ? 'Card' : 'Compact'}
              </Atom.ThemedText>
            </Pressable>
          ))}
          {excludedTypes.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={showAllTypes}
              style={({ pressed }) => [styles.resetFilters, pressed && styles.pressed]}>
              <Atom.ThemedText type="smallBold" style={{ color: theme.accent }}>
                Reset filters
              </Atom.ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>
      {visibleIncoming.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setItems((current) => mergeFeedItems(visibleIncoming, current ?? []));
            setIncoming([]);
          }}
          style={({ pressed }) => [
            styles.newPosts,
            { backgroundColor: theme.accent, opacity: pressed ? 0.82 : 1 },
          ]}>
          <Atom.ThemedText
            type="smallBold"
            style={{ color: theme.accentForeground }}>
            Show {visibleIncoming.length} new {visibleIncoming.length === 1 ? 'post' : 'posts'}
          </Atom.ThemedText>
        </Pressable>
      ) : null}
      {profile && profile.emailVerifiedAt === null ? (
        <EmailConfirmNotice email={profile.email} />
      ) : profile ? (
        <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
          <Atom.ThemedText type="smallBold">Share an update</Atom.ThemedText>
          {communities.length > 0 ? (
            <View style={styles.destinationSection}>
              <Atom.ThemedText type="small" themeColor="textSecondary">
                Post to
              </Atom.ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destinationList}>
                <DestinationChip
                  label="Your wall"
                  active={communityId === null}
                  onPress={() => setCommunityId(null)}
                />
                {communities.map((community) => (
                  <DestinationChip
                    key={community.id}
                    label={community.name}
                    active={communityId === community.id}
                    onPress={() => setCommunityId(community.id)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
          {communityError ? <Atom.ErrorMessage>{communityError}</Atom.ErrorMessage> : null}
          {actionError ? <Atom.ErrorMessage>{actionError}</Atom.ErrorMessage> : null}
          <PostComposer placeholder="What’s on your mind?" onPost={handlePost} />
        </View>
      ) : accountError ? (
        <Atom.ErrorMessage>{accountError}</Atom.ErrorMessage>
      ) : (
        <View style={styles.profileLoading}>
          <ActivityIndicator color={theme.accent} />
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Loading your profile…
          </Atom.ThemedText>
        </View>
      )}
      {visibleFeedError && visibleItems ? <Atom.ErrorMessage>{visibleFeedError}</Atom.ErrorMessage> : null}
      {pollError && isFeedReady ? (
        <Atom.ErrorMessage>
          Could not check for new posts. Pull down to retry. {pollError}
        </Atom.ErrorMessage>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
        <FlatList
          data={visibleItems ?? []}
          keyExtractor={feedItemKey}
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              onLike={handleLike}
              onChange={handleFeedChange}
              canComment={item.type !== 'post' || item.communityId === null || communities.some((community) => community.id === item.communityId)}
              compact={view === 'compact'}
            />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            !isFeedReady ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={theme.accent} />
                <Atom.ThemedText type="small" themeColor="textSecondary">
                  Loading posts…
                </Atom.ThemedText>
              </View>
            ) : visibleFeedError && !visibleItems ? (
              <View style={styles.emptyState}>
                <Atom.ErrorMessage>{visibleFeedError}</Atom.ErrorMessage>
                <Atom.Button label="Try again" variant="secondary" onPress={() => loadFeed()} />
              </View>
            ) : visibleItems?.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
                <Atom.ThemedText type="smallBold">
                  {excludedTypes.length ? 'No posts match these filters.' : 'Your feed is quiet for now.'}
                </Atom.ThemedText>
                <Atom.ThemedText type="small" themeColor="textSecondary">
                  {excludedTypes.length
                    ? 'Try adjusting your filters to see more of your feed.'
                    : 'Join a community or share a post to get the conversation started.'}
                </Atom.ThemedText>
                {excludedTypes.length ? (
                  <Atom.Button label="Reset filters" variant="secondary" onPress={showAllTypes} />
                ) : null}
              </View>
            ) : undefined
          }
          ListFooterComponent={
            visibleItems?.length && visibleNextCursor ? (
              <View style={styles.footer}>
                {visibleFeedError ? <Atom.ErrorMessage>{visibleFeedError}</Atom.ErrorMessage> : null}
                <Atom.Button
                  label={loadingMore ? 'Loading…' : visibleFeedError ? 'Try loading more' : 'Load more'}
                  variant="secondary"
                  loading={loadingMore}
                  onPress={loadMore}
                />
              </View>
            ) : undefined
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refreshFeed()}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          onEndReached={() => {
            if (visibleNextCursor) void loadMore();
          }}
          onEndReachedThreshold={0.5}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DestinationChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.destinationChip,
        {
          backgroundColor: active ? theme.accentSoft : theme.backgroundElement,
          borderColor: active ? theme.accent : theme.divider,
          opacity: pressed ? 0.72 : 1,
        },
      ]}>
      <Atom.ThemedText
        type="smallBold"
        style={{ color: active ? theme.accent : theme.text }}
        numberOfLines={1}>
        {label}
      </Atom.ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  listContent: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
  },
  headerContent: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  pageHeading: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  feedOptions: {
    gap: Spacing.two,
  },
  filterList: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  filterChip: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  viewOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  viewChip: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
  },
  resetFilters: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  newPosts: {
    alignSelf: 'center',
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
  },
  heading: {
    fontSize: 30,
    lineHeight: 36,
  },
  composer: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
  },
  destinationSection: {
    gap: Spacing.one,
  },
  destinationList: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  destinationChip: {
    maxWidth: 200,
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
  },
  profileLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.five,
  },
  emptyCard: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.four,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.65,
  },
});
