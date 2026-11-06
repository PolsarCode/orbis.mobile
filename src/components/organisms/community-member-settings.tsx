import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useCurrentProfile } from '@/hooks/use-current-profile';
import { useTheme } from '@/hooks/use-theme';
import {
  getMembers,
  setNickname,
  setShowLibraryUpdates,
  type Community,
  type Member,
} from '@/lib/api';
import { useReadOnly } from '@/lib/read-only';
import { useAuthStore } from '@/stores/auth-store';

type Loaded = { key: string; member: Member | null; error: string | null };
type Feedback = { key: string; message: string; kind: 'error' | 'success' };

export function CommunityMemberSettings({ community }: { community: Community }) {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const { profile, failed: profileFailed, retry: retryProfile } = useCurrentProfile();
  const readOnly = useReadOnly();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [nicknameDrafts, setNicknameDrafts] = useState<Record<string, string>>({});
  const [nicknamePendingKey, setNicknamePendingKey] = useState<string | null>(null);
  const [nicknameFeedback, setNicknameFeedback] = useState<Feedback | null>(null);
  const [updatesOverride, setUpdatesOverride] = useState<{ key: string; value: boolean } | null>(null);
  const [updatesPendingKey, setUpdatesPendingKey] = useState<string | null>(null);
  const [updatesFeedback, setUpdatesFeedback] = useState<Feedback | null>(null);
  const requestKey = `${token ?? ''}:${community.id}:${attempt}:${profile?.userId ?? ''}`;
  const current = loaded?.key === requestKey ? loaded : null;
  const savedNickname = current?.member?.nickname ?? '';
  const nickname = nicknameDrafts[requestKey] ?? savedNickname;
  const nicknamePending = nicknamePendingKey === requestKey;
  const nicknameError =
    nicknameFeedback?.key === requestKey && nicknameFeedback.kind === 'error'
      ? nicknameFeedback.message
      : null;
  const nicknameMessage =
    nicknameFeedback?.key === requestKey && nicknameFeedback.kind === 'success'
      ? nicknameFeedback.message
      : null;
  const showUpdates = updatesOverride?.key === requestKey
    ? updatesOverride.value
    : community.showLibraryUpdates ?? true;
  const updatesPending = updatesPendingKey === requestKey;
  const updatesError = updatesFeedback?.key === requestKey ? updatesFeedback.message : null;

  useEffect(() => {
    if (!token || !community.role || !profile) return;
    let active = true;
    getMembers(token, community.id)
      .then((members) => {
        if (active && useAuthStore.getState().token === token) {
          setLoaded({
            key: requestKey,
            member: members.find(({ userId }) => userId === profile.userId) ?? null,
            error: null,
          });
        }
      })
      .catch((cause: unknown) => {
        if (active && useAuthStore.getState().token === token) {
          setLoaded({
            key: requestKey,
            member: null,
            error: cause instanceof Error ? cause.message : 'Could not load your membership.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [community.id, community.role, profile, requestKey, token]);

  async function saveNickname() {
    if (!token || !current?.member || nicknamePending || readOnly) return;
    setNicknameFeedback(null);
    setNicknamePendingKey(requestKey);
    try {
      const result = await setNickname(token, community.id, nickname.trim() || null);
      if (useAuthStore.getState().token !== token) return;
      const saved = result.nickname ?? '';
      setNicknameDrafts((drafts) => ({ ...drafts, [requestKey]: saved }));
      setNicknameFeedback({
        key: requestKey,
        message: saved ? 'Nickname saved.' : 'Nickname removed.',
        kind: 'success',
      });
      setLoaded((value) => value?.key === requestKey && value.member
        ? { ...value, member: { ...value.member, nickname: result.nickname } }
        : value);
    } catch (cause) {
      if (useAuthStore.getState().token === token) {
        setNicknameFeedback({
          key: requestKey,
          message: cause instanceof Error ? cause.message : 'Could not save your nickname.',
          kind: 'error',
        });
      }
    } finally {
      setNicknamePendingKey((key) => key === requestKey ? null : key);
    }
  }

  async function changeLibraryUpdates(next: boolean) {
    if (!token || updatesPending || readOnly) return;
    const previous = showUpdates;
    setUpdatesOverride({ key: requestKey, value: next });
    setUpdatesFeedback(null);
    setUpdatesPendingKey(requestKey);
    try {
      const result = await setShowLibraryUpdates(token, community.id, next);
      if (useAuthStore.getState().token === token) {
        setUpdatesOverride({ key: requestKey, value: result.showLibraryUpdates });
      }
    } catch (cause) {
      if (useAuthStore.getState().token === token) {
        setUpdatesOverride({ key: requestKey, value: previous });
        setUpdatesFeedback({
          key: requestKey,
          message: cause instanceof Error ? cause.message : 'Could not save this setting.',
          kind: 'error',
        });
      }
    } finally {
      setUpdatesPendingKey((key) => key === requestKey ? null : key);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.heading}>
        <Atom.ThemedText type="subtitle">Your community settings</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          These settings affect how you appear and what you share in {community.name}.
        </Atom.ThemedText>
      </View>

      <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
        <Atom.ThemedText type="smallBold">Nickname</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          This name appears to other members here without changing your name elsewhere.
        </Atom.ThemedText>
        {current?.error ? (
          <>
            <Atom.ErrorMessage>{current.error}</Atom.ErrorMessage>
            <Atom.Button
              label="Retry"
              variant="secondary"
              onPress={() => setAttempt((value) => value + 1)}
            />
          </>
        ) : profileFailed ? (
          <>
            <Atom.ErrorMessage>Could not check your account.</Atom.ErrorMessage>
            <Atom.Button label="Retry account check" variant="secondary" onPress={retryProfile} />
          </>
        ) : !current || !profile ? (
          <View style={styles.state}>
            <ActivityIndicator color={theme.accent} />
            <Atom.ThemedText type="small" themeColor="textSecondary">
              Loading your membership…
            </Atom.ThemedText>
          </View>
        ) : !current.member ? (
          <Atom.ErrorMessage>
            Your membership could not be found. You may have left this community.
          </Atom.ErrorMessage>
        ) : (
          <>
            <Atom.Input
              accessibilityLabel="Community nickname"
              autoCapitalize="words"
              maxLength={32}
              placeholder={current.member.name || current.member.username}
              editable={!readOnly}
              value={nickname}
              onChangeText={(value) => {
                setNicknameDrafts((drafts) => ({ ...drafts, [requestKey]: value }));
                setNicknameFeedback(null);
              }}
            />
            <Atom.ThemedText type="small" themeColor="textSecondary">
              Leave this empty to use {current.member.name || current.member.username}.
            </Atom.ThemedText>
            <Atom.Button
              label="Save nickname"
              loading={nicknamePending}
              disabled={readOnly || nickname.trim() === savedNickname}
              onPress={saveNickname}
            />
            {readOnly ? (
              <Atom.ThemedText type="small" themeColor="textSecondary">
                Confirm your email first to change your nickname.
              </Atom.ThemedText>
            ) : null}
            {nicknameError ? <Atom.ErrorMessage>{nicknameError}</Atom.ErrorMessage> : null}
            {nicknameMessage ? (
              <Atom.ThemedText type="small" themeColor="textSecondary">
                {nicknameMessage}
              </Atom.ThemedText>
            ) : null}
          </>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
        <Atom.ThemedText type="smallBold">Library updates</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Choose whether {community.name} sees what you watch, read, and play. Turning this off
          hides your updates from this community’s feed and its members’ home feeds, but not from
          your profile.
        </Atom.ThemedText>
        <View style={styles.switchRow}>
          <Atom.ThemedText type="small" style={styles.switchLabel}>
            Share my library updates here
          </Atom.ThemedText>
          <Switch
            accessibilityLabel={`Share library updates with ${community.name}`}
            accessibilityRole="switch"
            accessibilityState={{ checked: showUpdates, disabled: updatesPending || readOnly }}
            disabled={updatesPending || readOnly}
            value={showUpdates}
            trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
            thumbColor={theme.surface}
            onValueChange={(next) => void changeLibraryUpdates(next)}
          />
        </View>
        {readOnly ? (
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Confirm your email first to change this.
          </Atom.ThemedText>
        ) : null}
        {updatesPending ? (
          <Atom.ThemedText type="small" themeColor="textSecondary">Saving…</Atom.ThemedText>
        ) : null}
        {updatesError ? <Atom.ErrorMessage>{updatesError}</Atom.ErrorMessage> : null}
      </View>

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
  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  state: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  switchLabel: {
    flex: 1,
  },
});
