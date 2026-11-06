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
export type CommunityLinkPlatform =
  | 'x'
  | 'youtube'
  | 'kick'
  | 'instagram'
  | 'tiktok'
  | 'reddit'
  | 'website';
export type CommunityLinks = Partial<Record<CommunityLinkPlatform, string>>;
export type CommunityImage = 'icon' | 'cover' | 'background';
export type CommunityConnectionSetting =
  | 'showTwitchLive'
  | 'showTwitchClips'
  | 'showDiscordOnline'
  | 'showDiscordInvite';

export type ProfilePreferences = Partial<
  Pick<Profile, 'theme' | 'appearOffline' | 'status' | 'isPublic' | 'showNsfw' | 'showChangelog'>
>;

export type Community = {
  id: number;
  name: string;
  iconUrl: string | null;
  role?: CommunityRole | null;
  description?: string | null;
  coverUrl?: string | null;
  backgroundUrl?: string | null;
  ownerId?: number;
  isPublic?: boolean;
  isVerified?: boolean;
  memberCount?: number;
  links?: CommunityLinks;
  showTwitchLive?: boolean;
  showTwitchClips?: boolean;
  showDiscordOnline?: boolean;
  showDiscordInvite?: boolean;
  showLibraryUpdates?: boolean;
};

export type InviteCreator = {
  id: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
};

export type Invite = {
  code: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  permanent: boolean;
  disabledAt: string | null;
  createdAt: string;
  creator: InviteCreator;
};

export type InvitePreview = {
  code: string;
  expiresAt: string | null;
  creator: InviteCreator;
  community: Pick<
    Community,
    'id' | 'name' | 'iconUrl' | 'coverUrl' | 'backgroundUrl' | 'isPublic' | 'isVerified'
  > & {
    memberCount: number;
  };
};

export type RailFolder = {
  type: 'folder';
  id: number;
  name: string | null;
  color: string | null;
  communityIds: number[];
};

export type RailItem = { type: 'community'; communityId: number } | RailFolder;

export type CommunityPerson = {
  id: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
};

export type CommunityMember = {
  userId: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  isVerified: boolean;
  online: boolean;
  status: PresenceStatus;
  nickname: string | null;
  joinedAt: string;
  isOwner: boolean;
  isAdmin: boolean;
};

export type CommunitySearchResult = {
  id: number;
  name: string;
  description: string | null;
  iconUrl: string | null;
  coverUrl: string | null;
  isVerified: boolean;
  memberCount: number;
  joined: boolean;
  members: CommunityPerson[];
  mutuals: CommunityPerson[];
  mutualCount: number;
};

export type DirectoryUser = {
  userId: number;
  username: string;
  name: string | null;
  email: string;
  emailVerifiedAt: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  isAdmin: boolean;
  isHeadAdmin: boolean;
  isVerified: boolean;
  communityCount: number;
  createdAt: string;
};

export type DirectoryCommunity = {
  id: number;
  name: string;
  iconUrl: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  isVerified: boolean;
  memberCount: number;
  owner: { id: number; username: string; name: string | null; avatarUrl: string | null };
  createdAt: string;
};

export type NumberedPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
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
  spoiler?: string | null;
  commentCount: number;
  likeCount: number;
  liked: boolean;
  hiddenAt?: string | null;
  hiddenBecause?: HiddenBecause | null;
  createdAt: string;
  author: Author;
  community: CommunitySummary | null;
  wallUser: Author | null;
};

export type ChatPerson = {
  userId: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
};

export type HiddenBecause =
  | { kind: 'muted' }
  | { kind: 'blocked' }
  | { kind: 'filtered'; phrase: string };

export type ChatReply = {
  id: number;
  senderId: number;
  sender: ChatPerson;
  text: string;
  hiddenBecause?: HiddenBecause | null;
};

export type ChatReaction = { emoji: string; userIds: number[] };

export type ChatMessage = {
  id: number;
  senderId: number;
  sender: ChatPerson;
  text: string;
  system: boolean;
  sentAt: string;
  editedAt: string | null;
  replyTo: ChatReply | null;
  reactions: ChatReaction[];
  hiddenBecause?: HiddenBecause | null;
};

export type Conversation = {
  id: number;
  isGroup: boolean;
  name: string | null;
  creatorId: number | null;
  members: ChatPerson[];
  lastText: string;
  lastSenderId: number | null;
  lastSystem: boolean;
  lastAt: string;
  unread: number;
  status: 'accepted' | 'request';
  canMessage?: boolean;
};

