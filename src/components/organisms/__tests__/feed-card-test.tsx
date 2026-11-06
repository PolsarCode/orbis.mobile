import { fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import type { Activity, FeedEntry, Post, Profile, QuotedPost } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { FeedCard } from '../feed-card';

const profile: Profile = {
  userId: 7,
  username: 'sakura',
  email: 'sakura@example.test',
  avatarUrl: null,
  coverUrl: null,
  backgroundUrl: null,
  theme: 'dark',
  appearOffline: false,
  status: 'online',
  isPublic: true,
  showNsfw: false,
  showChangelog: true,
  isAdmin: false,
  isHeadAdmin: false,
  emailVerifiedAt: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
};

const naruto = { id: 8, username: 'naruto', name: 'Naruto', avatarUrl: null };
const hinata = { id: 9, username: 'hinata', name: 'Hinata', avatarUrl: null };

function post(overrides: Partial<Post> = {}): Post {
  return {
    type: 'post',
    id: 1,
    communityId: null,
    content: '<p>Hello there</p>',
    linkUrl: null,
    spoiler: null,
    commentCount: 0,
    likeCount: 2,
    liked: false,
    hiddenAt: null,
    hiddenBecause: null,
    createdAt: new Date().toISOString(),
    author: naruto,
    community: null,
    wallUser: null,
    ...overrides,
  };
}

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    type: 'activity',
    id: 2,
    commentCount: 0,
    likeCount: 0,
    liked: false,
    hiddenBecause: null,
    createdAt: new Date().toISOString(),
    author: naruto,
    status: 'current',
    progress: null,
    steam: null,
    media: { type: 'anime', sourceId: '20', title: 'Naruto', coverImage: null, year: 2002 },
    ...overrides,
  };
}

function quotedPost(overrides: Partial<QuotedPost> = {}): QuotedPost {
  return {
    id: 30,
    content: '<p>Original words</p>',
    linkUrl: null,
    spoiler: null,
    createdAt: new Date().toISOString(),
    author: hinata,
    community: null,
    wallUser: null,
    hiddenBecause: null,
    media: null,
    ...overrides,
  };
}

async function renderCard(item: FeedEntry, props: { compact?: boolean; onLike?: jest.Mock } = {}) {
  const onLike = props.onLike ?? jest.fn();
  await renderRouter({
    index: () => <FeedCard item={item} onLike={onLike} compact={props.compact} />,
  });
  return onLike;
}

