import Constants from 'expo-constants';

function devServerUrl() {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:4000`;
}

export const API_URL = process.env.EXPO_PUBLIC_API_URL || devServerUrl();
export const WEB_URL = (
  process.env.EXPO_PUBLIC_WEB_URL || 'https://orbis.polsar.studio'
).replace(/\/+$/, '');

export type LoginCredentials = { identifier: string; password: string };

export type SignupDetails = { email: string; username: string; password: string };
export type ThemeMode = 'system' | 'light' | 'dark';
export type OAuthProvider = 'discord' | 'twitch';
export type OAuthConnection = {
  provider: OAuthProvider;
  username: string;
  showLive: boolean;
  connectedAt: string;
};
export type OAuthConnections = {
  hasPassword: boolean;
  connections: OAuthConnection[];
};
export type OAuthResult =
  | { access_token: string }
  | { signup: { token: string; username: string; avatarUrl: string | null } }
  | {
      linked: OAuthProvider;
      communityId?: number;
      avatar?: { url: string; token: string };
    };
export type OAuthSignupDetails = {
  provider: OAuthProvider;
  token: string;
  username: string;
  avatarUrl: string | null;
};

export type Profile = {
  userId: number;
  email: string;
  username: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  backgroundUrl: string | null;
  theme: ThemeMode;
  appearOffline: boolean;
  status: Exclude<PresenceStatus, 'offline' | 'streaming'>;
  isPublic: boolean;
  showNsfw: boolean;
  showChangelog: boolean;
  isAdmin: boolean;
  isHeadAdmin: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
};

export type CommunityRole = 'owner' | 'admin' | 'member';

export type ProfilePreferences = Partial<
  Pick<Profile, 'theme' | 'appearOffline' | 'status' | 'isPublic' | 'showNsfw' | 'showChangelog'>
>;

export type Community = {
  id: number;
  name: string;
  iconUrl: string | null;
  role?: CommunityRole | null;
};

export type Author = {
  id: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
};

export type CommunitySummary = Pick<Community, 'id' | 'name' | 'iconUrl'>;

export type Post = {
  type: 'post';
  id: number;
  communityId: number | null;
  content: string;
  linkUrl: string | null;
  commentCount: number;
  likeCount: number;
  liked: boolean;
  hiddenAt?: string | null;
  createdAt: string;
  author: Author;
  community: CommunitySummary | null;
  wallUser: Author | null;
};

export type PresenceStatus = 'online' | 'idle' | 'busy' | 'streaming' | 'offline';
export type LibraryStatus = 'current' | 'completed' | 'on_hold' | 'dropped' | 'planned';
export type MediaType = 'anime' | 'manga' | 'game';

export type PublicProfile = {
  userId: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  backgroundUrl: string | null;
  isAdmin: boolean;
  isHeadAdmin: boolean;
  isVerified: boolean;
  isPublic: boolean;
  restricted: boolean;
  hasClips: boolean;
  createdAt: string;
  online: boolean;
  status: PresenceStatus;
  friendCount: number;
  postCount: number;
  communityCount: number;
  communities: {
    id: number;
    name: string;
    iconUrl: string | null;
    coverUrl: string | null;
    isVerified: boolean;
    memberCount: number;
    isOwner: boolean;
  }[];
  friends: {
    userId: number;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    coverUrl: string | null;
    isVerified: boolean;
    online: boolean;
    status: PresenceStatus;
    playing: string | null;
  }[];
  library: {
    id: number;
    mediaType: MediaType;
    sourceId: string;
    title: string;
    coverImage: string | null;
    status: LibraryStatus;
    progress: number;
    total: number | null;
    steam: {
      appId: string;
      minutes: number;
      steamId: string;
      achievements: { achieved: number; total: number } | null;
    } | null;
  }[];
};

export type Clip = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  viewCount: number;
  duration: number;
  creatorName: string;
  createdAt: string;
};

export type ClipPage = { items: Clip[]; nextCursor: string | null };

export type Thread = {
  type: 'thread';
  id: number;
  communityId: number;
  title: string;
  content: string;
  linkUrl: string | null;
  score: number;
  commentCount: number;
  myVote: number;
  createdAt: string;
  author: Author;
  community: CommunitySummary;
};

export type Activity = {
  type: 'activity';
  id: number;
  commentCount: number;
  likeCount: number;
  liked: boolean;
  createdAt: string;
  author: Author;
  status: 'current' | 'completed' | 'on_hold' | 'dropped' | 'planned';
  progress: { from: number; to: number } | null;
  media: {
    type: 'anime' | 'manga' | 'game';
    sourceId: string;
    title: string;
    coverImage: string | null;
    year: number | null;
  };
};

export type FeedEntry = Post | Thread | Activity;

export type FeedContentType = FeedEntry['type'];

export type Page<T> = { items: T[]; nextCursor: string | null };

let unauthorizedHandler: ((token: string) => void) | null = null;

export function setUnauthorizedHandler(handler: ((token: string) => void) | null) {
  unauthorizedHandler = handler;
}

function bearerToken(headers: HeadersInit | undefined): string | null {
  const value = new Headers(headers).get('Authorization');
  return value?.startsWith('Bearer ') ? value.slice('Bearer '.length) : null;
}

export async function api(path: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch (error) {
    if (init?.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }
    throw new Error("Can't reach Orbis right now. Please try again.");
  }
  if (res.status === 429) {
    throw new Error(await errorMessage(res, 'You’re doing that too often. Try again in a minute.'));
  }
  if (res.status === 401 && unauthorizedHandler) {
    const token = bearerToken(init?.headers);
    if (token) unauthorizedHandler(token);
  }
  return res;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function responseMessages(res: Response): Promise<string[]> {
  const body: unknown = await res.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('message' in body)) return [];
  const message = body.message;
  if (typeof message === 'string') return [message];
  if (Array.isArray(message)) return message.filter((item): item is string => typeof item === 'string');
  return [];
}

async function errorMessage(res: Response, fallback: string) {
  const [message] = await responseMessages(res);
  return message ? `${message.replace(/[.!?]+$/, '')}.` : fallback;
}

async function validationErrorMessage(res: Response, fallback: string) {
  const messages = await responseMessages(res);
  const message = messages.join(' ').toLowerCase();

  if (message.includes('email')) return 'Enter a valid email address.';
  if (message.includes('username')) {
    return 'Usernames must be 3–20 characters: letters, numbers, or underscores.';
  }
  if (message.includes('password')) {
    return message.includes('shorter')
      ? 'Passwords must be 200 characters or fewer.'
      : 'Passwords must be at least 6 characters.';
  }
  if (message.includes('identifier')) {
    return message.includes('shorter')
      ? 'Email addresses or usernames must be 320 characters or fewer.'
      : 'Enter a valid email address or username.';
  }
  return fallback;
}

async function authenticate(
  path: string,
  credentials: LoginCredentials | SignupDetails,
  signal?: AbortSignal,
): Promise<string> {
  const res = await api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
    signal,
  });

  if (res.status === 401) {
    throw new Error('Invalid username, email, or password.');
  }
  if (res.status === 409) {
    throw new Error(await errorMessage(res, 'That account already exists.'));
  }
  if (res.status === 400) {
    throw new Error(
      await validationErrorMessage(
        res,
        path === '/auth/login'
          ? 'Check your email or username and password, then try again.'
          : 'Check your email, username, and password, then try again.',
      ),
    );
  }
  if (!res.ok) throw new Error('Something went wrong. Please try again.');

  const { access_token } = await res.json();
  return access_token;
}

export function signup(details: SignupDetails, signal?: AbortSignal) {
  return authenticate('/auth/signup', details, signal);
}

export function login(credentials: LoginCredentials, signal?: AbortSignal) {
  return authenticate('/auth/login', credentials, signal);
}

export async function getOAuthProviders(): Promise<OAuthProvider[]> {
  const res = await api('/auth/oauth/providers');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load sign-in providers.'));
  return res.json();
}

export async function getOAuthUrl(
  provider: OAuthProvider,
  nonce: string,
  token?: string,
): Promise<string> {
  const params = new URLSearchParams({ nonce, client: 'mobile' });
  const path = token ? 'link-url' : 'url';
  const res = await api(`/auth/oauth/${provider}/${path}?${params.toString()}`, {
    headers: authHeaders(token ?? null),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not start provider authentication.'));
  }
  const body: unknown = await res.json();
  if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string') {
    throw new Error('The server returned an invalid provider authorization URL.');
  }
  return body.url;
}

export async function completeOAuth(
  provider: OAuthProvider,
  body: { code: string; state: string; nonce: string },
  token: string | null,
): Promise<OAuthResult> {
  const res = await api(`/auth/oauth/${provider}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not finish provider authentication.'));
  }
  return res.json();
}

