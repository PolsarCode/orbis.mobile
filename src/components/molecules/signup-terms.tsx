import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as Atom from '@atom';

import { useTheme } from '@/hooks/use-theme';
import { WEB_URL } from '@/lib/api';

const pages = [
  { path: 'terms', label: 'Terms' },
  { path: 'guidelines', label: 'Community guidelines' },
] as const;

export function SignupTerms() {
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);

  async function open(path: (typeof pages)[number]['path']) {
    setError(null);
    try {
      await Linking.openURL(`${WEB_URL}/${path}`);
    } catch {
      setError('Could not open this page. Please try again.');
    }
  }

  const link = ({ path, label }: (typeof pages)[number]) => (
    <Pressable
      accessibilityRole="link"
      onPress={() => open(path)}
      style={({ pressed }) => pressed && styles.pressed}>
      <Atom.ThemedText type="small" style={{ color: theme.accent, textDecorationLine: 'underline' }}>
        {label}
      </Atom.ThemedText>
    </Pressable>
  );

  return (
    <>
      <View style={styles.legal}>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          By signing up, you agree to our{' '}
        </Atom.ThemedText>
        {link(pages[0])}
        <Atom.ThemedText type="small" themeColor="textSecondary"> and </Atom.ThemedText>
        {link(pages[1])}
        <Atom.ThemedText type="small" themeColor="textSecondary">.</Atom.ThemedText>
      </View>
      {error && <Atom.ErrorMessage>{error}</Atom.ErrorMessage>}
    </>
  );
}

const styles = StyleSheet.create({
  legal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
