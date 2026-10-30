import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useCurrentProfile } from '@/hooks/use-current-profile';
import { useTheme } from '@/hooks/use-theme';
import { useCommunity } from '@/hooks/use-community';
import {
  getCommunityPosts,
  joinCommunity,
  setLike,
  type FeedEntry,
} from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { FeedCard } from './feed-card';

function entryKey(item: FeedEntry) {
  return `${item.type}-${item.id}`;
}

export function CommunityDetail({ communityId }: { communityId: string }) {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const { profile, failed: profileFailed, retry: retryProfile } = useCurrentProfile();
  const { loading, community, failed, retry } = useCommunity(communityId);
  const [joinedCommunity, setJoinedCommunity] = useState<{
    key: string;
    role: 'member';
    memberCount: number;
  } | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [postsPage, setPostsPage] = useState<{
    key: string;
    items: FeedEntry[];
    nextCursor: string | null;
    error: string | null;
  } | null>(null);
  const [postsAttempt, setPostsAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const id = Number(communityId);
  const postsKey = `${token ?? ''}:${id}:${postsAttempt}`;
  const currentPostsPage = postsPage?.key === postsKey ? postsPage : null;
  const posts = currentPostsPage?.items ?? null;
  const nextCursor = currentPostsPage?.nextCursor ?? null;
  const postsError = currentPostsPage?.error ?? null;
  const readOnly = !profile || profile.emailVerifiedAt === null;
  const currentCommunity = community && joinedCommunity?.key === `${token ?? ''}:${community.id}`
    ? { ...community, role: joinedCommunity.role, memberCount: joinedCommunity.memberCount }
    : community;

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) return;
    let active = true;
    getCommunityPosts(token, id)
      .then((page) => {
        if (!active) return;
        setPostsPage({
          key: postsKey,
          items: page.items,
          nextCursor: page.nextCursor,
          error: null,
        });
      })
      .catch((cause: unknown) => {
        if (active) {
          setPostsPage({
            key: postsKey,
            items: [],
            nextCursor: null,
            error: cause instanceof Error ? cause.message : 'Could not load community posts.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [id, postsKey, token]);

  async function handleJoin() {
    if (!token || joining || readOnly || !Number.isInteger(id) || id <= 0) return;
    setJoining(true);
    setJoinError(null);
    try {
      await joinCommunity(token, id);
      setJoinedCommunity({
        key: `${token}:${id}`,
        role: 'member',
        memberCount: (community?.memberCount ?? 0) + 1,
      });
    } catch (cause) {
      setJoinError(cause instanceof Error ? cause.message : 'Could not join the community.');
    } finally {
      setJoining(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getCommunityPosts(token, id, nextCursor);
      setPostsPage((current) => {
        if (current?.key !== postsKey) return current;
        const existing = new Set(current.items.map(entryKey));
        return {
          ...current,
          items: [...current.items, ...page.items.filter((item) => !existing.has(entryKey(item)))],
          nextCursor: page.nextCursor,
          error: null,
        };
      });
    } catch (cause) {
      setPostsPage((current) => current?.key === postsKey
        ? { ...current, error: cause instanceof Error ? cause.message : 'Could not load more posts.' }
        : current);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleLike(item: FeedEntry) {
    if (!token) return;
    const liked = !item.liked;
    try {
      const result = await setLike(token, item.type, item.id, liked);
      setPostsPage((current) => current?.key === postsKey
        ? {
            ...current,
            items: current.items.map((entry) =>
              entryKey(entry) === entryKey(item)
                ? { ...entry, ...result }
                : entry),
          }
        : current);
    } catch (cause) {
      setPostsPage((current) => current?.key === postsKey
        ? { ...current, error: cause instanceof Error ? cause.message : 'Could not save your like.' }
        : current);
    }
  }

  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={theme.accent} />
        <Atom.ThemedText type="small" themeColor="textSecondary">Loading community…</Atom.ThemedText>
      </View>
    );
  }

  if (failed || !currentCommunity) {
    return (
      <View style={styles.state}>
        <Atom.ErrorMessage>
          {failed ? 'Could not load this community.' : 'This community is private or no longer available.'}
        </Atom.ErrorMessage>
        {failed ? <Atom.Button label="Try again" variant="secondary" onPress={retry} /> : null}
      </View>
    );
  }

  const isMember = Boolean(currentCommunity.role);
  const canManage = currentCommunity.role === 'owner' || currentCommunity.role === 'admin';
  return (
    <View style={styles.page}>
      {currentCommunity.coverUrl ? (
        <Image source={{ uri: currentCommunity.coverUrl }} style={styles.cover} resizeMode="cover" />
      ) : null}
      <View style={[styles.community, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
        <View style={styles.heading}>
          {currentCommunity.iconUrl ? (
            <Image source={{ uri: currentCommunity.iconUrl }} style={styles.icon} />
          ) : (
            <View style={[styles.icon, styles.iconFallback, { backgroundColor: theme.rail }]}>
              <Atom.ThemedText type="subtitle">
                {currentCommunity.name.slice(0, 1).toUpperCase()}
              </Atom.ThemedText>
            </View>
          )}
          <View style={styles.title}>
            <Atom.ThemedText type="subtitle" numberOfLines={2}>
              {currentCommunity.name}{currentCommunity.isVerified ? ' ✓' : ''}
            </Atom.ThemedText>
            <Atom.ThemedText type="small" themeColor="textSecondary">
              {currentCommunity.memberCount?.toLocaleString() ?? '—'}{' '}
              {currentCommunity.memberCount === 1 ? 'member' : 'members'}
              {currentCommunity.isPublic === false ? ' · Private' : ' · Public'}
            </Atom.ThemedText>
          </View>
        </View>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          {currentCommunity.description || 'No description yet.'}
        </Atom.ThemedText>
        {!isMember ? (
          <>
            <Atom.Button
              label={readOnly ? (profile ? 'Confirm email to join' : 'Checking account…') : 'Join community'}
              loading={joining}
              disabled={readOnly}
              onPress={handleJoin}
            />
            {profile && profile.emailVerifiedAt === null ? (
              <Atom.ThemedText type="small" themeColor="textSecondary">
                Confirm your email before joining a community.
              </Atom.ThemedText>
            ) : null}
            {profileFailed ? (
              <View style={styles.accountError}>
                <Atom.ErrorMessage>Could not check your account.</Atom.ErrorMessage>
                <Atom.Button label="Retry account check" variant="secondary" onPress={retryProfile} />
              </View>
            ) : null}
          </>
        ) : canManage ? (
          <Atom.Button
            label="Community settings"
            variant="secondary"
            onPress={() => router.push(`/communities/${id}/settings` as Href)}
          />
        ) : null}
        {joinError ? <Atom.ErrorMessage>{joinError}</Atom.ErrorMessage> : null}
      </View>

      <Atom.ThemedText type="smallBold">Community activity</Atom.ThemedText>
      {postsError ? (
        <View style={styles.state}>
          <Atom.ErrorMessage>{postsError}</Atom.ErrorMessage>
          <Atom.Button
            label="Try again"
            variant="secondary"
            onPress={() => {
              setPostsAttempt((value) => value + 1);
            }}
          />
        </View>
      ) : posts === null ? (
        <View style={styles.state}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : posts.length ? (
        <View style={styles.posts}>
          {posts.map((item) => (
            <FeedCard key={entryKey(item)} item={item} onLike={handleLike} />
          ))}
          {nextCursor ? (
            <Atom.Button label="Load more" variant="secondary" loading={loadingMore} onPress={loadMore} />
          ) : null}
        </View>
      ) : (
        <Atom.ThemedText type="small" themeColor="textSecondary">
          No community activity yet.
        </Atom.ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    gap: Spacing.three,
  },
  cover: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  community: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  iconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posts: {
    gap: Spacing.three,
  },
  accountError: {
    gap: Spacing.two,
  },
  state: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
});