export async function finishOAuthSignup(
  token: string,
  username: string,
  useProviderAvatar: boolean,
): Promise<{ access_token: string }> {
  const res = await api('/auth/oauth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, username, useProviderAvatar }),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not finish creating your account.'));
  }
  return res.json();
}

export async function applyLinkedOAuthAvatar(
  token: string,
  avatarToken: string,
): Promise<{ avatarUrl: string }> {
  const res = await api('/auth/oauth/avatar', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: avatarToken }),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not use your provider avatar.'));
  }
  return res.json();
}

export async function getOAuthConnections(token: string): Promise<OAuthConnections> {
  const res = await api('/auth/oauth/connections', { headers: authHeaders(token) });
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not load your connected accounts.'));
  }
  return res.json();
}

export async function disconnectOAuth(token: string, provider: OAuthProvider): Promise<void> {
  const res = await api(`/auth/oauth/connections/${provider}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not disconnect this account.'));
  }
}

export async function setShowLive(
  token: string,
  provider: OAuthProvider,
  showLive: boolean,
): Promise<void> {
  const res = await api(`/auth/oauth/connections/${provider}`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ showLive }),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not update this setting.'));
  }
}

export async function getProfile(token: string): Promise<Profile | null> {
  const res = await api('/users', { headers: authHeaders(token) });

  if (res.status === 401) return null;
  if (res.status === 403) throw new Error('You can’t access this profile.');
  if (res.status === 404) throw new Error('Your profile could not be found.');
  if (!res.ok) throw new Error('Could not load your profile. Please try again.');
  return res.json();
}

export async function resendConfirmation(token: string): Promise<{ confirmed: boolean }> {
  const res = await api('/auth/confirm-email/resend', {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Couldn’t send the email.'));
  return res.json();
}

export async function updatePreferences(
  token: string,
  preferences: ProfilePreferences,
): Promise<Profile> {
  const res = await api('/users/me/preferences', {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not save your preferences.'));
  }
  return res.json();
}

export async function resetOnboardingTours(token: string): Promise<void> {
  const res = await api('/users/me/onboarding', {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetTours: true }),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not restart the tours.'));
  }
}

export async function getPublicProfile(
  token: string | null,
  username: string,
): Promise<PublicProfile | null> {
  const res = await api(`/users/${encodeURIComponent(username)}`, {
    headers: authHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load this profile.'));
  return res.json();
}

export async function getUserPosts(
  token: string | null,
  username: string,
  cursor?: string,
  excludedTypes: FeedContentType[] = [],
): Promise<Page<FeedEntry>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  if (excludedTypes.length) params.exclude = excludedTypes.join(',');
  const search = new URLSearchParams(params).toString();
  const query = search ? `?${search}` : '';
  const res = await api(`/users/${encodeURIComponent(username)}/posts${query}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load these posts.'));
  return res.json();
}

export async function getUserClips(
  token: string | null,
  username: string,
  cursor?: string,
): Promise<ClipPage> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : '';
  const res = await api(`/users/${encodeURIComponent(username)}/clips${query}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load these clips.'));
  return res.json();
}

export type ProfileImage = 'avatar' | 'cover' | 'background';

export async function uploadProfileImage(
  token: string,
  type: ProfileImage,
  uri: string,
  fileName: string | null,
  mimeType: string | null,
): Promise<Profile> {
  const file = await fetch(uri).then(async (response) => {
    if (!response.ok) throw new Error('Could not read the selected image.');
    return response.blob();
  });
  const body = new FormData();
  body.append('file', file, fileName ?? `${type}.${mimeType?.split('/')[1] ?? 'jpg'}`);
  const res = await api(`/users/me/${type}`, {
    method: 'POST',
    headers: authHeaders(token),
    body,
  });
  if (res.status === 413) throw new Error('Images must be 10 MB or smaller.');
  if (!res.ok) {
    throw new Error(await errorMessage(res, `Could not upload your ${type}.`));
  }
  return res.json();
}

export async function removeProfileImage(
  token: string,
  type: ProfileImage,
): Promise<Profile> {
  const res = await api(`/users/me/${type}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, `Could not remove your ${type}.`));
  }
  return res.json();
}

