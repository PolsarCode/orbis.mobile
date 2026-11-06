import { router, Stack, type Href } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { CommunitySwitcher } from '../community-switcher';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getCommunities: jest.fn(),
  getRailLayout: jest.fn(),
  updateRailLayout: jest.fn(),
}));

const getCommunities = api.getCommunities as jest.Mock;
const getRailLayout = api.getRailLayout as jest.Mock;
const updateRailLayout = api.updateRailLayout as jest.Mock;

function profile(emailVerifiedAt: string | null): api.Profile {
  return {
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
    emailVerifiedAt,
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}

const communities: api.Community[] = [
  { id: 8, name: 'Konoha', iconUrl: null, role: 'member' },
  { id: 9, name: 'Suna', iconUrl: null, role: 'member' },
  { id: 10, name: 'Kiri', iconUrl: null, role: 'member' },
];

async function openSwitcher() {
  await renderRouter({
    _layout: () => <Stack />,
    index: () => <CommunitySwitcher />,
    elsewhere: () => <Text>Elsewhere</Text>,
  });
  expect(await screen.findByText('Konoha')).toBeTruthy();
}

describe('community switcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      token: 'token',
      profile: profile('2026-10-01T00:00:00.000Z'),
      sessionExpired: false,
    });
    getCommunities.mockResolvedValue(communities);
    getRailLayout.mockResolvedValue([
      { type: 'community', communityId: 8 },
      { type: 'community', communityId: 9 },
      { type: 'folder', id: 4, name: 'Mist', color: null, communityIds: [10] },
    ]);
    updateRailLayout.mockImplementation(async (_token, layout) => layout);
  });

  it('restores the previous order and shows the error when saving fails', async () => {
    updateRailLayout.mockRejectedValue(new Error('Confirm your email to do this.'));
    getRailLayout.mockResolvedValue([
      { type: 'community', communityId: 8 },
      { type: 'community', communityId: 9 },
    ]);
    getCommunities.mockResolvedValue(communities.slice(0, 2));
    await openSwitcher();

    await fireEvent.press(screen.getByLabelText('Move Konoha down'));

    expect(await screen.findByText('Confirm your email to do this.')).toBeTruthy();
    expect(updateRailLayout).toHaveBeenCalledWith('token', [
      { type: 'community', communityId: 9 },
      { type: 'community', communityId: 8 },
    ]);
    expect(screen.getAllByLabelText(/^Open /).map((row) => row.props.accessibilityLabel)).toEqual([
      'Open Konoha',
      'Open Suna',
    ]);
  });

  it('lets unconfirmed accounts open communities but not change the layout', async () => {
    useAuthStore.setState({ profile: profile(null) });
    getRailLayout.mockResolvedValue([
      { type: 'community', communityId: 8 },
      { type: 'folder', id: 4, name: 'Sand', color: null, communityIds: [9, 10] },
    ]);
    await openSwitcher();

    expect(screen.getByText('Confirm your email first to organize your communities.')).toBeTruthy();
    expect(screen.getByLabelText('Move Konoha down')).toBeDisabled();
    expect(screen.getByLabelText('Select Konoha for a folder')).toBeDisabled();
    expect(screen.getByLabelText('Move Sand up')).toBeDisabled();
    expect(screen.getByLabelText('Blue folder color')).toBeDisabled();
    expect(screen.getByLabelText('Name for Sand').props.editable).toBe(false);
    expect(screen.getByText('Save folder')).toBeDisabled();
    expect(screen.getByText('Ungroup')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Move Konoha down'));
    await fireEvent.press(screen.getByText('Save folder'));
    expect(updateRailLayout).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Open Konoha')).toBeEnabled();
  });

  it('keeps the list on screen when navigating instead of reloading it each time', async () => {
    await openSwitcher();
    expect(getCommunities).toHaveBeenCalledTimes(1);

    await act(() => router.push('/elsewhere' as Href));
    expect(await screen.findByText('Elsewhere')).toBeTruthy();
    expect(getCommunities).toHaveBeenCalledTimes(1);

    await act(() => router.back());
    expect(screen.queryByText('Loading your communities…')).toBeNull();
    expect(screen.getByText('Konoha')).toBeTruthy();
    await waitFor(() => expect(getCommunities).toHaveBeenCalledTimes(2));
  });

  it('does not let a refocus that started before a save undo it', async () => {
    getCommunities.mockResolvedValue(communities.slice(0, 2));
    const before: api.RailItem[] = [
      { type: 'community', communityId: 8 },
      { type: 'community', communityId: 9 },
    ];
    getRailLayout.mockResolvedValue(before);
    await openSwitcher();
    let finishReload: (layout: api.RailItem[]) => void = () => undefined;
    getRailLayout.mockReturnValueOnce(new Promise((resolve) => {
      finishReload = resolve;
    }));

    await act(() => router.push('/elsewhere' as Href));
    await act(() => router.back());
    await waitFor(() => expect(getRailLayout).toHaveBeenCalledTimes(2));
    await fireEvent.press(screen.getByLabelText('Move Konoha down'));
    await waitFor(() => expect(updateRailLayout).toHaveBeenCalled());
    await act(async () => finishReload(before));

    expect(screen.getAllByLabelText(/^Open /).map((row) => row.props.accessibilityLabel)).toEqual([
      'Open Suna',
      'Open Konoha',
    ]);
  });

  it('keeps the selection and order when a refocus finishes while a save is in flight', async () => {
    getCommunities.mockResolvedValue(communities.slice(0, 2));
    getRailLayout.mockResolvedValue([
      { type: 'community', communityId: 8 },
      { type: 'community', communityId: 9 },
    ]);
    let finishSave: (layout: api.RailItem[]) => void = () => undefined;
    updateRailLayout.mockReturnValueOnce(new Promise((resolve) => {
      finishSave = resolve;
    }));
    await openSwitcher();

    await fireEvent.press(screen.getByLabelText('Move Konoha down'));
    await fireEvent.press(screen.getByLabelText('Select Suna for a folder'));
    await act(() => router.push('/elsewhere' as Href));
    await act(() => router.back());
    await waitFor(() => expect(getRailLayout).toHaveBeenCalledTimes(2));

    expect(screen.getByLabelText('Deselect Suna for a folder')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Open /).map((row) => row.props.accessibilityLabel)).toEqual([
      'Open Suna',
      'Open Konoha',
    ]);

    await act(async () => finishSave([
      { type: 'community', communityId: 9 },
      { type: 'community', communityId: 8 },
    ]));
    expect(screen.queryByText('Saving your layout…')).toBeNull();
    expect(screen.getByLabelText('Deselect Suna for a folder')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Open /).map((row) => row.props.accessibilityLabel)).toEqual([
      'Open Suna',
      'Open Konoha',
    ]);
  });

  it('shows the saved folder name and color once a save succeeds', async () => {
    getRailLayout.mockResolvedValue([
      { type: 'community', communityId: 8 },
      { type: 'folder', id: 4, name: 'Sand', color: null, communityIds: [9, 10] },
    ]);
    updateRailLayout.mockImplementation(async (_token, layout: api.RailItem[]) =>
      layout.map((item) =>
        item.type === 'folder' ? { ...item, name: 'Hidden Sand', color: '#e5534b' } : item,
      ),
    );
    await openSwitcher();

    await fireEvent.changeText(screen.getByLabelText('Name for Sand'), 'Sand village');
    await fireEvent.press(screen.getByLabelText('Blue folder color'));
    await fireEvent.press(screen.getByText('Save folder'));

    await waitFor(() => {
      expect(updateRailLayout).toHaveBeenCalledWith('token', [
        { type: 'community', communityId: 8 },
        { type: 'folder', id: 4, name: 'Sand village', color: '#5b8def', communityIds: [9, 10] },
      ]);
    });
    expect(await screen.findByDisplayValue('Hidden Sand')).toBeTruthy();
    expect(screen.getByLabelText('Red folder color')).toBeSelected();
  });

  it('drops a new folder’s temporary id once the server saves it', async () => {
    getRailLayout.mockResolvedValue([
      { type: 'community', communityId: 8 },
      { type: 'community', communityId: 9 },
    ]);
    getCommunities.mockResolvedValue(communities.slice(0, 2));
    updateRailLayout.mockImplementation(async (_token, layout: api.RailItem[]) =>
      layout.map((item) => item.type === 'folder' ? { ...item, id: 31 } : item),
    );
    await openSwitcher();

    await fireEvent.press(screen.getByLabelText('Select Konoha for a folder'));
    await fireEvent.press(screen.getByLabelText('Select Suna for a folder'));
    await fireEvent.changeText(screen.getByLabelText('New folder name'), 'Allies');
    await fireEvent.press(screen.getByText('Create folder'));

    expect(await screen.findByDisplayValue('Allies')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name for Allies'), 'Friends');
    await fireEvent.press(screen.getByText('Save folder'));

    await waitFor(() => {
      expect(updateRailLayout).toHaveBeenLastCalledWith('token', [
        { type: 'folder', id: 31, name: 'Friends', color: null, communityIds: [8, 9] },
      ]);
    });
  });
});
