import { Link, router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import * as Atom from '@atom';
import * as Molecule from '@molecule';
import * as Template from '@template';

import { Spacing } from '@/constants/theme';
import { finishOAuthSignup } from '@/lib/api';
import {
  clearPendingOAuthSignup,
  getPendingOAuthSignup,
} from '@/lib/oauth';
import { useAuthStore } from '@/stores/auth-store';

export default function OAuthSignupScreen() {
  const loginWithToken = useAuthStore((state) => state.loginWithToken);
  const [signup, setSignup] = useState<Awaited<ReturnType<typeof getPendingOAuthSignup>>>(null);
  const [username, setUsername] = useState('');
  const [useProviderAvatar, setUseProviderAvatar] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    getPendingOAuthSignup()
      .then((details) => {
        setSignup(details);
        if (details) setUsername(details.username);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not load your sign-up.');
      })
      .finally(() => setLoading(false));
  }, []);

  async function submit() {
    if (!signup || pending) return;
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      setError('Usernames must be 3–20 characters: letters, numbers, or underscores.');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const result = await finishOAuthSignup(signup.token, username, useProviderAvatar);
      await clearPendingOAuthSignup();
      loginWithToken(result.access_token);
      router.replace('/(protected)/(tabs)' as Href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not finish creating your account.');
    } finally {
      setPending(false);
    }
  }

  async function startOver() {
    if (pending) return;
    try {
      await clearPendingOAuthSignup();
    } finally {
      router.replace('/register' as Href);
    }
  }

  return (
    <Template.ScreenTemplate>
      <View style={styles.page}>
        <Atom.ThemedText type="subtitle">Make Orbis yours.</Atom.ThemedText>
        <Atom.ThemedText themeColor="textSecondary">
          Choose a username to finish creating your account.
        </Atom.ThemedText>
        {loading ? (
          <Atom.ThemedText themeColor="textSecondary">Loading sign-up…</Atom.ThemedText>
        ) : signup ? (
          <>
            <Atom.Input
              accessibilityLabel="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoComplete="username-new"
              autoCorrect={false}
              maxLength={20}
              placeholder="Your username"
            />
            {signup.avatarUrl ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: useProviderAvatar }}
                onPress={() => setUseProviderAvatar((selected) => !selected)}
                style={styles.avatarChoice}>
                <Image source={{ uri: signup.avatarUrl }} style={styles.avatar} />
                <View style={styles.avatarText}>
                  <Atom.ThemedText type="smallBold">
                    {useProviderAvatar ? 'Using' : 'Not using'} your {signup.provider} avatar
                  </Atom.ThemedText>
                  <Atom.ThemedText type="small" themeColor="textSecondary">
                    Tap to {useProviderAvatar ? 'use your Orbis default avatar' : 'use this avatar'}.
                  </Atom.ThemedText>
                </View>
              </Pressable>
            ) : null}
            {error && <Atom.ErrorMessage>{error}</Atom.ErrorMessage>}
            <Atom.Button
              label="Create account"
              loading={pending}
              disabled={!username.trim()}
              onPress={submit}
            />
            <Atom.ThemedText type="small" themeColor="textSecondary">
              Not you?{' '}
              <Atom.ThemedText
                type="smallBold"
                accessibilityRole="link"
                onPress={startOver}
                themeColor="accent">
                Start over
              </Atom.ThemedText>
            </Atom.ThemedText>
            <Molecule.SignupTerms />
          </>
        ) : (
          <>
            <Atom.ErrorMessage>
              {error ?? 'This sign-up has expired. Please start again.'}
            </Atom.ErrorMessage>
            <Link href="/login">Back to log in</Link>
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
  avatarChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarText: {
    flex: 1,
    gap: Spacing.one,
  },
});
