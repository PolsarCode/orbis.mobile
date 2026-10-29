import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  disconnectOAuth,
  getOAuthConnections,
  resetOnboardingTours,
  setShowLive,
  type OAuthConnections,
  type OAuthProvider,
  type ProfilePreferences,
  type ThemeMode,
} from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';

import { OAuthButtons } from './oauth-buttons';

const providerLabels: Record<OAuthProvider, string> = {
  discord: 'Discord',
  twitch: 'Twitch',
};

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function SettingsPanel() {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const profile = useAuthStore((state) => state.profile);
  const fetchProfile = useAuthStore((state) => state.fetchProfile);
  const preferencesPending = useAuthStore((state) => state.preferencesPending);
  const updatePreferences = useAuthStore((state) => state.updatePreferences);
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const [accounts, setAccounts] = useState<OAuthConnections | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<{
    section: 'content' | 'privacy';
    message: string;
  } | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [tourPending, setTourPending] = useState(false);
  const [tourMessage, setTourMessage] = useState<string | null>(null);
  const [tourError, setTourError] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<string | null>(null);

  const loadConnections = useCallback(
    () => token ? getOAuthConnections(token) : Promise.resolve(null),
    [token],
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    loadConnections()
      .then((result) => {
        if (active && result) {
          setAccounts(result);
          setConnectionError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setConnectionError(
            cause instanceof Error ? cause.message : 'Could not load your connected accounts.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [loadConnections, token]);

  useEffect(() => {
    if (!token || profile) return;
    let active = true;
    fetchProfile()
      .then((result) => {
        if (active && !result) setProfileError('Your profile could not be loaded. Please log in again.');
      })
      .catch((cause: unknown) => {
        if (active) {
          setProfileError(cause instanceof Error ? cause.message : 'Could not load your profile.');
        }
      });
    return () => {
      active = false;
    };
  }, [fetchProfile, profile, token]);

  async function changePreference(
    preferences: ProfilePreferences,
    section: 'content' | 'privacy',
  ) {
    setPreferenceError(null);
    try {
      await updatePreferences(preferences);
    } catch (cause) {
      setPreferenceError({
        section,
        message: cause instanceof Error ? cause.message : 'Could not update this setting.',
      });
    }
  }

  async function restartTours() {
    if (!token || tourPending) return;
    setTourPending(true);
    setTourMessage(null);
    setTourError(null);
    try {
      await resetOnboardingTours(token);
      setTourMessage('Your web tours have been reset and will appear again as you visit those pages.');
    } catch (cause) {
      setTourError(cause instanceof Error ? cause.message : 'Could not restart the tours.');
    } finally {
      setTourPending(false);
    }
  }

  async function disconnect(provider: OAuthProvider) {
    if (
      !token ||
      pendingConnection ||
      (accounts && !accounts.hasPassword && accounts.connections.length === 1)
    ) return;
    setPendingConnection(provider);
    setConnectionError(null);
    try {
      await disconnectOAuth(token, provider);
      const result = await loadConnections();
      if (result) setAccounts(result);
    } catch (cause) {
      setConnectionError(
        cause instanceof Error ? cause.message : 'Could not disconnect this account.',
      );
    } finally {
      setPendingConnection(null);
    }
  }

  async function updateLive(provider: OAuthProvider, showLive: boolean) {
    if (!token || pendingConnection) return;
    setPendingConnection(`${provider}-live`);
    setConnectionError(null);
    try {
      await setShowLive(token, provider, showLive);
      setAccounts((current) => current && ({
        ...current,
        connections: current.connections.map((connection) =>
          connection.provider === provider ? { ...connection, showLive } : connection,
        ),
      }));
    } catch (cause) {
      setConnectionError(cause instanceof Error ? cause.message : 'Could not update this setting.');
    } finally {
      setPendingConnection(null);
    }
  }

  const connected = accounts?.connections.map((connection) => connection.provider) ?? [];

  return (
    <View style={styles.page}>
      <View style={styles.heading}>
        <Atom.ThemedText type="subtitle">Settings</Atom.ThemedText>
        <Atom.ThemedText themeColor="textSecondary">
          Manage your preferences, privacy, connected accounts, and account details.
        </Atom.ThemedText>
      </View>

      <View style={styles.section}>
        <Atom.ThemedText type="smallBold">General</Atom.ThemedText>
        <View style={styles.subsection}>
          <Atom.ThemedText type="smallBold">Appearance</Atom.ThemedText>
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Choose a theme for this device. System follows your device appearance.
          </Atom.ThemedText>
          <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={styles.themeOptions}>
            {themeOptions.map((option) => {
              const selected = mode === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setMode(option.value)}
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor: selected ? theme.accentSoft : theme.surface,
                      borderColor: selected ? theme.accent : theme.divider,
                    },
                  ]}>
                  <Atom.ThemedText type="smallBold" style={{ color: selected ? theme.accent : theme.text }}>
                    {option.label}
                  </Atom.ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.subsection}>
          <Atom.ThemedText type="smallBold">Content</Atom.ThemedText>
          <PreferenceRow
            label="Show NSFW content"
            description="Show 18+ anime, manga, and games in search, title pages, feeds, and libraries."
            value={profile?.showNsfw ?? false}
            disabled={!profile || preferencesPending}
            onValueChange={(value) => void changePreference({ showNsfw: value }, 'content')}
          />
          <PreferenceRow
            label="Show update notes"
            description="Show notes about new features and fixes on your web home feed."
            value={profile?.showChangelog ?? true}
            disabled={!profile || preferencesPending}
            onValueChange={(value) => void changePreference({ showChangelog: value }, 'content')}
          />
          {preferenceError?.section === 'content' ? (
            <Atom.ErrorMessage>{preferenceError.message}</Atom.ErrorMessage>
          ) : null}
        </View>

        <View style={styles.subsection}>
          <Atom.ThemedText type="smallBold">Guided tours</Atom.ThemedText>
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Restart your web tours so they play again when you visit those pages.
          </Atom.ThemedText>
          <Atom.Button
            label="Restart tours"
            variant="secondary"
            loading={tourPending}
            disabled={!token}
            onPress={() => void restartTours()}
          />
          {tourMessage ? <Atom.ThemedText type="small" themeColor="textSecondary">{tourMessage}</Atom.ThemedText> : null}
          {tourError ? <Atom.ErrorMessage>{tourError}</Atom.ErrorMessage> : null}
        </View>
      </View>

      <View style={styles.section}>
        <Atom.ThemedText type="smallBold">Privacy</Atom.ThemedText>
        <Atom.ThemedText type="smallBold">Visibility</Atom.ThemedText>
        <PreferenceRow
          label="Appear offline"
          description="Friends see you as offline. You can still post as usual."
          value={profile?.appearOffline ?? false}
          disabled={!profile || preferencesPending}
          onValueChange={(value) => void changePreference({ appearOffline: value }, 'privacy')}
        />
        <PreferenceRow
          label="Private profile"
          description="Only your friends can see your posts, friends, communities, and library. Everyone else sees just your name and picture."
          value={profile ? !profile.isPublic : false}
          disabled={!profile || preferencesPending}
          onValueChange={(value) => void changePreference({ isPublic: !value }, 'privacy')}
        />
        {preferenceError?.section === 'privacy' ? (
          <Atom.ErrorMessage>{preferenceError.message}</Atom.ErrorMessage>
        ) : null}
      </View>

      <View style={styles.section}>
        <Atom.ThemedText type="smallBold">Connections</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Use Discord or Twitch to log in. If their verified email matches your Orbis email, they connect automatically.
        </Atom.ThemedText>
        <Atom.ThemedText type="smallBold">Connected accounts</Atom.ThemedText>
        {accounts ? (
          accounts.connections.length ? (
            accounts.connections.map((connection) => (
              <View
                key={connection.provider}
                style={[styles.connection, { borderBottomColor: theme.divider }]}>
                <View style={styles.connectionInfo}>
                  <Atom.ThemedText type="smallBold">
                    {providerLabels[connection.provider]} · {connection.username}
                  </Atom.ThemedText>
                  {connection.provider === 'twitch' ? (
                    <View style={styles.preference}>
                      <Atom.ThemedText type="small" themeColor="textSecondary">
                        Show live status
                      </Atom.ThemedText>
                      <Switch
                        accessibilityLabel="Show Twitch live status"
                        value={connection.showLive}
                        disabled={pendingConnection !== null}
                        onValueChange={(value) => void updateLive(connection.provider, value)}
                      />
                    </View>
                  ) : null}
                </View>
                <Atom.Button
                  label="Disconnect"
                  variant="secondary"
                  loading={pendingConnection === connection.provider}
                  disabled={
                    pendingConnection !== null ||
                    (!accounts.hasPassword && accounts.connections.length === 1)
                  }
                  onPress={() => void disconnect(connection.provider)}
                />
              </View>
            ))
          ) : (
            <Atom.ThemedText type="small" themeColor="textSecondary">
              No provider accounts are connected.
            </Atom.ThemedText>
          )
        ) : (
          <ActivityIndicator color={theme.accent} />
        )}
        {connectionError ? <Atom.ErrorMessage>{connectionError}</Atom.ErrorMessage> : null}
        {!accounts && connectionError ? (
          <Atom.Button
            label="Try again"
            variant="secondary"
            disabled={!token}
            onPress={() => {
              setConnectionError(null);
              void loadConnections()
                .then((result) => {
                  if (result) setAccounts(result);
                })
                .catch((cause: unknown) => {
                  setConnectionError(
                    cause instanceof Error
                      ? cause.message
                      : 'Could not load your connected accounts.',
                  );
                });
            }}
          />
        ) : null}
        {accounts ? (
          <OAuthButtons
            token={token}
            destination="/settings"
            connected={connected}
          />
        ) : null}
        {accounts && !accounts.hasPassword && accounts.connections.length === 1 ? (
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Add a password or another sign-in method before disconnecting this account.
          </Atom.ThemedText>
        ) : null}
      </View>

      <View style={styles.section}>
        <Atom.ThemedText type="smallBold">Account</Atom.ThemedText>
        <Atom.ThemedText type="smallBold">Email</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Only you can see this.
        </Atom.ThemedText>
        {profile ? (
          <Atom.ThemedText>{profile.email}</Atom.ThemedText>
        ) : profileError ? (
          <>
            <Atom.ErrorMessage>{profileError}</Atom.ErrorMessage>
            <Atom.Button
              label="Try again"
              variant="secondary"
              onPress={() => {
                setProfileError(null);
                void fetchProfile().catch((cause: unknown) => {
                  setProfileError(cause instanceof Error ? cause.message : 'Could not load your profile.');
                });
              }}
            />
          </>
        ) : (
          <ActivityIndicator color={theme.accent} />
        )}
      </View>
    </View>
  );
}

function PreferenceRow({
  label,
  description,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceText}>
        <Atom.ThemedText type="smallBold">{label}</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">{description}</Atom.ThemedText>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    gap: Spacing.four,
  },
  heading: {
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.three,
  },
  subsection: {
    gap: Spacing.two,
  },
  themeOptions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  themeOption: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  preferenceText: {
    flex: 1,
    gap: Spacing.one,
  },
  connection: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  connectionInfo: {
    gap: Spacing.one,
  },
  preference: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
