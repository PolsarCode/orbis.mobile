import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputSelectionChangeEvent,
} from 'react-native';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { normalizeWebUrl } from '@/lib/rich-content';
import { searchPeople, type FriendUser } from '@/lib/api';
import { useReadOnly } from '@/lib/read-only';
import { sessionFingerprint } from '@/lib/session';
import { useAuthStore } from '@/stores/auth-store';
import * as Molecule from '@molecule';

type InlineTag = 'strong' | 'em' | 'u' | 's' | 'code';
type Mark = { start: number; end: number; tag: InlineTag };
type ListMark = { start: number; end: number; tag: 'ul' | 'ol' };
type Range = { start: number; end: number };

function adjustRange(range: Range, previous: string, next: string): Range {
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - suffix - 1] === next[next.length - suffix - 1]
  ) {
    suffix += 1;
  }

  const oldEnd = previous.length - suffix;
  const added = next.length - prefix - suffix;
  const delta = next.length - previous.length;
  const start = range.start <= prefix
    ? range.start
    : range.start >= oldEnd
      ? range.start + delta
      : prefix;
  const end = range.end < prefix
    ? range.end
    : range.end >= oldEnd
      ? range.end + delta
      : prefix + added;
  return { start: Math.max(0, start), end: Math.max(0, end) };
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineHtml(text: string, offset: number, marks: Mark[]) {
  const order: InlineTag[] = ['strong', 'em', 'u', 's', 'code'];
  let output = '';
  let previous: InlineTag[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const active = order.filter((tag) =>
      marks.some((mark) => mark.tag === tag && mark.start <= offset + index && mark.end > offset + index),
    );
    let shared = 0;
    while (shared < active.length && active[shared] === previous[shared]) shared += 1;
    for (let close = previous.length - 1; close >= shared; close -= 1) {
      output += `</${previous[close]}>`;
    }
    for (let open = shared; open < active.length; open += 1) {
      output += `<${active[open]}>`;
    }
    output += escapeHtml(text[index]);
    previous = active;
  }

  for (let close = previous.length - 1; close >= 0; close -= 1) {
    output += `</${previous[close]}>`;
  }
  return output;
}

function serializeContent(text: string, marks: Mark[], lists: ListMark[]) {
  if (!text.trim()) return '';
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  let offset = 0;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const list = lists.find((mark) => mark.start <= offset && mark.end > offset);
    if (list) {
      const group: string[] = [];
      while (
        index < lines.length &&
        lists.some((mark) => mark.tag === list.tag && mark.start <= offset && mark.end > offset)
      ) {
        group.push(`<li>${inlineHtml(lines[index], offset, marks)}</li>`);
        offset += lines[index].length + 1;
        index += 1;
      }
      paragraphs.push(`<${list.tag}>${group.join('')}</${list.tag}>`);
    } else {
      paragraphs.push(`<p>${inlineHtml(line, offset, marks)}</p>`);
      offset += line.length + 1;
      index += 1;
    }
  }
  return paragraphs.join('');
}

function mentionMatch(text: string, cursor: number) {
  const before = text.slice(0, cursor);
  const match = /(?:^|[\s(])@([A-Za-z0-9_]{0,20})$/.exec(before);
  if (!match) return null;
  const start = cursor - match[1].length - 1;
  return { query: match[1], start, end: cursor };
}

const formatTools: { label: string; tag: InlineTag | 'ul' | 'ol'; glyph: string }[] = [
  { label: 'Bold', tag: 'strong', glyph: 'B' },
  { label: 'Italic', tag: 'em', glyph: 'I' },
  { label: 'Underline', tag: 'u', glyph: 'U' },
  { label: 'Strikethrough', tag: 's', glyph: 'S' },
  { label: 'Inline code', tag: 'code', glyph: '</>' },
  { label: 'Bulleted list', tag: 'ul', glyph: '• List' },
  { label: 'Numbered list', tag: 'ol', glyph: '1. List' },
];

export function PostComposer({
  onPost,
  placeholder = 'Write something…',
  submitLabel = 'Post',
  target,
  maxLength = 20_000,
}: {
  onPost: (content: string, linkUrl?: string) => Promise<void>;
  placeholder?: string;
  submitLabel?: string;
  target?: string;
  maxLength?: number;
}) {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.profile?.userId ?? null);
  const readOnly = useReadOnly();
  const sessionKey = `${userId ?? 'unknown'}-${sessionFingerprint(token)}`;
  if (readOnly) {
    return (
      <View style={[styles.readOnly, { borderColor: theme.divider, backgroundColor: theme.surface }]}>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Confirm your email to post, comment, and react. Until then, you can read everything.
        </Atom.ThemedText>
      </View>
    );
  }
  return (
    <PostComposerForm
      key={sessionKey}
      token={token}
      onPost={onPost}
      placeholder={placeholder}
      submitLabel={submitLabel}
      target={target}
      maxLength={maxLength}
    />
  );
}