export async function getServerStatus(): Promise<string> {
  const res = await api('/');
  return res.text();
}

export async function getCommunities(token: string): Promise<Community[]> {
  const res = await api('/communities', { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load your communities.'));
  return res.json();
}

export async function getCommunity(token: string, id: string): Promise<Community | null> {
  const res = await api(`/communities/${encodeURIComponent(id)}`, { headers: authHeaders(token) });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load this community.'));
  return res.json();
}

export function canManage(community: Community) {
  return community.role === 'owner' || community.role === 'admin';
}

export async function searchPeople(token: string, query: string): Promise<Author[]> {
  const params = new URLSearchParams({ q: query });
  const res = await api(`/friends/search?${params.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Could not search people.');
  return res.json();
}

export async function searchCommunities(token: string, query: string): Promise<Community[]> {
  const params = new URLSearchParams({ q: query });
  const res = await api(`/communities/search?${params.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Could not search communities.');
  return res.json();
}

export async function getFeed(token: string, cursor?: string): Promise<Page<FeedEntry>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await api(`/feed${query}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load your feed.'));
  return res.json();
}

export async function createWallPost(
  token: string,
  username: string,
  content: string,
  linkUrl?: string,
): Promise<Post> {
  const res = await api(`/users/${encodeURIComponent(username)}/posts`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, linkUrl }),
  });
  if (res.status === 400) throw new Error('Write something before posting.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not post. Please try again.'));
  return res.json();
}

export async function createCommunityPost(
  token: string,
  communityId: number,
  content: string,
  linkUrl?: string,
): Promise<Post> {
  const res = await api(`/communities/${communityId}/posts`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, linkUrl }),
  });
  if (res.status === 400) throw new Error('Write something before posting.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not post. Please try again.'));
  return res.json();
}

export async function setLike(
  token: string,
  type: 'post' | 'activity',
  id: number,
  liked: boolean,
): Promise<{ liked: boolean; likeCount: number }> {
  const res = await api('/likes', {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id, liked }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not save your like.'));
  return res.json();
}

export async function vote(
  token: string,
  id: number,
  value: -1 | 0 | 1,
): Promise<{ score: number; myVote: number }> {
  const res = await api('/votes', {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'thread', id, value }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not save your vote.'));
  return res.json();
}