export type ChatMember = ChatPerson & { readAt: string | null };

export type ChatHistory = {
  messages: ChatMessage[];
  members: ChatMember[];
  hasMore: boolean;
  canMessage?: boolean;
};

export type PresenceStatus = 'online' | 'idle' | 'busy' | 'streaming' | 'offline';
export type UserStatus = Exclude<PresenceStatus, 'offline' | 'streaming'>;
export type LibraryStatus = 'current' | 'completed' | 'on_hold' | 'dropped' | 'planned';
export type MediaType = 'anime' | 'manga' | 'game';

export type FriendUser = {
  userId: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  isVerified?: boolean;
};

export type Friend = FriendUser & {
  online: boolean;
  status: PresenceStatus;
  playing?: string | null;
  twitchLogin?: string | null;
};

export type FriendList = {
  friends: Friend[];
  incoming: FriendUser[];
  outgoing: FriendUser[];
};

export type FriendTarget = { userId: number } | { username: string };

export type Member = {
  userId: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  isVerified: boolean;
  online: boolean;
  status: PresenceStatus;
  playing?: string | null;
  nickname: string | null;
  joinedAt: string;
  isOwner: boolean;
  isAdmin: boolean;
};

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

export type MediaProfile = {
  type: MediaType;
  sourceId: string;
  title: string;
  coverImage: string | null;
  year: number | null;
  score: number | null;
  altTitles: string[];
  synopsis: string | null;
  bannerImage: string | null;
  releaseStatus: string | null;
  genres: string[];
};

export type Activity = {
  type: 'activity';
  id: number;
  commentCount: number;
  likeCount: number;
  liked: boolean;
  hiddenBecause?: HiddenBecause | null;
  createdAt: string;
  author: Author;
  status: 'current' | 'completed' | 'on_hold' | 'dropped' | 'planned';
  progress: { from: number; to: number } | null;
  steam?: {
    appId: string;
    minutes: number;
    steamId: string;
    achievements: { achieved: number; total: number } | null;
  } | null;
  media: {
    type: 'anime' | 'manga' | 'game';
    sourceId: string;
    title: string;
    coverImage: string | null;
    year: number | null;
  };
};

export type FeedEntry = Post | Activity;

export type FeedContentType = FeedEntry['type'];

export type Commentable = { type: FeedEntry['type']; id: number };

export type Comment = {
  id: number;
  parentId: number | null;
  content: string;
  linkUrl: string | null;
  likeCount: number;
  liked: boolean;
  hidden?: 'review' | 'reported' | null;
  deleted?: boolean;
  createdAt: string;
  author: Author;
};

export type LinkPreview = {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  siteName: string;
};

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

export async function createCommunity(
  token: string,
  name: string,
  isPublic: boolean,
): Promise<Community> {
  const res = await api('/communities', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), isPublic }),
  });
  if (res.status === 403) {
    throw new Error(await errorMessage(res, 'You can’t create more communities.'));
  }
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not create the community. Please try again.'));
  }
  return res.json();
}

