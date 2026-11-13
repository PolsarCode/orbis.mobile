import { router } from 'expo-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import OAuthSignupScreen from '@/app/auth/oauth-signup';

const mockStorage = new Map<string, string>();

jest.mock('@/lib/storage', () => ({
  secureStorage: {
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStorage.delete(key);
    },
  },
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const replace = router.replace as jest.Mock;

describe('OAuth username screen', () => {
  beforeEach(() => {
    mockStorage.clear();
    replace.mockReset();
    mockStorage.set(
      'oauth-signup-v1',
      JSON.stringify({ provider: 'discord', token: 'signup', username: 'newbie', avatarUrl: null }),
    );
  });

  it('shows the signup terms', async () => {
    await render(<OAuthSignupScreen />);

    expect(await screen.findByText('Terms')).toBeTruthy();
    expect(screen.getByText('Community guidelines')).toBeTruthy();
  });

  it('lets someone start over, forgetting the pending signup', async () => {
    await render(<OAuthSignupScreen />);

    fireEvent.press(await screen.findByText('Start over'));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/register'));
    expect(mockStorage.has('oauth-signup-v1')).toBe(false);
  });
});
