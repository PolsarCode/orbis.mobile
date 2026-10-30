import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useCurrentProfile } from '@/hooks/use-current-profile';
import { useTheme } from '@/hooks/use-theme';
import { joinCommunity, searchCommunities, type CommunitySearchResult } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

function displayName(person: CommunitySearchResult['members'][number]) {
  return person.name || person.username;
}

function PersonLink({ person }: { person: CommunitySearchResult['members'][number] }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`View ${displayName(person)}’s profile`}
      onPress={() => router.push(`/users/${encodeURIComponent(person.username)}` as Href)}
      style={styles.person}>
      {person.avatarUrl ? (
        <Image source={{ uri: person.avatarUrl }} style={styles.personAvatar} />
      ) : (
        <View style={[styles.personAvatar, { backgroundColor: theme.rail }]} />
      )}
      <Atom.ThemedText type="small" numberOfLines={1}>
        {displayName(person)}
      </Atom.ThemedText>
    </Pressable>
  );
}

function CommunityCard({
  community,
  joining,
  readOnly,
  onJoin,
}: {
  community: CommunitySearchResult;
  joining: number | null;
  readOnly: boolean;
  onJoin: (community: CommunitySearchResult) => void;
}) {
  const theme = useTheme();
  const mutualNames = community.mutuals.map(displayName);
  const remainingMutuals = community.mutualCount - mutualNames.length;
  const mutualText = community.mutualCount === 0
    ? 'None of your friends are here yet.'
    : mutualNames.length === 0
      ? `${community.mutualCount} friends are here`
      : `${mutualNames.join(', ')}${remainingMutuals > 0 ? ` and ${remainingMutuals} more` : ''} ${
          community.mutualCount === 1 ? 'is' : 'are'
        } here`;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${community.name}`}
        onPress={() => router.push(`/communities/${community.id}` as Href)}
        style={styles.communityHeader}>
        {community.iconUrl ? (
          <Image source={{ uri: community.iconUrl }} style={styles.communityIcon} />
        ) : (
          <View style={[styles.communityIcon, styles.iconFallback, { backgroundColor: theme.rail }]}>
            <Atom.ThemedText type="smallBold">
              {community.name.slice(0, 1).toUpperCase()}
            </Atom.ThemedText>
          </View>
        )}
        <View style={styles.communityTitle}>
          <Atom.ThemedText type="smallBold" numberOfLines={1}>
            {community.name}{community.isVerified ? ' ✓' : ''}
          </Atom.ThemedText>
          <Atom.ThemedText type="small" themeColor="textSecondary">
            {community.memberCount.toLocaleString()} {community.memberCount === 1 ? 'member' : 'members'}
          </Atom.ThemedText>
        </View>
      </Pressable>

      <Atom.ThemedText type="small" themeColor="textSecondary">
        {community.description || 'No description yet.'}
      </Atom.ThemedText>

      {community.members.length > 0 ? (
        <View style={styles.previewGroup}>
          <Atom.ThemedText type="small" themeColor="textSecondary">Members</Atom.ThemedText>
          <View style={styles.people}>
            {community.members.map((person) => <PersonLink key={person.id} person={person} />)}
          </View>
        </View>
      ) : null}
      <Atom.ThemedText type="small" themeColor="textSecondary">{mutualText}</Atom.ThemedText>

      {community.joined ? (
        <Atom.Button
          label="Open"
          variant="secondary"
          onPress={() => router.push(`/communities/${community.id}` as Href)}
        />
      ) : (
        <>
          <Atom.Button
            label={readOnly ? 'Confirm email to join' : 'Join'}
            loading={joining === community.id}
            disabled={readOnly || (joining !== null && joining !== community.id)}
            onPress={() => onJoin(community)}
          />
          {readOnly ? (
            <Atom.ThemedText type="small" themeColor="textSecondary">
              Confirm your email before joining a community.
            </Atom.ThemedText>
          ) : null}
        </>
      )}
    </View>
  );
}

export function CommunityExplorer() {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const { profile, failed: profileFailed, retry: retryProfile } = useCurrentProfile();
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState<{
    key: string;
    results?: CommunitySearchResult[];
    error?: string;
  } | null>(null);
  const [joining, setJoining] = useState<number | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const normalizedQuery = query.trim();
  const requestKey = `${token ?? ''}:${normalizedQuery}:${attempt}`;
  const current = loaded?.key === requestKey ? loaded.results : null;
  const error = loaded?.key === requestKey ? loaded.error : null;
  const readOnly = !profile || profile.emailVerifiedAt === null;

  useEffect(() => {
    if (!token) return;
    let active = true;
    const timer = setTimeout(() => {
      searchCommunities(token, normalizedQuery)
        .then((results) => {
          if (!active) return;
          setLoaded({ key: requestKey, results });
        })
        .catch((cause: unknown) => {
          if (active) {
            setLoaded({
              key: requestKey,
              error: cause instanceof Error ? cause.message : 'Could not search communities.',
            });
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [normalizedQuery, requestKey, token]);

  async function handleJoin(community: CommunitySearchResult) {
    if (!token || joining !== null || readOnly) return;
    setJoining(community.id);
    setJoinError(null);
    try {
      await joinCommunity(token, community.id);
      router.push(`/communities/${community.id}` as Href);
    } catch (cause) {
      setJoinError(cause instanceof Error ? cause.message : 'Could not join the community.');
    } finally {
      setJoining(null);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.heading}>
        <Atom.ThemedText type="subtitle">Explore</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Find public communities and the people in them.
        </Atom.ThemedText>
      </View>
      <Atom.Input
        accessibilityLabel="Search public communities"
        autoCapitalize="none"
        maxLength={100}
        placeholder="Search communities"
        returnKeyType="search"
        value={query}
        onChangeText={setQuery}
      />
      {joinError ? <Atom.ErrorMessage>{joinError}</Atom.ErrorMessage> : null}
      {profileFailed ? (
        <View style={styles.state}>
          <Atom.ErrorMessage>Could not check your account. Joining is unavailable until it can be checked.</Atom.ErrorMessage>
          <Atom.Button label="Retry account check" variant="secondary" onPress={retryProfile} />
        </View>
      ) : null}
      {!current ? error ? (
        <View style={styles.state}>
          <Atom.ErrorMessage>{error}</Atom.ErrorMessage>
          <Atom.Button
            label="Try again"
            variant="secondary"
            onPress={() => {
              setAttempt((value) => value + 1);
            }}
          />
        </View>
      ) : (
        <View style={styles.state}>
          <ActivityIndicator color={theme.accent} />
          <Atom.ThemedText type="small" themeColor="textSecondary">Loading communities…</Atom.ThemedText>
        </View>
      ) : null}
      {current?.length === 0 ? (
        <Atom.ThemedText type="small" themeColor="textSecondary">
          {normalizedQuery ? 'No public communities match that name.' : 'No public communities yet.'}
        </Atom.ThemedText>
      ) : null}
      {current?.map((community) => (
        <CommunityCard
          key={community.id}
          community={community}
          joining={joining}
          readOnly={readOnly}
          onJoin={handleJoin}
        />
      ))}
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
  state: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  communityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  communityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  iconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityTitle: {
    flex: 1,
    minWidth: 0,
  },
  previewGroup: {
    gap: Spacing.one,
  },
  people: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: '48%',
  },
  personAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
