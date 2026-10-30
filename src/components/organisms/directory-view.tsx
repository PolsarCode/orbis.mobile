import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getDirectoryCommunities,
  getDirectoryUsers,
  setCommunityVerified,
  setProfileAdmin,
  setProfileVerified,
  type DirectoryCommunity,
  type DirectoryUser,
  type NumberedPage,
} from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

type DirectoryTab = 'users' | 'communities';
type DirectoryViewMode = 'cards' | 'list';

function formattedDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function useDirectoryPage<T>(
  load: (token: string, page: number) => Promise<NumberedPage<T>>,
) {
  const token = useAuthStore((state) => state.token);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${token ?? ''}:${page}:${attempt}`;
  const [loaded, setLoaded] = useState<{
    token: string;
    page: number;
    result: NumberedPage<T>;
  } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const failed = failedKey === requestKey;
  const current = loaded?.token === token && loaded.page === page ? loaded.result : null;

  useEffect(() => {
    if (!token) return;
    let active = true;
    load(token, page)
      .then((result) => {
        if (!active) return;
        setLoaded({ token, page, result });
      })
      .catch(() => {
        if (active) setFailedKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [load, page, requestKey, token]);

  function updateItem(predicate: (item: T) => boolean, update: (item: T) => T) {
    setLoaded((currentPage) => currentPage
      && currentPage.token === token
      ? {
          ...currentPage,
          result: {
            ...currentPage.result,
            items: currentPage.result.items.map((item) => predicate(item) ? update(item) : item),
          },
        }
      : currentPage);
  }

  return {
    page,
    setPage,
    current,
    failed,
    retry: () => {
      setAttempt((value) => value + 1);
    },
    updateItem,
  };
}

function EntryImage({
  uri,
  label,
  size = 48,
}: {
  uri: string | null;
  label: string;
  size?: number;
}) {
  const theme = useTheme();
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View
      style={[
        styles.imageFallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.rail },
      ]}>
      <Atom.ThemedText type="smallBold">{label.slice(0, 1).toUpperCase()}</Atom.ThemedText>
    </View>
  );
}

function EntryCard({
  children,
  view,
  onPress,
}: {
  children: ReactNode;
  view: DirectoryViewMode;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.entry,
        view === 'cards' ? styles.entryCard : styles.entryRow,
        {
          backgroundColor: theme.surface,
          borderColor: theme.divider,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      {children}
    </Pressable>
  );
}

function UserInfo({ user }: { user: DirectoryUser }) {
  return (
    <View style={styles.info}>
      <Atom.ThemedText type="smallBold" numberOfLines={1}>
        {user.name || user.username}
        {user.isVerified ? ' ✓' : ''}
      </Atom.ThemedText>
      <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        @{user.username} · {user.email}
      </Atom.ThemedText>
      <Atom.ThemedText type="small" themeColor="textSecondary">
        {user.isHeadAdmin ? 'Head admin' : user.isAdmin ? 'Site admin' : 'Member'} · Joined {formattedDate(user.createdAt)}
      </Atom.ThemedText>
      <Atom.ThemedText type="small" themeColor="textSecondary">
        {user.communityCount} {user.communityCount === 1 ? 'community' : 'communities'} · Email{' '}
        {user.emailVerifiedAt ? 'confirmed' : 'not confirmed'}
      </Atom.ThemedText>
    </View>
  );
}

function CommunityInfo({ community }: { community: DirectoryCommunity }) {
  return (
    <View style={styles.info}>
      <Atom.ThemedText type="smallBold" numberOfLines={1}>
        {community.name}{community.isVerified ? ' ✓' : ''}
      </Atom.ThemedText>
      <Atom.ThemedText type="small" themeColor="textSecondary">
        {community.isPublic ? 'Public' : 'Private'} · {community.memberCount.toLocaleString()}{' '}
        {community.memberCount === 1 ? 'member' : 'members'}
      </Atom.ThemedText>
      <Atom.ThemedText type="small" themeColor="textSecondary">
        Created {formattedDate(community.createdAt)}
      </Atom.ThemedText>
    </View>
  );
}

function UserActions({
  user,
  token,
  update,
}: {
  user: DirectoryUser;
  token: string;
  update: (user: DirectoryUser) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(action: () => Promise<Partial<DirectoryUser>>) {
    setBusy(true);
    setError(null);
    try {
      update({ ...user, ...await action() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this user.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.controls}>
      <Atom.Button
        label={user.isVerified ? 'Unverify' : 'Verify'}
        variant="secondary"
        disabled={busy}
        loading={busy}
        onPress={() => change(async () => ({
          isVerified: await setProfileVerified(token, user.username, !user.isVerified),
        }))}
      />
      {!user.isHeadAdmin ? (
        <Atom.Button
          label={user.isAdmin ? 'Remove admin' : 'Make admin'}
          variant="secondary"
          disabled={busy}
          onPress={() => change(async () => ({
            isAdmin: await setProfileAdmin(token, user.username, !user.isAdmin),
          }))}
        />
      ) : null}
      {error ? <Atom.ErrorMessage>{error}</Atom.ErrorMessage> : null}
    </View>
  );
}

function CommunityActions({
  community,
  token,
  update,
}: {
  community: DirectoryCommunity;
  token: string;
  update: (community: DirectoryCommunity) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.controls}>
      <Atom.Button
        label={community.isVerified ? 'Unverify' : 'Verify'}
        variant="secondary"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const isVerified = await setCommunityVerified(token, community.id, !community.isVerified);
            update({ ...community, isVerified });
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not update this community.');
          } finally {
            setBusy(false);
          }
        }}
      />
      {error ? <Atom.ErrorMessage>{error}</Atom.ErrorMessage> : null}
    </View>
  );
}

function DirectoryList<T>({
  load,
  label,
  keyFor,
  view,
  setView,
  renderItem,
}: {
  load: (token: string, page: number) => Promise<NumberedPage<T>>;
  label: string;
  keyFor: (item: T) => string | number;
  view: DirectoryViewMode;
  setView: (view: DirectoryViewMode) => void;
  renderItem: (
    item: T,
    view: DirectoryViewMode,
    update: (next: T) => void,
  ) => ReactNode;
}) {
  const theme = useTheme();
  const { page, setPage, current, failed, retry, updateItem } = useDirectoryPage(load);

  if (!current) {
    return (
      <View style={styles.state}>
        {failed ? (
          <>
            <Atom.ErrorMessage>Could not load {label}. Check your connection and try again.</Atom.ErrorMessage>
            <Atom.Button label="Try again" variant="secondary" onPress={retry} />
          </>
        ) : (
          <ActivityIndicator color={theme.accent} />
        )}
      </View>
    );
  }

  const { items, total, pageSize } = current;
  return (
    <View style={styles.listPage}>
      <View style={styles.listHeader}>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          {total.toLocaleString()} {label}
        </Atom.ThemedText>
        <View style={styles.toggle}>
          {(['cards', 'list'] as const).map((value) => (
            <Atom.Button
              key={value}
              label={value === 'cards' ? 'Cards' : 'List'}
              variant={view === value ? 'primary' : 'secondary'}
              accessibilityState={{ selected: view === value }}
              onPress={() => setView(value)}
            />
          ))}
        </View>
      </View>

      {items.length === 0 ? (
        <Atom.ThemedText type="small" themeColor="textSecondary">No {label} on this page.</Atom.ThemedText>
      ) : (
        <View
          style={[
            view === 'cards' ? styles.cards : styles.rows,
            { borderColor: theme.divider },
          ]}>
          {items.map((item) => (
            <View
              key={keyFor(item)}
              style={view === 'cards' ? styles.cardItem : styles.rowItem}>
              {renderItem(item, view, (next) => updateItem((currentItem) => currentItem === item, () => next))}
            </View>
          ))}
        </View>
      )}
      {total > pageSize ? (
        <View style={styles.pagination}>
          <Atom.Button
            label="Previous"
            variant="secondary"
            disabled={page <= 1}
            onPress={() => setPage((value) => Math.max(1, value - 1))}
          />
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Page {page} of {Math.ceil(total / pageSize)}
          </Atom.ThemedText>
          <Atom.Button
            label="Next"
            variant="secondary"
            disabled={page * pageSize >= total}
            onPress={() => setPage((value) => value + 1)}
          />
        </View>
      ) : null}
    </View>
  );
}

function UserDirectory({
  headAdmin,
  view,
  setView,
}: {
  headAdmin: boolean;
  view: DirectoryViewMode;
  setView: (view: DirectoryViewMode) => void;
}) {
  const token = useAuthStore((state) => state.token);
  return (
    <DirectoryList
      load={getDirectoryUsers}
      label="users"
      keyFor={(user: DirectoryUser) => user.userId}
      view={view}
      setView={setView}
      renderItem={(user: DirectoryUser, view, update) => (
        <>
          <EntryCard
            view={view}
            onPress={() => router.push(`/users/${encodeURIComponent(user.username)}` as Href)}>
            <EntryImage uri={user.avatarUrl} label={user.username} size={view === 'cards' ? 64 : 48} />
            <UserInfo user={user} />
          </EntryCard>
          {headAdmin && token ? <UserActions user={user} token={token} update={update} /> : null}
        </>
      )}
    />
  );
}

function CommunityDirectory({
  headAdmin,
  view,
  setView,
}: {
  headAdmin: boolean;
  view: DirectoryViewMode;
  setView: (view: DirectoryViewMode) => void;
}) {
  const token = useAuthStore((state) => state.token);
  return (
    <DirectoryList
      load={getDirectoryCommunities}
      label="communities"
      keyFor={(community: DirectoryCommunity) => community.id}
      view={view}
      setView={setView}
      renderItem={(community: DirectoryCommunity, view, update) => (
        <>
          <EntryCard
            view={view}
            onPress={() => router.push(`/communities/${community.id}` as Href)}>
            <EntryImage uri={community.iconUrl} label={community.name} size={view === 'cards' ? 64 : 48} />
            <CommunityInfo community={community} />
          </EntryCard>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View ${community.owner.username}’s profile`}
            onPress={() => router.push(`/users/${encodeURIComponent(community.owner.username)}` as Href)}>
            <Atom.ThemedText type="small" themeColor="textSecondary">
              Owner: @{community.owner.username}
            </Atom.ThemedText>
          </Pressable>
          {headAdmin && token ? (
            <CommunityActions community={community} token={token} update={update} />
          ) : null}
        </>
      )}
    />
  );
}

