import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useCurrentProfile } from '@/hooks/use-current-profile';
import { useTheme } from '@/hooks/use-theme';
import { createCommunity } from '@/lib/api';
import { useReadOnly } from '@/lib/read-only';
import { useAuthStore } from '@/stores/auth-store';

export function CommunityCreate() {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  useCurrentProfile();
  const readOnly = useReadOnly();
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token || pending || readOnly) return;
    if (!name.trim()) {
      setError('Enter a community name.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const community = await createCommunity(token, name.trim(), isPublic);
      router.replace(`/communities/${community.id}` as Href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the community.');
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.page}>
      <Atom.ThemedText type="subtitle">Create a community</Atom.ThemedText>
      <Atom.ThemedText type="small" themeColor="textSecondary">
        Give your community a name. You can change its name and visibility later in settings.
      </Atom.ThemedText>
      <View style={styles.field}>
        <Atom.ThemedText type="smallBold">Community name</Atom.ThemedText>
        <Atom.Input
          accessibilityLabel="Community name"
          autoCapitalize="sentences"
          autoComplete="off"
          maxLength={100}
          placeholder="Community name"
          returnKeyType="done"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(null);
          }}
          onSubmitEditing={() => void submit()}
        />
        <Atom.ThemedText type="small" themeColor="textSecondary">{name.length}/100</Atom.ThemedText>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Public community"
        accessibilityState={{ checked: isPublic }}
        onPress={() => setIsPublic((value) => !value)}
        style={styles.switchRow}>
        <View style={styles.field}>
          <Atom.ThemedText type="smallBold">Public community</Atom.ThemedText>
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Anyone can find it in Explore and join.
          </Atom.ThemedText>
        </View>
        <View style={[styles.switch, { backgroundColor: isPublic ? theme.accent : theme.rail }]}>
          <View style={[styles.knob, isPublic && styles.knobOn]} />
        </View>
      </Pressable>
      {error ? <Atom.ErrorMessage>{error}</Atom.ErrorMessage> : null}
      <Atom.Button
        label="Create community"
        loading={pending}
        disabled={!token || readOnly}
        onPress={() => void submit()}
      />
      {readOnly ? (
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Confirm your email first to create a community.
        </Atom.ThemedText>
      ) : null}
      <Atom.Button
        label="Cancel"
        variant="secondary"
        disabled={pending}
        onPress={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    gap: Spacing.three,
  },
  field: {
    flex: 1,
    gap: Spacing.one,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  switch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },
  knobOn: {
    alignSelf: 'flex-end',
  },
});
