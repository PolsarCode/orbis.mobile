import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useCurrentProfile } from '@/hooks/use-current-profile';
import { useTheme } from '@/hooks/use-theme';
import {
  WEB_URL,
  createInvite,
  createPermanentInvite,
  downloadInviteCard,
  getInvites,
  revokeInvite,
  setInviteEnabled,
  type Invite,
} from '@/lib/api';
import { useReadOnly } from '@/lib/read-only';
import { useAuthStore } from '@/stores/auth-store';

const MAX_AGES = [
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
  { value: 43200, label: '12 hours' },
  { value: 86400, label: '1 day' },
  { value: 604800, label: '7 days' },
  { value: 0, label: 'Never' },
];
const MAX_USES = [
  { value: 0, label: 'No limit' },
  { value: 1, label: '1 use' },
  { value: 5, label: '5 uses' },
  { value: 10, label: '10 uses' },
  { value: 25, label: '25 uses' },
  { value: 50, label: '50 uses' },
  { value: 100, label: '100 uses' },
];

function inviteActive(invite: Invite, now: number) {
  return (
    !invite.disabledAt &&
    (!invite.expiresAt || new Date(invite.expiresAt).getTime() > now) &&
    (invite.maxUses === null || invite.uses < invite.maxUses)
  );
}

function inviteUrl(code: string) {
  return `${WEB_URL}/invite/${encodeURIComponent(code)}`;
}

