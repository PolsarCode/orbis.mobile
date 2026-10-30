import {
  Redirect,
  Stack,
  useGlobalSearchParams,
  usePathname,
  useSegments,
} from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { pathWithQuery, safeNext } from '@/lib/navigation';
import { useAuthStore } from '@/stores/auth-store';

export const unstable_settings = {
  anchor: '(tabs)',
};

const titles: Record<string, string> = {
  search: 'Search',
  notifications: 'Notifications',
  'notifications/[notificationId]': 'Notification',
  settings: 'Settings',
  directory: 'Directory',
  reports: 'Reports',
  'users/[username]': 'Profile',
  'communities/[communityId]': 'Community',
  'communities/[communityId]/settings': 'Community settings',
};

export default function ProtectedLayout() {
  const theme = useTheme();
  const signedIn = useAuthStore((state) => Boolean(state.token));
  const pathname = usePathname();
  const params = useGlobalSearchParams<Record<string, string | string[]>>();
  const segments = useSegments();
  const next = safeNext(pathWithQuery(pathname, params, segments));
  const isPublicProfile = pathname.startsWith('/users/');
  const isPublicCommunity = /^\/communities\/[^/]+$/.test(pathname);

  if (!signedIn && !isPublicProfile && !isPublicCommunity) {
    return <Redirect href={{ pathname: '/login', params: next ? { next } : undefined }} />;
  }

  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: route.name !== '(tabs)',
        title: titles[route.name] ?? '',
        headerBackTitle: 'Back',
        headerTintColor: theme.accent,
        headerStyle: { backgroundColor: theme.surface },
        headerTitleStyle: { color: theme.text },
      })}
    />
  );
}