export async function getRailLayout(token: string): Promise<RailItem[]> {
  const res = await api('/communities/layout', { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load your communities.'));
  return res.json();
}

export async function updateRailLayout(token: string, layout: RailItem[]): Promise<RailItem[]> {
  const items = layout.map((item) =>
    item.type === 'community'
      ? { communityId: item.communityId }
      : {
          folder: {
            ...(item.id > 0 && { id: item.id }),
            name: item.name ?? undefined,
            color: item.color ?? undefined,
            communityIds: item.communityIds,
          },
        },
  );
  const res = await api('/communities/layout', {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not save your communities.'));
  return res.json();
}

export async function getCommunity(token: string | null, id: string): Promise<Community | null> {
  const res = await api(`/communities/${encodeURIComponent(id)}`, { headers: authHeaders(token) });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load this community.'));
  return res.json();
}

export async function updateCommunity(
  token: string,
  communityId: number,
  changes: Partial<
    Pick<
      Community,
      | 'name'
      | 'isPublic'
      | 'description'
      | 'links'
      | CommunityConnectionSetting
    >
  >,
): Promise<Community> {
  const res = await api(`/communities/${communityId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (res.status === 403) throw new Error('Only admins can change these settings.');
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not save the settings. Please try again.'));
  }
  return res.json();
}

export async function getCommunityMembers(token: string, communityId: number): Promise<CommunityMember[]> {
  const res = await api(`/communities/${communityId}/members`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load community members.'));
  return res.json();
}

export async function setCommunityAdmin(
  token: string,
  communityId: number,
  userId: number,
  isAdmin: boolean,
): Promise<CommunityMember[]> {
  const res = await api(`/communities/${communityId}/admins/${userId}`, {
    method: isAdmin ? 'PUT' : 'DELETE',
    headers: authHeaders(token),
  });
  if (res.status === 403) throw new Error('Only the owner can change admins.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not update admins. Please try again.'));
  return res.json();
}

async function sendCommunityImage(
  token: string,
  communityId: number,
  image: CommunityImage,
  init: RequestInit,
): Promise<Community> {
  const res = await api(`/communities/${communityId}/${image}`, {
    ...init,
    headers: authHeaders(token),
  });
  if (res.status === 403) throw new Error(`Only admins can change the ${image}.`);
  if (res.status === 413) throw new Error('Images must be 10 MB or smaller.');
  if (!res.ok) {
    throw new Error(await errorMessage(res, `Could not save the ${image}.`));
  }
  return res.json();
}

export async function uploadCommunityImage(
  token: string,
  communityId: number,
  image: CommunityImage,
  uri: string,
  fileName: string | null,
  mimeType: string | null,
): Promise<Community> {
  const file = await fetch(uri).then(async (response) => {
    if (!response.ok) throw new Error('Could not read the selected image.');
    return response.blob();
  });
  const body = new FormData();
  body.append('file', file, fileName ?? `${image}.${mimeType?.split('/')[1] ?? 'jpg'}`);
  return sendCommunityImage(token, communityId, image, { method: 'POST', body });
}

export async function removeCommunityImage(
  token: string,
  communityId: number,
  image: CommunityImage,
): Promise<Community> {
  return sendCommunityImage(token, communityId, image, { method: 'DELETE' });
}

export async function deleteCommunity(token: string, communityId: number): Promise<void> {
  const res = await api(`/communities/${communityId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (res.status === 403) throw new Error('Only the owner can delete this community.');
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not delete the community. Please try again.'));
  }
}

export function canManage(community: Community) {
  return community.role === 'owner' || community.role === 'admin';
}

function messagesRequest(token: string, path: string, method = 'POST', body?: unknown) {
  return api(`/messages${path}`, {
    method,
    headers: {
      ...authHeaders(token),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

export async function searchChatPeople(token: string, query: string): Promise<ChatPerson[]> {
  const params = new URLSearchParams({ q: query });
  const res = await api(`/friends/search?${params.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not search people.'));
  return res.json();
}

export async function getConversations(token: string): Promise<Conversation[]> {
  const res = await messagesRequest(token, '', 'GET');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load your messages.'));
  return res.json();
}

export async function openDirectChat(token: string, userId: number): Promise<Conversation> {
  const res = await messagesRequest(token, `/direct/${userId}`);
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not open this chat.'));
  return res.json();
}

export async function getChatHistory(
  token: string,
  id: number,
  before?: number,
): Promise<ChatHistory> {
  const query = before === undefined ? '' : `?before=${before}`;
  const res = await messagesRequest(token, `/${id}${query}`, 'GET');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load this chat.'));
  return res.json();
}

export async function sendMessage(
  token: string,
  id: number,
  text: string,
  replyToId?: number,
): Promise<ChatMessage> {
  const res = await messagesRequest(token, `/${id}`, 'POST', { text, replyToId });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not send your message.'));
  return res.json();
}

export async function editMessage(
  token: string,
  id: number,
  messageId: number,
  text: string,
): Promise<ChatMessage> {
  const res = await messagesRequest(token, `/${id}/messages/${messageId}`, 'PATCH', { text });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not edit your message.'));
  return res.json();
}

export async function reactToMessage(
  token: string,
  id: number,
  messageId: number,
  emoji: string,
): Promise<ChatMessage> {
  const res = await messagesRequest(token, `/${id}/messages/${messageId}/reaction`, 'POST', {
    emoji,
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not react to this message.'));
  return res.json();
}

export async function markMessagesRead(token: string, id: number): Promise<void> {
  const res = await messagesRequest(token, `/${id}/read`);
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not mark messages as read.'));
}

export async function acceptMessageRequest(token: string, id: number): Promise<void> {
  const res = await messagesRequest(token, `/${id}/accept`);
  if (!res.ok && res.status !== 404) {
    throw new Error(await errorMessage(res, 'Could not accept the request.'));
  }
}

export async function declineMessageRequest(token: string, id: number): Promise<void> {
  const res = await messagesRequest(token, `/${id}`, 'DELETE');
  if (!res.ok && res.status !== 404) {
    throw new Error(await errorMessage(res, 'Could not decline the request.'));
  }
}

export async function searchPeople(token: string, query: string): Promise<FriendUser[]> {
  const params = new URLSearchParams({ q: query });
  const res = await api(`/friends/search?${params.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Could not search people.');
  return res.json();
}

export async function getFriends(token: string): Promise<FriendList> {
  const res = await api('/friends', { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load your friends.'));
  return res.json();
}

export async function addFriend(token: string, target: FriendTarget): Promise<void> {
  const res = await api('/friends', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(target),
  });
  if (res.status === 404) throw new Error('No one with that username is on Orbis.');
  if (res.status === 400 || res.status === 409) {
    throw new Error(await errorMessage(res, 'That friendship request is not valid.'));
  }
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not send the request. Please try again.'));
}

export async function removeFriend(token: string, userId: number): Promise<void> {
  const res = await api(`/friends/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(await errorMessage(res, 'Could not update your friends. Please try again.'));
  }
}

export async function searchCommunities(
  token: string,
  query: string,
): Promise<CommunitySearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const res = await api(`/communities/search?${params.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Could not search communities.');
  return res.json();
}

export async function joinCommunity(token: string, communityId: number): Promise<Community> {
  const res = await api(`/communities/${communityId}/join`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (res.status === 404) throw new Error('This community is no longer public.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not join the community.'));
  return res.json();
}

export async function getMembers(token: string, communityId: number): Promise<Member[]> {
  const res = await api(`/communities/${communityId}/members`, {
    headers: authHeaders(token),
  });
  if (res.status === 403) {
    throw new Error(await errorMessage(res, 'You must be a community member to view its members.'));
  }
  if (res.status === 404) {
    throw new Error(await errorMessage(res, 'This community is no longer available.'));
  }
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load community members.'));
  return res.json();
}

export async function setShowLibraryUpdates(
  token: string,
  communityId: number,
  show: boolean,
): Promise<{ showLibraryUpdates: boolean }> {
  const res = await api(`/communities/${communityId}/library-updates`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ show }),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not save your library update setting.'));
  }
  return res.json();
}

export async function setNickname(
  token: string,
  communityId: number,
  nickname: string | null,
): Promise<{ nickname: string | null }> {
  const res = await api(`/communities/${communityId}/nickname`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not save your nickname.'));
  return res.json();
}

export async function getDirectoryUsers(
  token: string,
  page: number,
): Promise<NumberedPage<DirectoryUser>> {
  const res = await api(`/admin/users?page=${page}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load users.'));
  return res.json();
}

export async function getDirectoryCommunities(
  token: string,
  page: number,
): Promise<NumberedPage<DirectoryCommunity>> {
  const res = await api(`/admin/communities?page=${page}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load communities.'));
  return res.json();
}

export async function setProfileVerified(
  token: string,
  username: string,
  isVerified: boolean,
): Promise<boolean> {
  const res = await api(`/users/${encodeURIComponent(username)}/verified`, {
    method: isVerified ? 'PUT' : 'DELETE',
    headers: authHeaders(token),
  });
  if (res.status === 403) throw new Error('Only the head admin can verify profiles.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not update verification.'));
  return (await res.json()).isVerified;
}

export async function setCommunityVerified(
  token: string,
  communityId: number,
  isVerified: boolean,
): Promise<boolean> {
  const res = await api(`/communities/${communityId}/verified`, {
    method: isVerified ? 'PUT' : 'DELETE',
    headers: authHeaders(token),
  });
  if (res.status === 403) throw new Error('Only the head admin can verify communities.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not update verification.'));
  return (await res.json()).isVerified;
}

export async function setProfileAdmin(
  token: string,
  username: string,
  isAdmin: boolean,
): Promise<boolean> {
  const res = await api(`/users/${encodeURIComponent(username)}/admin`, {
    method: isAdmin ? 'PUT' : 'DELETE',
    headers: authHeaders(token),
  });
  if (res.status === 403) throw new Error('Only the head admin can change site admins.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not update admin access.'));
  return (await res.json()).isAdmin;
}

export async function getFeed(
  token: string,
  cursor?: string,
  excludedTypes: FeedContentType[] = [],
): Promise<Page<FeedEntry>> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (excludedTypes.length) params.set('exclude', excludedTypes.join(','));
  const query = params.size ? `?${params}` : '';
  const res = await api(`/feed${query}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load your feed.'));
  return res.json();
}

export async function getCommunityPosts(
  token: string | null,
  communityId: number,
  cursor?: string,
): Promise<Page<FeedEntry>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await api(`/communities/${communityId}/posts${query}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load community posts.'));
  return res.json();
}

export async function getMediaProfile(
  token: string | null,
  type: MediaType,
  sourceId: string,
): Promise<MediaProfile | null> {
  const res = await api(
    `/library/media/${encodeURIComponent(type)}/${encodeURIComponent(sourceId)}`,
    { headers: authHeaders(token) },
  );
  if (res.status === 400 || res.status === 404) return null;
  if (res.status === 403) throw new Error('This title is 18+. Check your adult-content settings.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load this title.'));
  return res.json();
}

export async function getMediaPosts(
  token: string | null,
  type: MediaType,
  sourceId: string,
  cursor?: string,
): Promise<Page<FeedEntry>> {
  const query = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : '';
  const res = await api(
    `/library/media/${encodeURIComponent(type)}/${encodeURIComponent(sourceId)}/posts${query}`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load title discussions.'));
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

export async function getComments(
  token: string | null,
  target: Commentable,
): Promise<Comment[]> {
  const query = new URLSearchParams({ type: target.type, id: String(target.id) });
  const res = await api(`/comments?${query.toString()}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load comments.'));
  return res.json();
}

export async function createComment(
  token: string,
  target: Commentable,
  content: string,
  parentId?: number,
  linkUrl?: string,
): Promise<Comment> {
  const res = await api('/comments', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...target, content, parentId, linkUrl }),
  });
  if (res.status === 400) throw new Error('Write something before commenting.');
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not post the comment. Please try again.'));
  }
  return res.json();
}

export async function getLinkPreview(
  token: string | null,
  url: string,
): Promise<LinkPreview | null> {
  const query = new URLSearchParams({ url });
  const res = await api(`/links/preview?${query.toString()}`, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load the link preview.'));
  return res.json();
}

export async function createMediaPost(
  token: string,
  type: MediaType,
  sourceId: string,
  content: string,
  linkUrl?: string,
): Promise<Post> {
  const res = await api(
    `/library/media/${encodeURIComponent(type)}/${encodeURIComponent(sourceId)}/posts`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, linkUrl }),
    },
  );
  if (res.status === 400) throw new Error('Write something before posting.');
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not post. Please try again.'));
  return res.json();
}

export async function setLike(
  token: string,
  type: 'post' | 'activity' | 'comment',
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

export async function createInvite(
  token: string,
  communityId: number,
  options: { maxAge: number | null; maxUses: number | null },
): Promise<Invite> {
  const res = await api(`/communities/${communityId}/invites`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not create an invite link.'));
  return res.json();
}

export async function getInvites(token: string, communityId: number): Promise<Invite[]> {
  const res = await api(`/communities/${communityId}/invites`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load invites.'));
  return res.json();
}

export async function revokeInvite(
  token: string,
  communityId: number,
  code: string,
): Promise<void> {
  const res = await api(
    `/communities/${communityId}/invites/${encodeURIComponent(code)}`,
    { method: 'DELETE', headers: authHeaders(token) },
  );
  if (res.status === 403) throw new Error(await errorMessage(res, 'Only admins can revoke this invite.'));
  if (!res.ok && res.status !== 404) {
    throw new Error(await errorMessage(res, 'Could not revoke the invite.'));
  }
}

export async function createPermanentInvite(
  token: string,
  communityId: number,
): Promise<Invite> {
  const res = await api(`/communities/${communityId}/invites/permanent`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not create the permanent invite.'));
  return res.json();
}

export async function setInviteEnabled(
  token: string,
  communityId: number,
  code: string,
  enabled: boolean,
): Promise<Invite> {
  const res = await api(`/communities/${communityId}/invites/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not update the permanent invite.'));
  return res.json();
}

export async function downloadInviteCard(token: string, communityId: number): Promise<Blob> {
  const res = await api(`/communities/${communityId}/invites/permanent/card`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not download the invite card.'));
  return res.blob();
}

export async function getInvitePreview(code: string): Promise<InvitePreview | null> {
  const res = await api(`/invites/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not load the invite.'));
  return res.json();
}

export async function acceptInvite(token: string, code: string): Promise<Community> {
  const res = await api(`/invites/${encodeURIComponent(code)}`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (res.status === 404) throw new Error('This invite is invalid or has expired.');
  if (res.status === 403) {
    throw new Error(await errorMessage(res, 'You cannot join this community.'));
  }
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not join the community.'));
  return res.json();
}
