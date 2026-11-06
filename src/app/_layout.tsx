import {
  DarkTheme,
  DefaultTheme,
  SplashScreen,
  Stack,
  ThemeProvider,
} from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Appearance, useColorScheme, View, type AppStateStatus } from 'react-native';

import { useAuthHydrated, useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';
import { useMessagesStore } from '@/stores/messages-store';
import { useThemeHydrated, useThemeStore } from '@/stores/theme-store';

SplashScreen.preventAutoHideAsync();
const IDLE_AFTER_MS = 5 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 15_000;

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hydrated = useAuthHydrated();
  const themeHydrated = useThemeHydrated();
  const themeMode = useThemeStore((state) => state.mode);
  const token = useAuthStore((state) => state.token);
  const signedIn = Boolean(token);
  const connectFriends = useFriendsStore((state) => state.connect);
  const disconnectFriends = useFriendsStore((state) => state.disconnect);
  const setIdle = useFriendsStore((state) => state.setIdle);
  const activityHandler = useRef<() => void>(() => {});
  const connectMessages = useMessagesStore((state) => state.connect);
  const disconnectMessages = useMessagesStore((state) => state.disconnect);

  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? 'auto' : themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (hydrated && themeHydrated) SplashScreen.hide();
  }, [hydrated, themeHydrated]);

  useEffect(() => {
    if (!hydrated || !token) {
      activityHandler.current = () => {};
      disconnectFriends();
      return;
    }

    let idle = false;
    let lastActive = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function updateIdle(nextIdle: boolean) {
      if (idle === nextIdle) return;
      idle = nextIdle;
      setIdle(nextIdle);
    }

    function recordActivity() {
      const now = Date.now();
      if (!idle && now - lastActive < ACTIVITY_THROTTLE_MS) return;
      lastActive = now;
      updateIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => updateIdle(true), IDLE_AFTER_MS);
    }

    function onAppStateChange(state: string) {
      if (state === 'active') {
        connectFriends();
        recordActivity();
      } else {
        disconnectFriends();
      }
    }

    activityHandler.current = recordActivity;
    if (AppState.currentState === 'active') {
      connectFriends();
      recordActivity();
    }
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => {
      activityHandler.current = () => {};
      clearTimeout(timer);
      subscription.remove();
      disconnectFriends();
    };
  }, [connectFriends, disconnectFriends, hydrated, setIdle, token]);

  useEffect(() => {
    if (!hydrated || !token) {
      disconnectMessages();
      return;
    }

    function onAppStateChange(state: AppStateStatus) {
      if (state === 'active') connectMessages();
      else disconnectMessages();
    }

    if (AppState.currentState === 'active') connectMessages();
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => {
      subscription.remove();
      disconnectMessages();
    };
  }, [connectMessages, disconnectMessages, hydrated, token]);

  if (!hydrated || !themeHydrated) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }} onTouchStart={() => activityHandler.current()}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="invite/[code]" />
          <Stack.Screen name="qr/[code]" />
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="login" />
            <Stack.Screen name="register" />
          </Stack.Protected>
          <Stack.Screen name="(protected)" />
        </Stack>
      </View>
    </ThemeProvider>
  );
}