describe('feed card', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'token', sessionExpired: false, profile });
  });

  it.each([
    [{ kind: 'muted' } as const, 'From someone you muted', 'Show'],
    [{ kind: 'blocked' } as const, 'Message from someone you blocked', 'Show'],
    [{ kind: 'filtered', phrase: 'finale' } as const, 'Hidden because it mentions “finale”', 'Show anyway'],
  ])('hides %j content behind a gate', async (hiddenBecause, label, button) => {
    await renderCard(post({ hiddenBecause, repostedBy: { people: [hinata], total: 1 } }));

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText('Hello there')).toBeNull();
    expect(screen.queryByText(/Reposted by/)).toBeNull();
    expect(screen.queryByLabelText('Like')).toBeNull();

    await fireEvent.press(screen.getByText(button));
    expect(screen.getByText('Hello there')).toBeTruthy();
    expect(screen.getByText(/Reposted by/)).toBeTruthy();
  });

  it('hides spoilers until asked', async () => {
    await renderCard(post({ spoiler: 'Episode 12' }));

    expect(screen.getByText('Episode 12')).toBeTruthy();
    expect(screen.queryByText('Hello there')).toBeNull();

    await fireEvent.press(screen.getByText('Show'));
    expect(screen.getByText('Hello there')).toBeTruthy();
  });

  it.each([
    [activity({ progress: { from: 3, to: 5 } }), /^watched episodes 3–5 of Naruto$/],
    [activity({ progress: { from: 7, to: 7 }, media: { type: 'manga', sourceId: '1', title: 'Berserk', coverImage: null, year: null } }), /^read chapter 7 of Berserk$/],
    [activity({ status: 'current', media: { type: 'game', sourceId: '1', title: 'Hades', coverImage: null, year: null } }), /^started playing Hades$/],
    [activity({ status: 'completed' }), /^completed Naruto$/],
    [activity({ status: 'on_hold' }), /^put Naruto on hold$/],
    [activity({ status: 'dropped' }), /^dropped Naruto$/],
    [activity({ status: 'planned', media: { type: 'manga', sourceId: '1', title: 'Berserk', coverImage: null, year: null } }), /^plans to read Berserk$/],
  ])('describes library updates like web', async (item, text) => {
    await renderCard(item);

    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText('Library')).toBeTruthy();
  });

  it('shows Steam playtime on game updates', async () => {
    await renderCard(activity({
      steam: { appId: '1145360', minutes: 95, steamId: '1', achievements: null },
      media: { type: 'game', sourceId: '1145360', title: 'Hades', coverImage: null, year: 2020 },
    }));

    expect(screen.getByText('Steam · 95 minutes played')).toBeTruthy();
  });

  it.each([
    [true, 2],
    [false, undefined],
  ])('clamps library text only in compact mode (compact: %s)', async (compact, lines) => {
    await renderCard(activity(), { compact });

    expect(screen.getByText(/^started watching/).props.numberOfLines).toBe(lines);
  });

  it.each([
    [post({ repostedBy: { people: [hinata], total: 1 } }), 'Reposted by Hinata'],
    [post({ repostedBy: { people: [hinata, naruto], total: 2 } }), 'Reposted by Hinata and 1 other'],
    [activity({ repostedBy: { people: [hinata], total: 4 } }), 'Reposted by Hinata and 3 others'],
  ])('shows who reposted it', async (item, label) => {
    await renderCard(item);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it('shows no repost line for an original post', async () => {
    await renderCard(post());

    expect(screen.queryByText(/Reposted by/)).toBeNull();
  });

  it('embeds a quoted post with its author, place and text', async () => {
    await renderCard(post({
      quote: {
        available: true,
        type: 'post',
        post: quotedPost({ community: { id: 4, name: 'Konoha', iconUrl: null } }),
      },
    }));

    expect(screen.getByText(/^Hinata · Konoha · /)).toBeTruthy();
    expect(screen.getByText('Original words')).toBeTruthy();
  });

  it.each([
    [quotedPost({ spoiler: '' }), 'Spoiler'],
    [quotedPost({ hiddenBecause: { kind: 'blocked' } }), 'Message from someone you blocked'],
  ])('keeps the quoted post’s gate', async (quoted, label) => {
    await renderCard(post({ quote: { available: true, type: 'post', post: quoted } }));

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText('Original words')).toBeNull();
    await fireEvent.press(screen.getByText('Show'));
    expect(screen.getByText('Original words')).toBeTruthy();
  });

  it('summarises a quoted library update', async () => {
    await renderCard(post({
      quote: { available: true, type: 'activity', activity: activity({ author: hinata, status: 'completed' }) },
    }));

    expect(screen.getByText('Hinata completed Naruto')).toBeTruthy();
  });

  it('says when the quoted post is gone', async () => {
    await renderCard(post({ quote: { available: false } }));

    expect(screen.getByText('This post isn’t available')).toBeTruthy();
  });

  it('likes the post for confirmed accounts', async () => {
    const onLike = await renderCard(post());

    await fireEvent.press(screen.getByLabelText('Like'));
    expect(onLike).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('keeps likes read-only until the email is confirmed', async () => {
    useAuthStore.setState({ profile: { ...profile, emailVerifiedAt: null } });
    const onLike = await renderCard(post());

    const like = screen.getByLabelText('Like');
    expect(like.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(like);

    expect(onLike).not.toHaveBeenCalled();
    expect(screen.getByText('Confirm your email first to like this.')).toBeTruthy();
  });
});
