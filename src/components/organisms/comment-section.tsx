import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import * as Atom from '@atom';
import * as Molecule from '@molecule';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createComment,
  getComments,
  setLike,
  type Comment,
  type Commentable,
} from '@/lib/api';
import { useReadOnly } from '@/lib/read-only';
import { findTextUrl } from '@/lib/rich-content';
import { sessionFingerprint } from '@/lib/session';
import { useAuthStore } from '@/stores/auth-store';
import { PostComposer } from './post-composer';

type CommentNode = Comment & { replies: CommentNode[] };

const commentMaxLength = 10_000;

function buildTree(comments: Comment[]): CommentNode[] {
  const nodes = new Map(comments.map((comment) => [comment.id, { ...comment, replies: [] as CommentNode[] }]));
  const roots: CommentNode[] = [];

  for (const node of nodes.values()) {
    let parentId = node.parentId;
    const seen = new Set([node.id]);
    let cyclic = false;
    while (parentId !== null) {
      if (seen.has(parentId)) {
        cyclic = true;
        break;
      }
      seen.add(parentId);
      parentId = nodes.get(parentId)?.parentId ?? null;
    }

    const parent = cyclic || node.parentId === null ? null : nodes.get(node.parentId) ?? null;
    (parent ? parent.replies : roots).push(node);
  }

  const sort = (items: CommentNode[]) => {
    items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id);
    items.forEach((item) => sort(item.replies));
  };
  sort(roots);
  return roots;
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Date(value).toLocaleDateString();
}

function CommentItem({
  node,
  canReply,
  onReply,
  onLike,
}: {
  node: CommentNode;
  canReply: boolean;
  onReply: (content: string, parentId?: number, linkUrl?: string) => Promise<void>;
  onLike: (comment: Comment, liked: boolean) => Promise<void>;
}) {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const readOnly = useReadOnly();
  const [replying, setReplying] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  const [likeHint, setLikeHint] = useState(false);
  const name = node.author.name || node.author.username;
  const hiddenLabel = node.hidden === 'reported'
    ? 'You reported this comment.'
    : node.hidden === 'review'
      ? 'This comment is hidden while admins review it.'
      : null;
  const previewUrl = node.linkUrl ?? findTextUrl(node.content);

  async function toggleLike() {
    if (readOnly) {
      setLikeHint(true);
      return;
    }
    if (!token || likePending) return;
    const liked = !node.liked;
    setLikePending(true);
    setLikeError(null);
    try {
      await onLike(node, liked);
    } catch (cause) {
      setLikeError(cause instanceof Error ? cause.message : 'Could not save your reaction.');
    } finally {
      setLikePending(false);
    }
  }

  const replies = node.replies.length ? (
    <View style={[styles.replies, { borderLeftColor: theme.divider }]}>
      {node.replies.map((reply) => (
        <CommentItem
          key={reply.id}
          node={reply}
          canReply={canReply}
          onReply={onReply}
          onLike={onLike}
        />
      ))}
    </View>
  ) : null;

  if (node.deleted) {
    return (
      <View style={styles.comment}>
        <Atom.ThemedText type="small" themeColor="textSecondary" style={styles.deleted}>
          Comment deleted
        </Atom.ThemedText>
        {replies}
      </View>
    );
  }

  return (
    <View style={styles.comment}>
      <View style={styles.authorRow}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`View ${name}’s profile`}
          onPress={() => router.push(`/users/${encodeURIComponent(node.author.username)}` as Href)}>
          {node.author.avatarUrl ? (
            <Image source={{ uri: node.author.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.rail }]}>
              <Atom.ThemedText type="smallBold">{name.slice(0, 1).toUpperCase()}</Atom.ThemedText>
            </View>
          )}
        </Pressable>
        <View style={styles.authorInfo}>
          <Atom.ThemedText type="smallBold" numberOfLines={1}>{name}</Atom.ThemedText>
          <Atom.ThemedText type="small" themeColor="textSecondary">
            @{node.author.username} · {relativeTime(node.createdAt)}
          </Atom.ThemedText>
        </View>
      </View>
      {hiddenLabel ? (
        <Atom.ThemedText type="small" themeColor="textSecondary">{hiddenLabel}</Atom.ThemedText>
      ) : (
        <>
          {node.content ? <Molecule.RichContent content={node.content} /> : null}
          {previewUrl ? <Molecule.LinkPreview url={previewUrl} /> : null}
        </>
      )}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={node.liked ? 'Unlike comment' : 'Like comment'}
          accessibilityHint={readOnly ? 'Confirm your email first to like this.' : undefined}
          accessibilityState={{ disabled: !token || readOnly || likePending, busy: likePending }}
          disabled={!token || likePending}
          onPress={() => void toggleLike()}
          style={({ pressed }) => [
            styles.action,
            { opacity: readOnly ? 0.5 : pressed || likePending ? 0.65 : 1 },
          ]}>
          <Atom.ThemedText
            type="smallBold"
            style={{ color: node.liked ? theme.accent : theme.textSecondary }}>
            {node.liked ? '♥' : '♡'} {node.likeCount}
          </Atom.ThemedText>
        </Pressable>
        {canReply ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: replying }}
            onPress={() => setReplying((current) => !current)}
            style={styles.action}>
            <Atom.ThemedText type="smallBold" themeColor="textSecondary">
              {replying ? 'Cancel' : 'Reply'}
            </Atom.ThemedText>
          </Pressable>
        ) : null}
      </View>
      {readOnly && likeHint ? (
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Confirm your email first to like this.
        </Atom.ThemedText>
      ) : null}
      {likeError ? <Atom.ErrorMessage>{likeError}</Atom.ErrorMessage> : null}
      {replying ? (
        <PostComposer
          target={`Replying to @${node.author.username}`}
          placeholder="Write a reply…"
          submitLabel="Reply"
          maxLength={commentMaxLength}
          onPost={async (content, linkUrl) => {
            await onReply(content, node.id, linkUrl);
            setReplying(false);
          }}
        />
      ) : null}
      {replies}
    </View>
  );
}

