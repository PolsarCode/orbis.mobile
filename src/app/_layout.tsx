import {
  DarkTheme,
  DefaultTheme,
  SplashScreen,
  Stack,
  ThemeProvider,
} from 'expo-router';
import { useEffect } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { useAuthHydrated, useAuthStore } from '@/stores/auth-store';
import { useThemeHydrated, useThemeStore } from '@/stores/theme-store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hydrated = useAuthHydrated();
  const themeHydrated = useThemeHydrated();
  const themeMode = useThemeStore((state) => state.mode);
  const signedIn = useAuthStore((state) => Boolean(state.token));

  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? 'auto' : themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (hydrated && themeHydrated) SplashScreen.hide();
  }, [hydrated, themeHydrated]);

  if (!hydrated || !themeHydrated) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
        </Stack.Protected>
        <Stack.Screen name="(protected)" />
      </Stack>
    </ThemeProvider>
  );
}
