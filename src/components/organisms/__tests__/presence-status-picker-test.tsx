import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { PresenceStatusPicker } from '../presence-status-picker';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  updatePreferences: jest.fn(),
}));

const updatePreferences = api.updatePreferences as jest.Mock;

const profile: api.Profile = {
  userId: 1,
  username: 'naruto',
  email: 'naruto@anime.test',
  avatarUrl: null,
  coverUrl: null,
  backgroundUrl: null,
  theme: 'dark',
  appearOffline: false,
  status: 'online',
  isPublic: true,
  showNsfw: false,
  showChangelog: true,
  isAdmin: false,
  isHeadAdmin: false,
  emailVerifiedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('presence status picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      token: 'token',
      sessionExpired: false,
      preferencesPending: false,
      profile,
    });
  });

  it('saves a manual status even before the email is confirmed', async () => {
    updatePreferences.mockImplementation(async (_token: string, changes: Partial<api.Profile>) => ({
      ...profile,
      ...changes,
    }));

    await render(<PresenceStatusPicker />);
    expect(screen.getByRole('radio', { name: 'Online', checked: true })).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: 'Busy' }));

    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith('token', { status: 'busy', appearOffline: false }),
    );
    expect(await screen.findByRole('radio', { name: 'Busy', checked: true })).toBeTruthy();
  });

  it('shows why a status change failed and keeps the previous one', async () => {
    updatePreferences.mockRejectedValue(new Error('Could not save your preferences.'));

    await render(<PresenceStatusPicker />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Idle' }));

    expect(await screen.findByText('Could not save your preferences.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Online', checked: true })).toBeTruthy();
  });
});