function PostComposerForm({
  token,
  onPost,
  placeholder = 'Write something…',
  submitLabel = 'Post',
  target,
  maxLength,
}: {
  token: string | null;
  onPost: (content: string, linkUrl?: string) => Promise<void>;
  placeholder?: string;
  submitLabel?: string;
  target?: string;
  maxLength: number;
}) {
  const theme = useTheme();
  const postingRef = useRef(false);
  const [content, setContent] = useState('');
  const [selection, setSelection] = useState<Range>({ start: 0, end: 0 });
  const [marks, setMarks] = useState<Mark[]>([]);
  const [lists, setLists] = useState<ListMark[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [peopleState, setPeopleState] = useState<{
    sessionKey: string;
    query: string;
    people: FriendUser[];
    error: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const match = useMemo(() => mentionMatch(content, selection.start), [content, selection.start]);
  const mentionQuery = match && match.query.length >= 2 ? match.query : null;

  useEffect(() => {
    if (!token || !mentionQuery) return;
    let active = true;
    const timer = setTimeout(() => {
      searchPeople(token, mentionQuery)
        .then((people) => {
          if (active) {
            setPeopleState({
              sessionKey: sessionFingerprint(token),
              query: mentionQuery,
              people: people.slice(0, 5),
              error: null,
            });
          }
        })
        .catch((cause: unknown) => {
          if (active) {
            setPeopleState({
              sessionKey: sessionFingerprint(token),
              query: mentionQuery,
              people: [],
              error: cause instanceof Error ? cause.message : 'Could not search people.',
            });
          }
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mentionQuery, token]);

  const activeSession = sessionFingerprint(token);
  const people = peopleState?.sessionKey === activeSession && peopleState.query === mentionQuery
    ? peopleState.people
    : [];
  const mentionError = peopleState?.sessionKey === activeSession && peopleState.query === mentionQuery
    ? peopleState.error
    : null;

  function onTextChange(next: string) {
    setMarks((current) =>
      current.map((mark) => ({ ...mark, ...adjustRange(mark, content, next) }))
        .filter((mark) => mark.end > mark.start),
    );
    setLists((current) =>
      current.map((list) => ({ ...list, ...adjustRange(list, content, next) }))
        .filter((list) => list.end > list.start),
    );
    setContent(next);
  }

  function applyFormat(tag: InlineTag | 'ul' | 'ol') {
    if (selection.start === selection.end) return;
    if (tag === 'ul' || tag === 'ol') {
      const start = content.lastIndexOf('\n', selection.start - 1) + 1;
      const endOfLine = content.indexOf('\n', selection.end);
      const end = endOfLine === -1 ? content.length : endOfLine + 1;
      setLists((current) => {
        const existing = current.some(
          (list) => list.tag === tag && list.start <= start && list.end >= end,
        );
        return existing
          ? current.filter((list) => !(list.tag === tag && list.start <= start && list.end >= end))
          : [...current.filter((list) => list.end <= start || list.start >= end), { start, end, tag }];
      });
    } else {
      setMarks((current) => {
        const matching = current.find(
          (mark) => mark.tag === tag && mark.start <= selection.start && mark.end >= selection.end,
        );
        if (matching) {
          const next = current.filter((mark) => mark !== matching);
          if (matching.start < selection.start) {
            next.push({ ...matching, end: selection.start });
          }
          if (matching.end > selection.end) {
            next.push({ ...matching, start: selection.end });
          }
          return next;
        }
        return [...current, { ...selection, tag }];
      });
    }
  }

  function selectMention(person: FriendUser) {
    if (!match) return;
    const insertion = `@${person.username} `;
    const next = `${content.slice(0, match.start)}${insertion}${content.slice(match.end)}`;
    onTextChange(next);
    const cursor = match.start + insertion.length;
    setSelection({ start: cursor, end: cursor });
  }

  async function submit() {
    if (postingRef.current) return;
    const rawUrl = linkUrl.trim();
    const url = rawUrl ? normalizeWebUrl(rawUrl) : null;
    if (rawUrl && !url) {
      setError('Enter a valid http or https link.');
      return;
    }
    const html = serializeContent(content, marks, lists);
    if (!html && !url) {
      setError('Write something or add a link before posting.');
      return;
    }
    if (html.length > maxLength) {
      setError('Formatted content is too long. Shorten it before posting.');
      return;
    }

    postingRef.current = true;
    setPosting(true);
    setError(null);
    try {
      await onPost(html, url ?? undefined);
      setContent('');
      setSelection({ start: 0, end: 0 });
      setMarks([]);
      setLists([]);
      setLinkUrl('');
      setPeopleState(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not post. Please try again.');
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  function onSelectionChange(event: TextInputSelectionChangeEvent) {
    setSelection(event.nativeEvent.selection);
  }

  return (
    <View style={[styles.container, { borderColor: theme.divider, backgroundColor: theme.surface }]}>
      {target ? <Atom.ThemedText type="small" themeColor="textSecondary">{target}</Atom.ThemedText> : null}
      <TextInput
        accessibilityLabel={placeholder}
        multiline
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        textAlignVertical="top"
        value={content}
        onChangeText={onTextChange}
        onSelectionChange={onSelectionChange}
        selection={selection}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
      />
      {people.length || mentionError ? (
        <View style={[styles.suggestions, { borderColor: theme.divider, backgroundColor: theme.surface }]}>
          {people.map((person) => (
            <Pressable
              key={person.userId}
              accessibilityRole="button"
              accessibilityLabel={`Mention ${person.name || person.username}, @${person.username}`}
              onPress={() => selectMention(person)}
              style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
              <Atom.ThemedText type="smallBold" numberOfLines={1}>
                {person.name || person.username}
              </Atom.ThemedText>
              <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                @{person.username}
              </Atom.ThemedText>
            </Pressable>
          ))}
          {mentionError ? <Atom.ThemedText type="small" themeColor="textSecondary">{mentionError}</Atom.ThemedText> : null}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar}>
        {formatTools.map((tool) => (
          <Pressable
            key={tool.label}
            accessibilityRole="button"
            accessibilityLabel={tool.label}
            disabled={selection.start === selection.end}
            onPress={() => applyFormat(tool.tag)}
            style={({ pressed }) => [
              styles.formatButton,
              { borderColor: theme.divider, opacity: selection.start === selection.end ? 0.45 : pressed ? 0.65 : 1 },
            ]}>
            <Atom.ThemedText type="smallBold">{tool.glyph}</Atom.ThemedText>
          </Pressable>
        ))}
      </ScrollView>
      <TextInput
        accessibilityLabel="Link URL"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        maxLength={2048}
        placeholder="Add a link (optional)"
        placeholderTextColor={theme.textSecondary}
        value={linkUrl}
        onChangeText={setLinkUrl}
        style={[styles.linkInput, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
      />
      {linkUrl.trim() ? <Molecule.LinkPreview url={linkUrl.trim()} /> : null}
      {error ? <Atom.ErrorMessage>{error}</Atom.ErrorMessage> : null}
      <View style={styles.footer}>
        <Atom.ThemedText type="small" themeColor="textSecondary">{content.length}/{maxLength.toLocaleString('en-US')}</Atom.ThemedText>
        <Atom.Button
          label={posting ? 'Posting…' : submitLabel}
          loading={posting}
          disabled={!content.trim() && !linkUrl.trim()}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
  },
  readOnly: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: Spacing.three,
  },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 16,
    lineHeight: 22,
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  suggestion: {
    minHeight: 44,
    justifyContent: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  pressed: {
    opacity: 0.65,
  },
  toolbar: {
    gap: Spacing.one,
    paddingVertical: Spacing.one,
  },
  formatButton: {
    minHeight: 36,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.one,
  },
  linkInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