export function DirectoryView({ headAdmin }: { headAdmin: boolean }) {
  const theme = useTheme();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const [view, setView] = useState<DirectoryViewMode>('cards');
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab: DirectoryTab = requestedTab === 'communities' ? 'communities' : 'users';

  function selectTab(value: DirectoryTab) {
    router.setParams({ tab: value === 'users' ? undefined : value });
  }

  return (
    <View style={styles.page}>
      <View style={styles.heading}>
        <Atom.ThemedText type="subtitle">Directory</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Browse Orbis accounts and communities.
        </Atom.ThemedText>
      </View>
      <View style={[styles.tabs, { borderBottomColor: theme.divider }]}>
        {(['users', 'communities'] as const).map((value) => (
          <Atom.Button
            key={value}
            label={value === 'users' ? 'Users' : 'Communities'}
            variant={tab === value ? 'primary' : 'secondary'}
            accessibilityState={{ selected: tab === value }}
            onPress={() => selectTab(value)}
          />
        ))}
      </View>
      {tab === 'users'
        ? <UserDirectory headAdmin={headAdmin} view={view} setView={setView} />
        : <CommunityDirectory headAdmin={headAdmin} view={view} setView={setView} />}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    gap: Spacing.three,
  },
  heading: {
    gap: Spacing.one,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: Spacing.two,
  },
  listPage: {
    gap: Spacing.three,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  toggle: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  cards: {
    gap: Spacing.two,
  },
  rows: {
    gap: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardItem: {
    gap: Spacing.two,
  },
  rowItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
  },
  entry: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
  },
  entryCard: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  entryRow: {
    flexDirection: 'row',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  controls: {
    gap: Spacing.two,
  },
  state: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
