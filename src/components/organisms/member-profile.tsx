import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as Atom from '@atom';
import * as Template from '@template';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FeedCard } from '@/components/organisms/feed-card';
import {
  getPublicProfile,
  getUserClips,
  getUserPosts,
  removeProfileImage,
  setLike,
  uploadProfileImage,
  type Clip,
  type FeedContentType,
  type FeedEntry,
  type LibraryStatus,
  type ProfileImage,
  type PublicProfile,
} from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

const profileTabs = [
  { value: 'posts', label: 'Posts' },
  { value: 'library', label: 'Library' },
  { value: 'friends', label: 'Friends' },
  { value: 'communities', label: 'Communities' },
  { value: 'clips', label: 'Clips' },
] as const;

const postTypes: { value: FeedContentType; label: string }[] = [
  { value: 'post', label: 'Posts' },
  { value: 'activity', label: 'Library updates' },
];

type ProfileTab = (typeof profileTabs)[number]['value'];
type ProfileState = { username: string; profile: PublicProfile | null; failed?: boolean };

const libraryStatuses: LibraryStatus[] = ['current', 'completed', 'on_hold', 'dropped', 'planned'];
const libraryStatusLabels: Record<LibraryStatus, string> = {
  current: 'In progress',
  completed: 'Completed',
  on_hold: 'On hold',
  dropped: 'Dropped',
  planned: 'Planned',
};

function isProfileTab(value: string | undefined): value is ProfileTab {
  return profileTabs.some((tab) => tab.value === value);
}

function displayName(profile: Pick<PublicProfile, 'name' | 'username'>) {
  return profile.name || profile.username;
}

function joinedDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function statusLabel(status: PublicProfile['status'], online: boolean) {
  return online ? status[0].toUpperCase() + status.slice(1) : 'Offline';
}

function ProfileEmpty({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Atom.ThemedText type="smallBold">{title}</Atom.ThemedText>
      <Atom.ThemedText type="small" themeColor="textSecondary">{body}</Atom.ThemedText>
    </View>
  );
}