export function CommentSection({
  target,
  canComment,
  onCommentsChange,
}: {
  target: Commentable;
  canComment: boolean;
  onCommentsChange: (count: number) => void;
}) {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const [page, setPage] = useState<{
    key: string;
    comments: Comment[] | null;
    error: string | null;
  } | null>(null);
  const commentsRef = useRef<Comment[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const onCommentsChangeRef = useRef(onCommentsChange);
  const { type, id } = target;
  const loadKey = `${sessionFingerprint(token)}:${type}:${id}:${attempt}`;
  const currentPage = page?.key === loadKey ? page : null;
  const comments = currentPage?.comments ?? null;
  const error = currentPage?.error ?? null;

  useEffect(() => {
    onCommentsChangeRef.current = onCommentsChange;
  }, [onCommentsChange]);

  useEffect(() => {
    let active = true;
    commentsRef.current = null;
    getComments(token, { type, id })
      .then((result) => {
        if (!active) return;
        const merged = [...result];
        const existingIds = new Set(merged.map((comment) => comment.id));
        for (const comment of commentsRef.current ?? []) {
          if (!existingIds.has(comment.id)) merged.push(comment);
        }
        const visible = merged.filter((comment) => !comment.deleted);
        commentsRef.current = merged;
        setPage({ key: loadKey, comments: merged, error: null });
        onCommentsChangeRef.current(visible.length);
      })
      .catch((cause: unknown) => {
        if (active) {
          setPage({
            key: loadKey,
            comments: null,
            error: cause instanceof Error ? cause.message : 'Could not load comments.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [id, loadKey, token, type]);

  async function reply(content: string, parentId?: number, linkUrl?: string) {
    if (!token) throw new Error('Please log in to join the conversation.');
    const created = await createComment(token, { type, id }, content, parentId, linkUrl);
    const next = [...(commentsRef.current ?? []), created];
    commentsRef.current = next;
    setPage({ key: loadKey, comments: next, error: null });
    onCommentsChangeRef.current(next.filter((comment) => !comment.deleted).length);
  }

  async function like(comment: Comment, liked: boolean) {
    if (!token) throw new Error('Please log in to react to comments.');
    const result = await setLike(token, 'comment', comment.id, liked);
    const next = (commentsRef.current ?? []).map((item) =>
      item.id === comment.id ? { ...item, ...result } : item,
    );
    commentsRef.current = next;
    setPage({ key: loadKey, comments: next, error: null });
  }

  const visibleComments = comments?.filter((comment) => !comment.deleted) ?? null;

  return (
    <View style={[styles.section, { borderTopColor: theme.divider }]}>
      <View style={styles.heading}>
        <Atom.ThemedText type="smallBold">
          {visibleComments
            ? `${visibleComments.length} ${visibleComments.length === 1 ? 'comment' : 'comments'}`
            : 'Comments'}
        </Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">Oldest first</Atom.ThemedText>
      </View>
      {canComment ? (
        <PostComposer
          placeholder="Write a comment…"
          submitLabel="Comment"
          maxLength={commentMaxLength}
          onPost={(content, linkUrl) => reply(content, undefined, linkUrl)}
        />
      ) : (
        <Atom.ThemedText type="small" themeColor="textSecondary">
          {token ? 'Join this community to comment.' : 'Log in to join the conversation.'}
        </Atom.ThemedText>
      )}
      {error ? (
        <View style={styles.error}>
          <Atom.ErrorMessage>{error}</Atom.ErrorMessage>
          <Atom.Button
            label="Try again"
            variant="secondary"
            onPress={() => setAttempt((value) => value + 1)}
          />
        </View>
      ) : comments === null ? (
        <View style={styles.loading}>
          <Atom.ThemedText type="small" themeColor="textSecondary">Loading comments…</Atom.ThemedText>
        </View>
      ) : comments.length ? (
        <View style={styles.commentList}>
          {buildTree(comments).map((comment) => (
            <CommentItem
              key={comment.id}
              node={comment}
              canReply={canComment}
              onReply={reply}
              onLike={like}
            />
          ))}
        </View>
      ) : (
        <Atom.ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          No comments yet.
        </Atom.ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  loading: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  error: {
    gap: Spacing.two,
  },
  commentList: {
    gap: Spacing.three,
  },
  comment: {
    gap: Spacing.two,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorInfo: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  action: {
    minHeight: 36,
    justifyContent: 'center',
  },
  deleted: {
    fontStyle: 'italic',
  },
  replies: {
    marginLeft: Spacing.two,
    borderLeftWidth: 2,
    paddingLeft: Spacing.two,
    gap: Spacing.three,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
});
