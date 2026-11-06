import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useCurrentProfile } from '@/hooks/use-current-profile';
import { useTheme } from '@/hooks/use-theme';
import {
  acceptInvite,
  getCommunity,
  getInvitePreview,
  type InvitePreview as InvitePreviewData,
} from '@/lib/api';
import { useReadOnly } from '@/lib/read-only';
import { useAuthStore } from '@/stores/auth-store';

type LoadedPreview = {
  key: string;
  preview: InvitePreviewData | null;
  member: boolean;
  error: string | null;
};

export function InvitePreview({ code }: { code: string }) {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  useCurrentProfile();
  const readOnly = useReadOnly();
  const [loadedPreview, setLoadedPreview] = useState<LoadedPreview | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = `${token ?? ''}:${code}:${attempt}`;
  const current = loadedPreview?.key === key ? loadedPreview : null;

  useEffect(() => {
    let active = true;
    getInvitePreview(code)
      .then(async (result) => {
        const community = result && token
          ? await getCommunity(token, String(result.community.id)).catch(() => null)
          : null;
        if (active) {
          setLoadedPreview({ key, preview: result, member: Boolean(community?.role), error: null });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoadedPreview({
            key,
            preview: null,
            member: false,
            error: cause instanceof Error ? cause.message : 'Could not load the invite.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [code, key, token]);

  function openAuth(mode: 'login' | 'register') {
    const next = `/invite/${encodeURIComponent(code)}`;
    router.push({ pathname: mode === 'login' ? '/login' : '/register', params: { next } });
  }

  async function handleAccept() {
    if (!token || !current?.preview || accepting || readOnly) return;
    setAcceptError(null);
    setAccepting(true);
    try {
      const community = await acceptInvite(token, code);
      router.replace(`/communities/${community.id}` as Href);
    } catch (cause) {
      setAcceptError(cause instanceof Error ? cause.message : 'Could not join the community.');
    } finally {
      setAccepting(false);
    }
  }

  if (!current) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={theme.accent} />
        <Atom.ThemedText type="small" themeColor="textSecondary">Loading invite…</Atom.ThemedText>
      </View>
    );
  }

  if (current.error) {
    return (
      <View style={styles.state}>
        <Atom.ErrorMessage>{current.error}</Atom.ErrorMessage>
        <Atom.Button
          label="Try again"
          variant="secondary"
          onPress={() => setAttempt((value) => value + 1)}
        />
      </View>
    );
  }

  if (!current.preview) {
    return (
      <View style={styles.state}>
        <Atom.ThemedText type="subtitle">Invite invalid.</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          This invite may have expired, reached its limit, or been revoked. Ask whoever sent it for
          a new one.
        </Atom.ThemedText>
        <Atom.Button label="Go to Orbis" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const preview = current.preview;

  return (
    <View style={styles.page}>
      {preview.community.coverUrl ? (
        <Image source={{ uri: preview.community.coverUrl }} style={styles.cover} resizeMode="cover" />
      ) : null}
      <View style={styles.card}>
        {preview.community.iconUrl ? (
          <Image source={{ uri: preview.community.iconUrl }} style={styles.icon} />
        ) : null}
        <Atom.ThemedText type="smallBold" themeColor="textSecondary">COMMUNITY INVITE</Atom.ThemedText>
        <Atom.ThemedText type="subtitle">
          Join {preview.community.name}{preview.community.isVerified ? ' ✓' : ''}
        </Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          {preview.community.memberCount.toLocaleString()} members · Invited by{' '}
          {preview.creator.name || preview.creator.username}
        </Atom.ThemedText>
        {preview.expiresAt ? (
          <Atom.ThemedText type="small" themeColor="textSecondary">
            This invite expires {new Date(preview.expiresAt).toLocaleString()}.
          </Atom.ThemedText>
        ) : null}
        {token && current.member ? (
          <>
            <Atom.ThemedText type="small" themeColor="textSecondary">
              You’re already a member of {preview.community.name}.
            </Atom.ThemedText>
            <Atom.Button
              label="Open community"
              onPress={() => router.replace(`/communities/${preview.community.id}` as Href)}
            />
          </>
        ) : token ? (
          <>
            {readOnly ? (
              <View style={styles.actions}>
                <Atom.ThemedText type="smallBold">Confirm your email first to join.</Atom.ThemedText>
                <Atom.ThemedText type="small" themeColor="textSecondary">
                  Open the link we emailed you, then come back to this invite.
                </Atom.ThemedText>
              </View>
            ) : null}
            <Atom.Button
              label="Join community"
              loading={accepting}
              disabled={readOnly}
              onPress={handleAccept}
            />
          </>
        ) : (
          <View style={styles.actions}>
            <Atom.Button label="Log in to join" onPress={() => openAuth('login')} />
            <Atom.Button
              label="Create account"
              variant="secondary"
              onPress={() => openAuth('register')}
            />
          </View>
        )}
        {acceptError ? <Atom.ErrorMessage>{acceptError}</Atom.ErrorMessage> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    gap: Spacing.three,
  },
  cover: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  card: {
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  actions: {
    width: '100%',
    gap: Spacing.two,
  },
  state: {
    width: '100%',
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
});