export function MemberProfile({ username: initialUsername }: { username?: string }) {
  const params = useLocalSearchParams<{ username?: string; tab?: string | string[] }>();
  const username = initialUsername ?? params.username ?? '';
  const token = useAuthStore((state) => state.token);
  const signedInProfile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);
  const fetchCurrentProfile = useAuthStore((state) => state.fetchProfile);
  const theme = useTheme();
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const [loaded, setLoaded] = useState<ProfileState | null>(null);
  const [posts, setPosts] = useState<FeedEntry[]>([]);
  const [postCursor, setPostCursor] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipCursor, setClipCursor] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus | 'all'>('all');
  const [hiddenTypes, setHiddenTypes] = useState<FeedContentType[]>([]);
  const [pendingImage, setPendingImage] = useState<ProfileImage | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [profileAttempt, setProfileAttempt] = useState(0);
  const currentLoaded = loaded?.username === username ? loaded : null;
  const profile = currentLoaded?.profile ?? null;
  const activeTab =
    isProfileTab(requestedTab) &&
    (requestedTab !== 'clips' || profile?.hasClips !== false)
      ? requestedTab
      : 'posts';
  const isSelf = Boolean(profile && signedInProfile?.userId === profile.userId);
  const contentUsername = profile && !profile.restricted ? profile.username : null;
  const hasClips = profile?.hasClips ?? false;

  function signOut() {
    logout();
    router.replace('/');
  }

  useEffect(() => {
    if (token && !signedInProfile) {
      fetchCurrentProfile().catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not load your account.');
      });
    }
  }, [fetchCurrentProfile, signedInProfile, token]);

  useEffect(() => {
    let active = true;
    getPublicProfile(token, username)
      .then((result) => {
        if (active) setLoaded({ username, profile: result });
      })
      .catch(() => {
        if (active) setLoaded({ username, profile: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [profileAttempt, token, username]);

  useEffect(() => {
    if (!contentUsername) return;
    if (activeTab === 'posts') {
      let active = true;
      getUserPosts(token, contentUsername, undefined, hiddenTypes)
        .then((page) => {
          if (!active) return;
          setPosts(page.items);
          setPostCursor(page.nextCursor);
        })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : 'Could not load posts.');
        })
        .finally(() => {
          if (active) setContentLoading(false);
        });
      return () => {
        active = false;
      };
    }

    if (activeTab === 'clips' && hasClips) {
      let active = true;
      getUserClips(token, contentUsername)
        .then((page) => {
          if (!active) return;
          setClips(page.items);
          setClipCursor(page.nextCursor);
        })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : 'Could not load clips.');
        })
        .finally(() => {
          if (active) setContentLoading(false);
        });
      return () => {
        active = false;
      };
    }
  }, [activeTab, contentUsername, hasClips, hiddenTypes, loadAttempt, token]);

  const imageChoices = useMemo(
    () => [
      { type: 'avatar' as const, label: 'Profile picture', url: profile?.avatarUrl, aspect: [1, 1] as [number, number] },
      { type: 'cover' as const, label: 'Cover', url: profile?.coverUrl, aspect: [3, 1] as [number, number] },
      { type: 'background' as const, label: 'Wallpaper', url: profile?.backgroundUrl, aspect: undefined },
    ],
    [profile?.avatarUrl, profile?.backgroundUrl, profile?.coverUrl],
  );

  const changeTab = useCallback((tab: ProfileTab) => {
    setError(null);
    setContentLoading(tab === 'posts' || tab === 'clips');
    if (tab === activeTab && (tab === 'posts' || tab === 'clips')) {
      setLoadAttempt((attempt) => attempt + 1);
      return;
    }
    router.setParams({ tab: tab === 'posts' ? undefined : tab });
  }, [activeTab]);

  function togglePostType(type: FeedContentType) {
    const hidden = hiddenTypes.includes(type)
      ? hiddenTypes.filter((value) => value !== type)
      : [...hiddenTypes, type];
    if (hidden.length === postTypes.length) return;
    setError(null);
    setContentLoading(true);
    setHiddenTypes(hidden);
  }

  function showUpdatedImages(updated: Pick<PublicProfile, 'avatarUrl' | 'coverUrl' | 'backgroundUrl'>) {
    setLoaded((current) =>
      current?.profile
        ? {
            ...current,
            profile: {
              ...current.profile,
              avatarUrl: updated.avatarUrl,
              coverUrl: updated.coverUrl,
              backgroundUrl: updated.backgroundUrl,
            },
          }
        : current,
    );
    fetchCurrentProfile().catch(() => null);
  }

  async function pickImage(type: ProfileImage, aspect?: [number, number]) {
    if (!token || pendingImage) return;
    setImageError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: Boolean(aspect),
        ...(aspect ? { aspect } : {}),
        quality: 1,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return;
      const image = result.assets[0];
      if (!image) throw new Error('The image picker returned no image.');
      if (image.fileSize !== null && image.fileSize !== undefined && image.fileSize > 10 * 1024 * 1024) {
        throw new Error('Images must be 10 MB or smaller.');
      }
      setPendingImage(type);
      const updated = await uploadProfileImage(
        token,
        type,
        image.uri,
        image.fileName ?? null,
        image.mimeType ?? null,
      );
      showUpdatedImages(updated);
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : `Could not upload your ${type}.`);
    } finally {
      setPendingImage(null);
    }
  }

  function removeImage(type: ProfileImage) {
    if (!token) return;
    setPendingImage(type);
    setImageError(null);
    removeProfileImage(token, type)
      .then(showUpdatedImages)
      .catch((cause: unknown) => {
        setImageError(cause instanceof Error ? cause.message : `Could not remove your ${type}.`);
      })
      .finally(() => setPendingImage(null));
  }

  function confirmRemoveImage(type: ProfileImage, label: string) {
    if (!token || pendingImage) return;
    const title = `Remove ${label.toLowerCase()}?`;
    const message = 'You can add another image at any time.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${title} ${message}`)) removeImage(type);
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeImage(type) },
    ]);
  }

  async function loadMore() {
    if (!profile || moreLoading) return;
    const cursor = activeTab === 'posts' ? postCursor : clipCursor;
    if (!cursor) return;
    setMoreLoading(true);
    setError(null);
    try {
      if (activeTab === 'posts') {
        const page = await getUserPosts(token, profile.username, cursor, hiddenTypes);
        setPosts((current) => [...current, ...page.items]);
        setPostCursor(page.nextCursor);
      } else if (activeTab === 'clips') {
        const page = await getUserClips(token, profile.username, cursor);
        setClips((current) => [...current, ...page.items]);
        setClipCursor(page.nextCursor);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more items.');
    } finally {
      setMoreLoading(false);
    }
  }

  async function openClip(url: string) {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this Twitch clip.');
    }
  }

  async function toggleLike(item: FeedEntry) {
    if (!token) {
      setError('Log in to like posts.');
      return;
    }
    try {
      const result = await setLike(token, item.type, item.id, !item.liked);
      setPosts((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, liked: result.liked, likeCount: result.likeCount }
            : entry,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your like.');
    }
  }

  if (!currentLoaded) {
    return (
      <Template.ScreenTemplate>
        <View style={styles.centered}><Atom.ThemedText themeColor="textSecondary">Loading profile…</Atom.ThemedText></View>
      </Template.ScreenTemplate>
    );
  }

  if (!profile) {
    return (
      <Template.ScreenTemplate>
        <View style={styles.list}>
          <ProfileEmpty
            title={currentLoaded.failed ? 'This profile could not be loaded.' : 'Profile not found.'}
            body={currentLoaded.failed ? 'Check your connection and try again.' : `There is no user called @${username}.`}
          />
          {currentLoaded.failed ? (
            <Atom.Button
              label="Try again"
              variant="secondary"
              onPress={() => setProfileAttempt((attempt) => attempt + 1)}
            />
          ) : null}
        </View>
      </Template.ScreenTemplate>
    );
  }

  const name = displayName(profile);
  const status = statusLabel(profile.status, profile.online);

  return (
    <Template.ScreenTemplate>
      <View style={styles.page}>
        <ImageBackground
          source={profile.backgroundUrl ? { uri: profile.backgroundUrl } : undefined}
          imageStyle={styles.wallpaper}
          style={[styles.profileHeader, { backgroundColor: theme.accentSoft }]}>
          {profile.coverUrl ? (
            <Image source={{ uri: profile.coverUrl }} style={styles.coverImage} resizeMode="cover" />
          ) : null}
          <View style={styles.headerShade} />
          <View style={styles.identity}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.rail }]}>
                <Atom.ThemedText type="subtitle">{Array.from(name)[0]?.toUpperCase()}</Atom.ThemedText>
              </View>
            )}
            <View style={styles.identityText}>
              <Atom.ThemedText type="subtitle" style={styles.headerText}>{name}</Atom.ThemedText>
              <Atom.ThemedText type="small" style={styles.headerText}>
                @{profile.username}
                {profile.isVerified ? ' · Verified' : ''}
              </Atom.ThemedText>
              {profile.isHeadAdmin || profile.isAdmin ? (
                <Atom.ThemedText type="small" style={styles.headerText}>
                  {profile.isHeadAdmin ? 'Head admin' : 'Site admin'}
                </Atom.ThemedText>
              ) : null}
            </View>
            <View style={styles.status}>
              <Atom.ThemedText type="smallBold" style={styles.headerText}>{status}</Atom.ThemedText>
            </View>
          </View>
        </ImageBackground>

        <View style={styles.meta}>
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Joined {joinedDate(profile.createdAt)}
          </Atom.ThemedText>
          <Atom.ThemedText type="small" themeColor="textSecondary">
            {profile.isPublic ? 'Public profile' : 'Private profile'}
          </Atom.ThemedText>
          {profile.restricted ? null : (
            <Atom.ThemedText type="small" themeColor="textSecondary">
              {profile.postCount} posts · {profile.friendCount} friends · {profile.communityCount} communities
            </Atom.ThemedText>
          )}
        </View>

        {isSelf ? (
          <View style={styles.accountActions}>
            <Atom.Button
              label="Account settings"
              variant="secondary"
              onPress={() => router.push('/settings' as Href)}
            />
            {signedInProfile?.isAdmin ? (
              <Atom.Button
                label="Site admin directory"
                variant="secondary"
                onPress={() => router.push('/directory' as Href)}
              />
            ) : null}
            <Atom.Button label="Log out" variant="secondary" onPress={signOut} />
          </View>
        ) : null}

        {isSelf ? (
          <View style={styles.imageControls}>
            <Atom.ThemedText type="smallBold">Profile images</Atom.ThemedText>
            <View style={styles.imageButtons}>
              {imageChoices.map((choice) => (
                <View key={choice.type} style={styles.imageButton}>
                  <Atom.Button
                    label={pendingImage === choice.type ? 'Saving…' : `Change ${choice.label.toLowerCase()}`}
                    variant="secondary"
                    disabled={pendingImage !== null}
                    onPress={() => pickImage(choice.type, choice.aspect)}
                  />
                  {choice.url ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${choice.label.toLowerCase()}`}
                      disabled={pendingImage !== null}
                      onPress={() => confirmRemoveImage(choice.type, choice.label)}
                      style={styles.removeButton}>
                      <Atom.ThemedText type="small" style={{ color: theme.accent }}>Remove</Atom.ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
            {imageError ? <Atom.ErrorMessage>{imageError}</Atom.ErrorMessage> : null}
          </View>
        ) : null}

        {profile.restricted ? (
          <ProfileEmpty
            title="This profile is private."
            body={`${name}’s posts, friends, communities, and library are only visible to friends.`}
          />
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.tabs, { borderBottomColor: theme.divider }]}>
              {profileTabs
                .filter((tab) => tab.value !== 'clips' || profile.hasClips)
                .map((tab) => (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: activeTab === tab.value }}
                    key={tab.value}
                    onPress={() => changeTab(tab.value)}
                    style={[
                      styles.tab,
                      activeTab === tab.value && { borderBottomColor: theme.accent },
                    ]}>
                    <Atom.ThemedText
                      type="smallBold"
                      style={{ color: activeTab === tab.value ? theme.accent : theme.text }}>
                      {tab.label}
                      {tab.value === 'library' ? ` (${profile.library.length})` : ''}
                      {tab.value === 'friends' ? ` (${profile.friendCount})` : ''}
                      {tab.value === 'communities' ? ` (${profile.communityCount})` : ''}
                    </Atom.ThemedText>
                  </Pressable>
                ))}
            </ScrollView>

            {activeTab === 'posts' ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}>
                {postTypes.map(({ value, label }) => {
                  const shown = !hiddenTypes.includes(value);
                  const locked = moreLoading || (shown && hiddenTypes.length === postTypes.length - 1);
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: shown, disabled: locked }}
                      disabled={locked}
                      onPress={() => togglePostType(value)}
                      style={[
                        styles.filter,
                        {
                          borderColor: shown ? theme.accent : theme.divider,
                          backgroundColor: shown ? theme.accentSoft : theme.surface,
                        },
                      ]}>
                      <Atom.ThemedText
                        type="small"
                        style={{ color: shown ? theme.accent : theme.text }}>
                        {label}
                      </Atom.ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            {error ? <Atom.ErrorMessage>{error}</Atom.ErrorMessage> : null}
            {contentLoading && (activeTab === 'posts' || activeTab === 'clips') ? (
              <View style={styles.centered}><Atom.ThemedText themeColor="textSecondary">Loading…</Atom.ThemedText></View>
            ) : activeTab === 'posts' ? (
              posts.length ? (
                <View style={styles.list}>
                  {posts.map((item) => (
                    <FeedCard
                      key={`${item.type}-${item.id}`}
                      item={item}
                      onLike={toggleLike}
                    />
                  ))}
                </View>
              ) : (
                hiddenTypes.length ? (
                  <ProfileEmpty
                    title="Nothing matches these filters."
                    body={`Turn on more kinds of posts to see more from ${name}.`}
                  />
                ) : (
                  <ProfileEmpty title="Nothing here yet." body={`${name}’s posts and shared activity will appear here.`} />
                )
              )
            ) : activeTab === 'library' ? (
              profile.library.length ? (
                <View style={styles.list}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filters}>
                    {(['all', ...libraryStatuses] as const)
                      .filter(
                        (value) =>
                          value === 'all' || profile.library.some((entry) => entry.status === value),
                      )
                      .map((value) => {
                        const selected = libraryStatus === value;
                        const count =
                          value === 'all'
                            ? profile.library.length
                            : profile.library.filter((entry) => entry.status === value).length;
                        return (
                          <Pressable
                            key={value}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => setLibraryStatus(value)}
                            style={[
                              styles.filter,
                              {
                                borderColor: selected ? theme.accent : theme.divider,
                                backgroundColor: selected ? theme.accentSoft : theme.surface,
                              },
                            ]}>
                            <Atom.ThemedText
                              type="small"
                              style={{ color: selected ? theme.accent : theme.text }}>
                              {value === 'all' ? 'All' : libraryStatusLabels[value]} · {count}
                            </Atom.ThemedText>
                          </Pressable>
                        );
                      })}
                  </ScrollView>
                  {profile.library
                    .filter((entry) => libraryStatus === 'all' || entry.status === libraryStatus)
                    .map((entry) => (
                    <View key={entry.id} style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
                      {entry.coverImage ? <Image source={{ uri: entry.coverImage }} style={styles.libraryCover} /> : null}
                      <View style={styles.itemBody}>
                        <Atom.ThemedText type="smallBold">{entry.title}</Atom.ThemedText>
                        <Atom.ThemedText type="small" themeColor="textSecondary">
                          {entry.mediaType} · {entry.status.replace('_', ' ')}
                        </Atom.ThemedText>
                        {entry.total ? (
                          <Atom.ThemedText type="small" themeColor="textSecondary">
                            Progress {entry.progress} / {entry.total}
                          </Atom.ThemedText>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <ProfileEmpty title="Nothing on the shelf." body="Public library titles will show up here." />
              )
            ) : activeTab === 'friends' ? (
              profile.friends.length ? (
                <View style={styles.list}>
                  {profile.friends.map((friend) => (
                    <Pressable
                      key={friend.userId}
                      accessibilityRole="link"
                      onPress={() => router.push(`/users/${encodeURIComponent(friend.username)}` as Href)}
                      style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
                      {friend.avatarUrl ? (
                        <Image source={{ uri: friend.avatarUrl }} style={styles.friendAvatar} />
                      ) : (
                        <View style={[styles.friendAvatar, styles.avatarFallback, { backgroundColor: theme.rail }]}>
                          <Atom.ThemedText type="smallBold">{friend.username[0]?.toUpperCase()}</Atom.ThemedText>
                        </View>
                      )}
                      <View style={styles.itemBody}>
                        <Atom.ThemedText type="smallBold">
                          {friend.name || friend.username}{friend.isVerified ? ' · Verified' : ''}
                        </Atom.ThemedText>
                        <Atom.ThemedText type="small" themeColor="textSecondary">
                          @{friend.username} · {friend.online ? friend.status : 'offline'}
                        </Atom.ThemedText>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <ProfileEmpty title="No friends yet." body={`${name} hasn’t added any friends yet.`} />
              )
            ) : activeTab === 'communities' ? (
              profile.communities.length ? (
                <View style={styles.list}>
                  {profile.communities.map((community) => (
                    <Pressable
                      key={community.id}
                      accessibilityRole="link"
                      onPress={() => router.push(`/communities/${community.id}` as Href)}
                      style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
                      {community.iconUrl ? <Image source={{ uri: community.iconUrl }} style={styles.friendAvatar} /> : null}
                      <View style={styles.itemBody}>
                        <Atom.ThemedText type="smallBold">
                          {community.name}{community.isVerified ? ' · Verified' : ''}
                        </Atom.ThemedText>
                        <Atom.ThemedText type="small" themeColor="textSecondary">
                          {community.memberCount} members{community.isOwner ? ' · Owner' : ''}
                        </Atom.ThemedText>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <ProfileEmpty
                  title={profile.communityCount ? 'Only private communities.' : 'No communities yet.'}
                  body={profile.communityCount
                    ? `${name} is in private communities you are not a member of.`
                    : `${name} hasn’t joined any communities yet.`}
                />
              )
            ) : clips.length ? (
              <View style={styles.list}>
                {clips.map((clip) => (
                  <Pressable
                    key={clip.id}
                    accessibilityRole="link"
                    onPress={() => openClip(clip.url)}
                    style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
                    <Image source={{ uri: clip.thumbnailUrl }} style={styles.clipThumbnail} />
                    <View style={styles.itemBody}>
                      <Atom.ThemedText type="smallBold">{clip.title}</Atom.ThemedText>
                      <Atom.ThemedText type="small" themeColor="textSecondary">
                        {clip.viewCount.toLocaleString()} views · Clipped by {clip.creatorName}
                      </Atom.ThemedText>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <ProfileEmpty title="No clips yet." body={`When people clip ${name}’s streams, they’ll show up here.`} />
            )}

            {error && (activeTab === 'posts' || activeTab === 'clips') ? (
              <Atom.Button
                label="Try again"
                variant="secondary"
                onPress={() => {
                  setError(null);
                  setContentLoading(true);
                  setLoadAttempt((attempt) => attempt + 1);
                }}
              />
            ) : null}
            {(activeTab === 'posts' ? postCursor : activeTab === 'clips' ? clipCursor : null) ? (
              <Atom.Button
                label="Load more"
                variant="secondary"
                loading={moreLoading}
                onPress={loadMore}
              />
            ) : null}
          </>
        )}
      </View>
    </Template.ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    gap: Spacing.three,
  },
  centered: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    width: '100%',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  profileHeader: {
    height: 190,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: Spacing.two,
  },
  wallpaper: {
    opacity: 0.55,
  },
  coverImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  headerShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#00000066',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  identityText: {
    flex: 1,
    gap: Spacing.half,
  },
  headerText: {
    color: '#ffffff',
  },
  status: {
    alignSelf: 'flex-start',
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    gap: Spacing.one,
  },
  accountActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  imageControls: {
    gap: Spacing.two,
  },
  imageButtons: {
    gap: Spacing.two,
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  removeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  tabs: {
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingHorizontal: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  filters: {
    gap: Spacing.two,
  },
  filter: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  itemBody: {
    flex: 1,
    gap: Spacing.one,
  },
  libraryCover: {
    width: 52,
    height: 72,
    borderRadius: Spacing.one,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  clipThumbnail: {
    width: 112,
    aspectRatio: 16 / 9,
    borderRadius: Spacing.one,
  },
});
