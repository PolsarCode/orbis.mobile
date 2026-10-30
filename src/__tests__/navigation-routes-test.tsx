import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '@/app/_layout';
import ProtectedLayout, { unstable_settings } from '@/app/(protected)/_layout';
import NotFoundScreen from '@/app/+not-found';
import { useAuthStore } from '@/stores/auth-store';

jest.mock('@/lib/storage', () => {
  const mockItems = new Map<string, string>();
  return {
    secureStorage: {
      getItem: async (key: string) => mockItems.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        mockItems.set(key, value);
      },
      removeItem: async (key: string) => {
        mockItems.delete(key);
      },
    },
  };
});

function stub(label: string) {
  return function Screen() {
    return <Text>{label}</Text>;
  };
}

const routes = {
  _layout: RootLayout,
  index: stub('Welcome'),
  login: stub('Log in'),
  register: stub('Sign up'),
  'auth/callback': stub('Callback'),
  '+not-found': NotFoundScreen,
  '(protected)/_layout': { default: ProtectedLayout, unstable_settings },
  '(protected)/(tabs)/index': stub('Home'),
  '(protected)/settings': stub('Settings'),
  '(protected)/communities/[communityId]': stub('Community'),
};

describe('app routes', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, profile: null, sessionExpired: false });
  });

  it('allows guests to open a public community deep link', async () => {
    await renderRouter(routes, { initialUrl: '/communities/5?post=5' });

    expect(await screen.findByText('Community')).toBeTruthy();
    expect(screen).toHavePathnameWithParams('/communities/5?post=5');
  });

  it('opens web-only links on the not-yet-in-the-app screen', async () => {
    await renderRouter(routes, { initialUrl: '/requests' });

    expect(await screen.findByText('Not in the app yet')).toBeTruthy();
    expect(screen.getByText('Back to Orbis')).toBeTruthy();
  });

  it('puts the tabs underneath a deep-linked screen so Back works', async () => {
    useAuthStore.setState({ token: 'token' });

    await renderRouter(routes, { initialUrl: '/settings' });

    expect(await screen.findByText('Settings')).toBeTruthy();
    expect(router.canGoBack()).toBe(true);
  });
});
