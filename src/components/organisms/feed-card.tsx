import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import * as Atom from '@atom';
import * as Molecule from '@molecule';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReadOnly } from '@/lib/read-only';
import { findTextUrl } from '@/lib/rich-content';
import type { Author, FeedEntry, HiddenBecause, QuotedItem, QuotedPost, RepostedBy } from '@/lib/api';
import { CommentSection } from './comment-section';

type FeedCardProps = {
  item: FeedEntry;
  onLike: (item: FeedEntry) => void;
  onChange?: (item: FeedEntry) => void;
  canComment?: boolean;
  context?: string;
  compact?: boolean;
};

function relativeTime(date: string) {
  const elapsed = Math.max(0, Date.now() - new Date(date).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString();
}

function hiddenLabelOf(hiddenBecause: HiddenBecause | null | undefined) {
  if (!hiddenBecause) return null;
  if (hiddenBecause.kind === 'muted') return 'From someone you muted';
  if (hiddenBecause.kind === 'blocked') return 'Message from someone you blocked';
  return `Hidden because it mentions “${hiddenBecause.phrase}”`;
}

function displayNameOf(author: Author) {
  return author.name || author.username;
}

function openProfile(username: string) {
  router.push(`/users/${encodeURIComponent(username)}` as Href);
}

function activityText(activity: Extract<FeedEntry, { type: 'activity' }>): [string, string] {
  const { media, progress, status } = activity;
  if (progress) {
    const verb = media.type === 'manga' ? 'read' : 'watched';
    const unit = media.type === 'manga' ? 'chapter' : 'episode';
    const range = progress.from === progress.to
      ? `${unit} ${progress.to}`
      : `${unit}s ${progress.from}–${progress.to}`;
    return [`${verb} ${range} of`, ''];
  }

  const verb = { anime: 'watching', manga: 'reading', game: 'playing' }[media.type];
  const text: Record<typeof status, [string, string]> = {
    current: [`started ${verb}`, ''],
    completed: ['completed', ''],
    on_hold: ['put', 'on hold'],
    dropped: ['dropped', ''],
    planned: [`plans to ${verb.replace(/ing$/, '')}`, ''],
  };
  return text[status];
}

export function FeedCard({
  item,
  onLike,
  onChange,
  canComment = true,
  context,
  compact = false,
}: FeedCardProps) {
  const theme = useTheme();
  const readOnly = useReadOnly();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [showSpoiler, setShowSpoiler] = useState(false);
  const [likeHint, setLikeHint] = useState(false);
  const author = item.author;
  const displayName = displayNameOf(author);
  const hiddenLabel = hiddenLabelOf(item.hiddenBecause);
  const postContext =
    item.type === 'post'
      ? context
        ?? item.community?.name
        ?? (item.wallUser
          ? `Wall of ${item.wallUser.name || item.wallUser.username}`
          : 'Your wall')
      : '';
  const previewUrl = item.type === 'post'
    ? item.linkUrl ?? findTextUrl(item.content)
    : null;
  const [activityVerb, activitySuffix] =
    item.type === 'activity' ? activityText(item) : ['', ''];

  return (
    <View
      style={[
        styles.card,
        compact && styles.compactCard,
        { backgroundColor: theme.surface, borderColor: theme.divider },
      ]}>
      {hiddenLabel && !showHidden ? (
        <View style={[styles.gate, { backgroundColor: theme.backgroundElement, borderColor: theme.divider }]}>
          <Atom.ThemedText type="smallBold" style={styles.gateLabel}>
            {hiddenLabel}
          </Atom.ThemedText>
          <Atom.Button
            label={item.hiddenBecause?.kind === 'filtered' ? 'Show anyway' : 'Show'}
            variant="secondary"
            onPress={() => setShowHidden(true)}
          />
        </View>
      ) : (
        <>
          {item.repostedBy ? <RepostedByLabel repostedBy={item.repostedBy} /> : null}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View ${displayName}’s profile`}
            onPress={() => openProfile(author.username)}
            style={styles.authorRow}>
            {author.avatarUrl ? (
              <Image source={{ uri: author.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.rail }]}>
                <Atom.ThemedText type="smallBold">
                  {author.username.slice(0, 1).toUpperCase()}
                </Atom.ThemedText>
              </View>
            )}
            <View style={styles.authorInfo}>
              <Atom.ThemedText type="smallBold" numberOfLines={1}>
                {displayName}
              </Atom.ThemedText>
              <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                @{author.username}
                {item.type !== 'activity' ? ` · ${postContext}` : ''}
                {' · '}
                {relativeTime(item.createdAt)}
              </Atom.ThemedText>
            </View>
            {item.type === 'activity' && (
              <Atom.ThemedText type="smallBold" themeColor="textSecondary">
                Library
              </Atom.ThemedText>
            )}
          </Pressable>

          {item.type === 'activity' ? (
            <View style={styles.body}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`View discussions about ${item.media.title}`}
                onPress={() => router.push(
                  `/library/${item.media.type}/${encodeURIComponent(item.media.sourceId)}` as Href,
                )}
                style={styles.mediaRow}>
                {item.media.coverImage ? (
                  <Image source={{ uri: item.media.coverImage }} style={compact ? styles.compactCover : styles.cover} />
                ) : null}
                <View style={styles.authorInfo}>
                  <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={compact ? 2 : undefined}>
                    {activityVerb}{' '}
                    <Atom.ThemedText type="smallBold">
                      {item.media.title}
                    </Atom.ThemedText>
                    {activitySuffix ? ` ${activitySuffix}` : ''}
                  </Atom.ThemedText>
                  <Atom.ThemedText type="small" themeColor="textSecondary">
                    {item.media.type}
                    {item.media.year ? ` · ${item.media.year}` : ''}
                  </Atom.ThemedText>
                </View>
              </Pressable>
              {item.steam ? (
                <Atom.ThemedText type="small" themeColor="textSecondary">
                  Steam · {item.steam.minutes} minutes played
                </Atom.ThemedText>
              ) : null}
            </View>
          ) : (
            <View style={styles.body}>
              {item.hiddenAt ? (
                <Atom.ThemedText type="small" themeColor="textSecondary">
                  This post is hidden.
                </Atom.ThemedText>
              ) : item.spoiler !== null && item.spoiler !== undefined && !showSpoiler ? (
                <View style={[styles.gate, { backgroundColor: theme.backgroundElement, borderColor: theme.divider }]}>
                  <Atom.ThemedText type="smallBold" style={styles.gateLabel}>
                    {item.spoiler || 'Spoiler'}
                  </Atom.ThemedText>
                  <Atom.Button label="Show" variant="secondary" onPress={() => setShowSpoiler(true)} />
                </View>
              ) : (
                <>
                  {item.content ? <Molecule.RichContent content={item.content} /> : null}
                  {previewUrl ? <Molecule.LinkPreview url={previewUrl} /> : null}
                  {item.quote ? <QuoteEmbed quote={item.quote} /> : null}
                </>
              )}
            </View>
          )}

          <View style={[styles.actions, compact && styles.compactActions, { borderTopColor: theme.divider }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.liked ? 'Unlike' : 'Like'}
              accessibilityHint={readOnly ? 'Confirm your email first to like this.' : undefined}
              accessibilityState={{ disabled: readOnly }}
              onPress={() => (readOnly ? setLikeHint(true) : onLike(item))}
              style={({ pressed }) => [
                styles.action,
                readOnly ? styles.disabled : pressed && styles.pressed,
              ]}>
              <Atom.ThemedText
                type="smallBold"
                style={{ color: item.liked ? theme.accent : theme.text }}>
                {item.liked ? '♥' : '♡'} {item.likeCount}
              </Atom.ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.commentCount} ${item.commentCount === 1 ? 'comment' : 'comments'}`}
              accessibilityState={{ expanded: commentsOpen }}
              onPress={() => setCommentsOpen((open) => !open)}
              style={({ pressed }) => [styles.commentButton, pressed && styles.pressed]}>
              <Atom.ThemedText type="small" themeColor="textSecondary">
                {item.commentCount} {item.commentCount === 1 ? 'comment' : 'comments'}
              </Atom.ThemedText>
            </Pressable>
          </View>
          {readOnly && likeHint ? (
            <Atom.ThemedText type="small" themeColor="textSecondary">
              Confirm your email first to like this.
            </Atom.ThemedText>
          ) : null}
          {commentsOpen ? (
            <CommentSection
              target={{ type: item.type, id: item.id }}
              canComment={canComment}
              onCommentsChange={(commentCount) => onChange?.({ ...item, commentCount })}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function RepostedByLabel({ repostedBy }: { repostedBy: RepostedBy }) {
  const [first] = repostedBy.people;
  if (!first) return null;
  const others = repostedBy.total - 1;
  return (
    <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
      Reposted by{' '}
      <Atom.ThemedText
        type="smallBold"
        accessibilityRole="link"
        onPress={() => openProfile(first.username)}>
        {displayNameOf(first)}
      </Atom.ThemedText>
      {others > 0 ? ` and ${others} ${others === 1 ? 'other' : 'others'}` : ''}
    </Atom.ThemedText>
  );
}

function QuoteEmbed({ quote }: { quote: QuotedItem }) {
  const theme = useTheme();
  const [showHidden, setShowHidden] = useState(false);
  const boxStyle = [styles.quote, { borderColor: theme.divider }];

  if (!quote.available) {
    return (
      <View style={[...boxStyle, styles.unavailable, { backgroundColor: theme.backgroundElement }]}>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          This post isn’t available
        </Atom.ThemedText>
      </View>
    );
  }

  const hiddenBecause = quote.type === 'post' ? quote.post.hiddenBecause : quote.activity.hiddenBecause;
  const hiddenLabel = hiddenLabelOf(hiddenBecause);
  if (hiddenLabel && !showHidden) {
    return (
      <View style={[styles.gate, { backgroundColor: theme.backgroundElement, borderColor: theme.divider }]}>
        <Atom.ThemedText type="smallBold" style={styles.gateLabel}>
          {hiddenLabel}
        </Atom.ThemedText>
        <Atom.Button
          label={hiddenBecause?.kind === 'filtered' ? 'Show anyway' : 'Show'}
          variant="secondary"
          onPress={() => setShowHidden(true)}
        />
      </View>
    );
  }

  return (
    <View style={boxStyle}>
      {quote.type === 'post' ? (
        <QuotedPostBody post={quote.post} />
      ) : (
        <QuotedActivityBody activity={quote.activity} />
      )}
    </View>
  );
}

function QuotedPostBody({ post }: { post: QuotedPost }) {
  const theme = useTheme();
  const [showSpoiler, setShowSpoiler] = useState(false);
  const wallUser = post.wallUser && post.wallUser.id !== post.author.id ? post.wallUser : null;
  const where = post.community?.name
    ?? (wallUser ? `${displayNameOf(wallUser)}’s wall` : post.media?.title);

  return (
    <>
      <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        <Atom.ThemedText
          type="smallBold"
          accessibilityRole="link"
          onPress={() => openProfile(post.author.username)}>
          {displayNameOf(post.author)}
        </Atom.ThemedText>
        {where ? ` · ${where}` : ''}
        {' · '}
        {relativeTime(post.createdAt)}
      </Atom.ThemedText>
      {post.spoiler !== null && post.spoiler !== undefined && !showSpoiler ? (
        <View style={[styles.gate, { backgroundColor: theme.backgroundElement, borderColor: theme.divider }]}>
          <Atom.ThemedText type="smallBold" style={styles.gateLabel}>
            {post.spoiler || 'Spoiler'}
          </Atom.ThemedText>
          <Atom.Button label="Show" variant="secondary" onPress={() => setShowSpoiler(true)} />
        </View>
      ) : post.content ? (
        <Molecule.RichContent content={post.content} />
      ) : null}
    </>
  );
}

function QuotedActivityBody({ activity }: { activity: Extract<FeedEntry, { type: 'activity' }> }) {
  const [verb, suffix] = activityText(activity);
  return (
    <>
      <Atom.ThemedText type="small" themeColor="textSecondary">
        <Atom.ThemedText
          type="smallBold"
          accessibilityRole="link"
          onPress={() => openProfile(activity.author.username)}>
          {displayNameOf(activity.author)}
        </Atom.ThemedText>
        {` ${verb} `}
        <Atom.ThemedText type="smallBold">{activity.media.title}</Atom.ThemedText>
        {suffix ? ` ${suffix}` : ''}
      </Atom.ThemedText>
      <Atom.ThemedText type="small" themeColor="textSecondary">
        {activity.media.type}
        {activity.media.year ? ` · ${activity.media.year}` : ''}
        {' · '}
        {relativeTime(activity.createdAt)}
      </Atom.ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  compactCard: {
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
  authorInfo: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    gap: Spacing.two,
  },
  gate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: Spacing.two,
  },
  gateLabel: {
    flex: 1,
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cover: {
    width: 48,
    height: 64,
    borderRadius: 6,
  },
  compactCover: {
    width: 32,
    height: 44,
    borderRadius: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  action: {
    minHeight: 32,
    justifyContent: 'center',
  },
  commentButton: {
    minHeight: 36,
    justifyContent: 'center',
  },
  compactActions: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.5,
  },
  quote: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  unavailable: {
    borderStyle: 'dashed',
  },
});
