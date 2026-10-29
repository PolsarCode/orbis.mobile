import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
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
  vote,
  type Community,
  type FeedEntry,
} from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { EmailConfirmNotice } from './email-confirm-notice';
import { FeedCard } from './feed-card';

function entryKey(item: FeedEntry) {
  return `${item.type}-${item.id}`;
}

export function HomeFeed() {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const profile = useAuthStore((state) => state.profile);
  const preferencesPending = useAuthStore((state) => state.preferencesPending);
  const preferencesVersion = useAuthStore((state) => state.preferencesVersion);
  const fetchProfile = useAuthStore((state) => state.fetchProfile);
  const [items, setItems] = useState<FeedEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadedPreferencesVersion, setLoadedPreferencesVersion] = useState(-1);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityId, setCommunityId] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [posting, setPosting] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const actionKeys = useRef(new Set<string>());
  const visibleItems =
    !preferencesPending && loadedPreferencesVersion === preferencesVersion ? items : null;
  const visibleNextCursor =
    !preferencesPending && loadedPreferencesVersion === preferencesVersion ? nextCursor : null;
  const visibleFeedError =
    !preferencesPending && loadedPreferencesVersion === preferencesVersion ? feedError : null;
  const visibleInitialLoading =
    initialLoading || preferencesPending || loadedPreferencesVersion !== preferencesVersion;

  const loadFeed = useCallback(async (refresh = false) => {
    if (
      !token ||
      useAuthStore.getState().preferencesPending ||
      loadedPreferencesVersion !== preferencesVersion
    ) return;
    const version = preferencesVersion;
    if (refresh) setRefreshing(true);
    else setInitialLoading(true);
    try {
      const page = await getFeed(token);
      const current = useAuthStore.getState();
      if (
        current.token !== token ||
        current.preferencesPending ||
        current.preferencesVersion !== version
      ) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setLoadedPreferencesVersion(version);
      setFeedError(null);
    } catch (error) {
      const current = useAuthStore.getState();
      if (
        current.token === token &&
        !current.preferencesPending &&
        current.preferencesVersion === version
      ) {
        setFeedError(error instanceof Error ? error.message : 'Could not load your feed.');
      }
    } finally {
      if (useAuthStore.getState().token === token) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [loadedPreferencesVersion, preferencesVersion, token]);

  useEffect(() => {
    if (!token) return;
    if (preferencesPending) return;

    let active = true;
    getFeed(token)
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setLoadedPreferencesVersion(preferencesVersion);
        setFeedError(null);
      })
      .catch((error: unknown) => {
        if (active) {
          setItems(null);
          setNextCursor(null);
          setLoadedPreferencesVersion(preferencesVersion);
          setFeedError(error instanceof Error ? error.message : 'Could not load your feed.');
        }
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [preferencesPending, preferencesVersion, token]);

  useEffect(() => {
    if (!token || profile) return;
    fetchProfile()
      .then((result) => {
        if (!result) setAccountError('Your profile could not be loaded. Please log in again.');
      })
      .catch((error: unknown) => {
        setAccountError(error instanceof Error ? error.message : 'Your profile could not be loaded.');
      });
  }, [fetchProfile, profile, token]);

  useEffect(() => {
    if (!token) return;
    getCommunities(token)
      .then(setCommunities)
      .catch((error: unknown) => {
        setCommunityError(error instanceof Error ? error.message : 'Could not load your communities.');
      });
  }, [token]);

  const loadMore = useCallback(async () => {
    if (
      !token ||
      preferencesPending ||
      loadedPreferencesVersion !== preferencesVersion ||
      !nextCursor ||
      loadingMoreRef.current
    ) return;
    const version = preferencesVersion;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setFeedError(null);
    try {
      const page = await getFeed(token, nextCursor);
      const current = useAuthStore.getState();
      if (
        current.token !== token ||
        current.preferencesPending ||
        current.preferencesVersion !== version
      ) return;
      setItems((current) => {
        const existing = new Set((current ?? []).map(entryKey));
        return [...(current ?? []), ...page.items.filter((item) => !existing.has(entryKey(item)))];
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      const current = useAuthStore.getState();
      if (
        current.token === token &&
        !current.preferencesPending &&
        current.preferencesVersion === version
      ) {
        setFeedError(error instanceof Error ? error.message : 'Could not load more posts.');
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [loadedPreferencesVersion, nextCursor, preferencesPending, preferencesVersion, token]);

  async function handlePost() {
    if (!token || !profile || posting) return;
    const message = content.trim();
    const url = linkUrl.trim();
    if (!message && !url) {
      setActionError('Write something or add a link before posting.');
      return;
    }

    setPosting(true);
    setActionError(null);
    try {
      const post = communityId === null
        ? await createWallPost(token, profile.username, message, url || undefined)
        : await createCommunityPost(token, communityId, message, url || undefined);
      setItems((current) => [post, ...(current ?? []).filter((item) => entryKey(item) !== entryKey(post))]);
      setContent('');
      setLinkUrl('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not post. Please try again.');
    } finally {
      setPosting(false);
    }
  }

  async function handleLike(item: FeedEntry) {
    if (!token || item.type === 'thread') return;
    const key = entryKey(item);
    if (actionKeys.current.has(key)) return;
    actionKeys.current.add(key);
    const liked = !item.liked;
    const nextCount = item.likeCount + (liked ? 1 : -1);
    setItems((current) => current?.map((entry) =>
      entryKey(entry) === key && entry.type !== 'thread'
        ? { ...entry, liked, likeCount: nextCount }
        : entry,
    ) ?? null);
    setActionError(null);
    try {
      const result = await setLike(token, item.type, item.id, liked);
      setItems((current) => current?.map((entry) =>
        entryKey(entry) === key && entry.type !== 'thread'
          ? { ...entry, ...result }
          : entry,
      ) ?? null);
    } catch (error) {
      setItems((current) => current?.map((entry) =>
        entryKey(entry) === key && entry.type !== 'thread'
          ? { ...entry, liked: item.liked, likeCount: item.likeCount }
          : entry,
      ) ?? null);
      setActionError(error instanceof Error ? error.message : 'Could not save your like.');
    } finally {
      actionKeys.current.delete(key);
    }
  }

  async function handleVote(item: Extract<FeedEntry, { type: 'thread' }>, value: -1 | 0 | 1) {
    if (!token) return;
    const key = entryKey(item);
    if (actionKeys.current.has(key)) return;
    actionKeys.current.add(key);
    const score = item.score - item.myVote + value;
    setItems((current) => current?.map((entry) =>
      entryKey(entry) === key && entry.type === 'thread'
        ? { ...entry, score, myVote: value }
        : entry,
    ) ?? null);
    setActionError(null);
    try {
      const result = await vote(token, item.id, value);
      setItems((current) => current?.map((entry) =>
        entryKey(entry) === key && entry.type === 'thread'
          ? { ...entry, ...result }
          : entry,
      ) ?? null);
    } catch (error) {
      setItems((current) => current?.map((entry) =>
        entryKey(entry) === key && entry.type === 'thread'
          ? { ...entry, score: item.score, myVote: item.myVote }
          : entry,
      ) ?? null);
      setActionError(error instanceof Error ? error.message : 'Could not save your vote.');
    } finally {
      actionKeys.current.delete(key);
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
      {profile && profile.emailVerifiedAt === null ? (
        <EmailConfirmNotice email={profile.email} />
      ) : profile ? (
        <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
          <Atom.ThemedText type="smallBold">Share an update</Atom.ThemedText>
          <Atom.Input
            accessibilityLabel="Post content"
            multiline
            maxLength={20_000}
            placeholder="What’s on your mind?"
            textAlignVertical="top"
            value={content}
            onChangeText={setContent}
            style={styles.contentInput}
          />
          <Atom.Input
            accessibilityLabel="Link URL"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="Add a link (optional)"
            value={linkUrl}
            onChangeText={setLinkUrl}
          />
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
          <View style={styles.composerFooter}>
            <Atom.ThemedText type="small" themeColor="textSecondary">
              {content.length}/20,000
            </Atom.ThemedText>
            <Atom.Button
              label="Post"
              loading={posting}
              disabled={(!content.trim() && !linkUrl.trim()) || !profile}
              onPress={handlePost}
            />
          </View>
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
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: theme.background }]}>
      <FlatList
        data={visibleItems ?? []}
        keyExtractor={entryKey}
        renderItem={({ item }) => (
          <FeedCard item={item} onLike={handleLike} onVote={handleVote} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          visibleInitialLoading ? (
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
              <Atom.ThemedText type="smallBold">Your feed is quiet for now.</Atom.ThemedText>
              <Atom.ThemedText type="small" themeColor="textSecondary">
                Join a community or share a post to get the conversation started.
              </Atom.ThemedText>
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
            onRefresh={() => loadFeed(true)}
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
  contentInput: {
    minHeight: 88,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
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
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
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
});