function askForConfirmation(
  title: string,
  message: string,
  action: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

function fileName(value: string) {
  return `${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'community'}-invite-card.pdf`;
}

type LoadedInvites = {
  key: string;
  invites: Invite[] | null;
  error: string | null;
  now: number;
};

export function CommunityInvites({
  communityId,
  communityName,
}: {
  communityId: string;
  communityName: string;
}) {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  useCurrentProfile();
  const readOnly = useReadOnly();
  const id = Number(communityId);
  const [loaded, setLoaded] = useState<LoadedInvites | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [sharingCard, setSharingCard] = useState(false);
  const [maxAgeIndex, setMaxAgeIndex] = useState(4);
  const [maxUsesIndex, setMaxUsesIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const key = `${token ?? ''}:${id}:${attempt}`;
  const current = loaded?.key === key ? loaded : null;

  useEffect(() => {
    let active = true;
    if (!token || !Number.isInteger(id) || id <= 0) {
      Promise.resolve().then(() => {
        if (active) {
          setLoaded({ key, invites: null, error: 'Could not load invites.', now: Date.now() });
        }
      });
    } else {
      getInvites(token, id)
        .then((result) => {
          if (active) setLoaded({ key, invites: result, error: null, now: Date.now() });
        })
        .catch((cause: unknown) => {
          if (active) {
            setLoaded({
              key,
              invites: null,
              error: cause instanceof Error ? cause.message : 'Could not load invites.',
              now: Date.now(),
            });
          }
        });
    }
    return () => {
      active = false;
    };
  }, [id, key, token]);

  const invites = current?.invites ?? null;
  const permanentInvite = invites?.find((invite) => invite.permanent) ?? null;
  const activeInvites = invites?.filter(
    (invite) => !invite.permanent && inviteActive(invite, current?.now ?? 0),
  ) ?? [];

  async function handleCreateInvite() {
    if (!token || creating || readOnly) return;
    setError(null);
    setCreating(true);
    try {
      const invite = await createInvite(token, id, {
        maxAge: MAX_AGES[maxAgeIndex].value || null,
        maxUses: MAX_USES[maxUsesIndex].value || null,
      });
      setLoaded((previous) => previous?.key === key && previous.invites
        ? {
            ...previous,
            invites: [invite, ...previous.invites.filter((item) => item.code !== invite.code)],
          }
        : previous);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create an invite link.');
    } finally {
      setCreating(false);
    }
  }

  async function handleCreatePermanent() {
    if (!token || updating || readOnly) return;
    setError(null);
    setUpdating(true);
    try {
      const invite = await createPermanentInvite(token, id);
      setLoaded((previous) => previous?.key === key && previous.invites
        ? {
            ...previous,
            invites: [invite, ...previous.invites.filter((item) => item.code !== invite.code)],
          }
        : previous);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the permanent invite.');
    } finally {
      setUpdating(false);
    }
  }

  async function handleTogglePermanent() {
    if (!token || !permanentInvite || updating || readOnly) return;
    setError(null);
    setUpdating(true);
    try {
      const invite = await setInviteEnabled(token, id, permanentInvite.code, Boolean(permanentInvite.disabledAt));
      setLoaded((previous) => previous?.key === key && previous.invites
        ? {
            ...previous,
            invites: previous.invites.map((item) => item.code === invite.code ? invite : item),
          }
        : previous);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the permanent invite.');
    } finally {
      setUpdating(false);
    }
  }

  function confirmRevoke(invite: Invite) {
    if (!token || revoking || readOnly) return;
    askForConfirmation(
      `Revoke invite ${invite.code}?`,
      'Anyone who has this link won’t be able to use it to join.',
      'Revoke',
      () => void handleRevoke(invite),
    );
  }

  async function handleRevoke(invite: Invite) {
    if (!token) return;
    setError(null);
    setRevoking(invite.code);
    try {
      await revokeInvite(token, id, invite.code);
      setLoaded((previous) => previous?.key === key && previous.invites
        ? { ...previous, invites: previous.invites.filter((item) => item.code !== invite.code) }
        : previous);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke the invite.');
    } finally {
      setRevoking(null);
    }
  }

  async function shareLink(code: string) {
    setError(null);
    const link = inviteUrl(code);
    try {
      await Share.share(
        Platform.OS === 'android'
          ? { title: 'Community invite', message: link }
          : { title: 'Community invite', url: link },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not share the invite link.');
    }
  }

  async function handleCard() {
    if (!token || !permanentInvite || permanentInvite.disabledAt || sharingCard) return;
    setError(null);
    setSharingCard(true);
    try {
      const blob = await downloadInviteCard(token, id);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName(communityName);
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }

      const file = new File(Paths.cache, fileName(communityName));
      file.create({ overwrite: true });
      await file.write(new Uint8Array(await blob.arrayBuffer()));
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('File sharing is not available on this device.');
      }
      await Sharing.shareAsync(file.uri, {
        dialogTitle: 'Save or share invite card',
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download the invite card.');
    } finally {
      setSharingCard(false);
    }
  }

  if (!current) {
    return <Atom.ThemedText type="small" themeColor="textSecondary">Loading invites…</Atom.ThemedText>;
  }

  if (current.error || !invites) {
    return (
      <View style={styles.section}>
        <Atom.ErrorMessage>{current.error ?? 'Could not load invites.'}</Atom.ErrorMessage>
        <Atom.Button label="Try again" variant="secondary" onPress={() => setAttempt((value) => value + 1)} />
      </View>
    );
  }

  const permanentEnabled = Boolean(permanentInvite && !permanentInvite.disabledAt);

  return (
    <View style={styles.page}>
      <View style={styles.heading}>
        <Atom.ThemedText type="subtitle">{communityName} invites</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Create links for friends or manage the permanent invite card.
        </Atom.ThemedText>
      </View>

      <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
        <Atom.ThemedText type="smallBold">Create an invite link</Atom.ThemedText>
        <View style={styles.optionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Expiration: ${MAX_AGES[maxAgeIndex].label}. Tap to change.`}
            onPress={() => setMaxAgeIndex((index) => (index + 1) % MAX_AGES.length)}
            style={[styles.option, { backgroundColor: theme.backgroundElement }]}>
            <Atom.ThemedText type="small">Expires: {MAX_AGES[maxAgeIndex].label}</Atom.ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Maximum uses: ${MAX_USES[maxUsesIndex].label}. Tap to change.`}
            onPress={() => setMaxUsesIndex((index) => (index + 1) % MAX_USES.length)}
            style={[styles.option, { backgroundColor: theme.backgroundElement }]}>
            <Atom.ThemedText type="small">Uses: {MAX_USES[maxUsesIndex].label}</Atom.ThemedText>
          </Pressable>
        </View>
        <Atom.Button
          label="Generate invite link"
          loading={creating}
          disabled={readOnly}
          onPress={handleCreateInvite}
        />
        {readOnly ? (
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Confirm your email first to create or revoke invite links.
          </Atom.ThemedText>
        ) : null}
        {activeInvites.length ? (
          <View style={styles.list}>
            <Atom.ThemedText type="smallBold">Active invites · {activeInvites.length}</Atom.ThemedText>
            {activeInvites.map((invite) => (
              <View key={invite.code} style={[styles.inviteRow, { borderColor: theme.divider }]}>
                <View style={styles.inviteInfo}>
                  <Atom.ThemedText type="smallBold" numberOfLines={1}>{invite.code}</Atom.ThemedText>
                  <Atom.ThemedText type="small" themeColor="textSecondary">
                    {invite.expiresAt ? `Expires ${new Date(invite.expiresAt).toLocaleString()}` : 'Never expires'}
                    {' · '}{invite.uses}{invite.maxUses ? ` / ${invite.maxUses} uses` : ` ${invite.uses === 1 ? 'use' : 'uses'}`}
                  </Atom.ThemedText>
                </View>
                <View style={styles.rowActions}>
                  <Atom.Button label="Share" variant="secondary" onPress={() => shareLink(invite.code)} />
                  <Atom.Button
                    label="Revoke"
                    accessibilityLabel={`Revoke invite ${invite.code}`}
                    variant="secondary"
                    loading={revoking === invite.code}
                    disabled={readOnly || (revoking !== null && revoking !== invite.code)}
                    onPress={() => confirmRevoke(invite)}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Atom.ThemedText type="small" themeColor="textSecondary">No active invite links.</Atom.ThemedText>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
        <Atom.ThemedText type="smallBold">Permanent invite card</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          A printable card with a QR code that never expires. You can turn its invite off and back on.
        </Atom.ThemedText>
        {permanentInvite ? (
          <>
            <View style={styles.cardStatus}>
              <Atom.ThemedText type="small">
                {permanentEnabled ? 'On' : 'Off'} · {permanentInvite.uses} joined
              </Atom.ThemedText>
            </View>
            <View style={styles.rowActions}>
              <Atom.Button
                label={permanentEnabled ? 'Turn off' : 'Turn on'}
                variant="secondary"
                loading={updating}
                disabled={readOnly}
                onPress={handleTogglePermanent}
              />
              <Atom.Button
                label="Share link"
                variant="secondary"
                disabled={!permanentEnabled}
                onPress={() => shareLink(permanentInvite.code)}
              />
              <Atom.Button
                label="Download / share card"
                loading={sharingCard}
                disabled={!permanentEnabled}
                onPress={handleCard}
              />
            </View>
          </>
        ) : (
          <Atom.Button
            label="Create permanent invite"
            loading={updating}
            disabled={readOnly}
            onPress={handleCreatePermanent}
          />
        )}
        {readOnly ? (
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Confirm your email first to change the permanent invite.
          </Atom.ThemedText>
        ) : null}
      </View>

      {error ? <Atom.ErrorMessage>{error}</Atom.ErrorMessage> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    gap: Spacing.three,
  },
  heading: {
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  option: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
  },
  list: {
    gap: Spacing.two,
  },
  inviteRow: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inviteInfo: {
    gap: Spacing.one,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  cardStatus: {
    minHeight: 32,
    justifyContent: 'center',
  },
});
