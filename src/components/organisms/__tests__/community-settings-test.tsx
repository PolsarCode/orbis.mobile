import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { CommunitySettings } from '../community-settings';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  deleteCommunity: jest.fn(),
  getCommunityMembers: jest.fn(),
  removeCommunityImage: jest.fn(),
  setCommunityAdmin: jest.fn(),
  updateCommunity: jest.fn(),
  uploadCommunityImage: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));

const deleteCommunity = api.deleteCommunity as jest.Mock;
const getCommunityMembers = api.getCommunityMembers as jest.Mock;
const removeCommunityImage = api.removeCommunityImage as jest.Mock;
const setCommunityAdmin = api.setCommunityAdmin as jest.Mock;
const updateCommunity = api.updateCommunity as jest.Mock;
const uploadCommunityImage = api.uploadCommunityImage as jest.Mock;
const launchImageLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;

const ownerCommunity: api.Community = {
  id: 5,
  name: 'Konoha',
  description: 'A village',
  iconUrl: null,
  coverUrl: null,
  backgroundUrl: null,
  ownerId: 1,
  isPublic: true,
  role: 'owner',
};

function member(overrides: Partial<api.CommunityMember> = {}): api.CommunityMember {
  return {
    userId: 7,
    username: 'sakura',
    name: 'Sakura',
    avatarUrl: null,
    coverUrl: null,
    isVerified: false,
    online: false,
    status: 'offline',
    nickname: null,
    joinedAt: '2026-10-01T00:00:00.000Z',
    isOwner: false,
    isAdmin: false,
    ...overrides,
  };
}

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

async function openSettings(
  community = ownerCommunity,
  onDeleted: () => void = jest.fn(),
) {
  await renderRouter({
    index: () => <CommunitySettings community={community} onDeleted={onDeleted} />,
  });
}

describe('community settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCommunityMembers.mockResolvedValue([member()]);
    updateCommunity.mockImplementation(async (_token: string, _id: number, changes: object) => ({
      ...ownerCommunity,
      ...changes,
    }));
    setCommunityAdmin.mockResolvedValue([member({ isAdmin: true })]);
    deleteCommunity.mockResolvedValue(undefined);
    uploadCommunityImage.mockResolvedValue({ ...ownerCommunity, iconUrl: 'https://example.com/icon.png' });
    useAuthStore.setState({
      token: 'token',
      profile: profile('2026-10-01T00:00:00.000Z'),
      sessionExpired: false,
    });
  });

  it('saves trimmed general settings and validates social links before saving', async () => {
    await openSettings();
    await fireEvent.changeText(screen.getByLabelText('Community name'), ' New name ');
    await fireEvent.changeText(screen.getByLabelText('Community description'), ' Updated ');
    await fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() => expect(updateCommunity).toHaveBeenCalledWith('token', 5, {
      name: 'New name',
      description: 'Updated',
      isPublic: true,
    }));

    await fireEvent.changeText(screen.getByLabelText('X link'), 'https://not-x.example');
    await fireEvent.press(screen.getByText('Save links'));
    expect(updateCommunity).toHaveBeenCalledTimes(1);

    await fireEvent.changeText(screen.getByLabelText('X link'), 'x.com/konoha');
    await fireEvent.press(screen.getByText('Save links'));
    await waitFor(() => expect(updateCommunity).toHaveBeenLastCalledWith('token', 5, {
      links: { x: 'https://x.com/konoha' },
    }));
  });

  it('requires owner confirmation before changing admins', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await openSettings();
    await fireEvent.press(await screen.findByText('Make admin'));

    expect(setCommunityAdmin).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] ?? [];
    const confirm = buttons.find((button) => button.text === 'Make admin')?.onPress;
    expect(confirm).toBeDefined();
    await act(async () => confirm?.());

    await waitFor(() => expect(setCommunityAdmin).toHaveBeenCalledWith('token', 5, 7, true));
    alert.mockRestore();
  });

  it('uploads selected community images and leaves canceled selections unchanged', async () => {
    launchImageLibrary
      .mockResolvedValueOnce({ canceled: true, assets: null })
      .mockResolvedValueOnce({
        canceled: false,
        assets: [{
          uri: 'file:///konoha.png',
          fileName: 'konoha.png',
          mimeType: 'image/png',
          fileSize: 1024,
        }],
      });
    await openSettings();

    await fireEvent.press(screen.getAllByText('Choose image')[0]);
    expect(uploadCommunityImage).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByText('Choose image')[0]);

    await waitFor(() => expect(uploadCommunityImage).toHaveBeenCalledWith(
      'token',
      5,
      'icon',
      'file:///konoha.png',
      'konoha.png',
      'image/png',
    ));
  });

  it('requires explicit owner confirmation before deleting a community', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onDeleted = jest.fn();
    await openSettings(ownerCommunity, onDeleted);
    await fireEvent.press(screen.getByText('Delete community'));

    expect(deleteCommunity).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] ?? [];
    const confirm = buttons.find((button) => button.text === 'Delete')?.onPress;
    expect(confirm).toBeDefined();
    await act(async () => confirm?.());

    await waitFor(() => {
      expect(deleteCommunity).toHaveBeenCalledWith('token', 5);
      expect(onDeleted).toHaveBeenCalled();
    });
    alert.mockRestore();
  });

  it('picks up the links the server returns after saving general settings', async () => {
    updateCommunity.mockImplementation(async (_token: string, _id: number, changes: object) => ({
      ...ownerCommunity,
      ...changes,
      links: { website: 'https://konoha.example' },
    }));
    await openSettings();

    await fireEvent.changeText(screen.getByLabelText('Community name'), 'Hidden Leaf');
    await fireEvent.press(screen.getByText('Save changes'));

    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(screen.getByLabelText('Website link').props.value).toBe('https://konoha.example');
    expect(screen.getByText('Save links')).toBeDisabled();
  });

  it('keeps unsaved link edits when general settings are saved', async () => {
    updateCommunity.mockImplementation(async (_token: string, _id: number, changes: object) => ({
      ...ownerCommunity,
      ...changes,
      links: {},
    }));
    await openSettings();

    await fireEvent.changeText(screen.getByLabelText('X link'), 'x.com/konoha');
    await fireEvent.changeText(screen.getByLabelText('Community name'), 'Hidden Leaf');
    await fireEvent.press(screen.getByText('Save changes'));

    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(screen.getByLabelText('X link').props.value).toBe('x.com/konoha');
    expect(screen.getByText('Save links')).toBeEnabled();
  });

  it('asks before removing a community image', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    removeCommunityImage.mockResolvedValue({ ...ownerCommunity, iconUrl: null });
    await openSettings({ ...ownerCommunity, iconUrl: 'https://example.com/icon.png' });

    await fireEvent.press(screen.getByLabelText('Remove community icon'));
    expect(removeCommunityImage).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][0]).toBe('Remove community icon?');
    const confirm = (alert.mock.calls[0][2] ?? []).find((button) => button.text === 'Remove')?.onPress;
    await act(async () => confirm?.());

    await waitFor(() => expect(removeCommunityImage).toHaveBeenCalledWith('token', 5, 'icon'));
    expect(await screen.findByText('Icon removed.')).toBeTruthy();
    expect(screen.queryByLabelText('Remove community icon')).toBeNull();
    alert.mockRestore();
  });

  it('shows a member-list error and loads the admins again on retry', async () => {
    getCommunityMembers
      .mockRejectedValueOnce(new Error('Could not load community members.'))
      .mockResolvedValueOnce([member()]);
    await openSettings();

    expect(await screen.findByText('Could not load community members.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));

    expect(await screen.findByText('Sakura')).toBeTruthy();
    expect(getCommunityMembers).toHaveBeenCalledTimes(2);
  });

  it('keeps every change disabled until the email is confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useAuthStore.setState({ profile: profile(null) });
    await openSettings({ ...ownerCommunity, iconUrl: 'https://example.com/icon.png' });
    expect(await screen.findByText('Sakura')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Community name'), 'Hidden Leaf');
    await fireEvent.changeText(screen.getByLabelText('X link'), 'x.com/konoha');
    expect(screen.getByText('Save changes')).toBeDisabled();
    expect(screen.getByText('Save links')).toBeDisabled();
    expect(screen.getAllByText('Confirm your email first to change this.')).toHaveLength(2);
    expect(screen.queryByText('Choose image')).toBeNull();
    expect(screen.queryByLabelText('Remove community icon')).toBeNull();
    expect(screen.getByText('Confirm your email first to change images.')).toBeTruthy();
    expect(screen.getByText('Make admin')).toBeDisabled();
    expect(screen.getByText('Confirm your email first to change admins.')).toBeTruthy();
    expect(screen.getByText('Delete community')).toBeDisabled();
    expect(screen.getByText('Confirm your email first to delete this community.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Make admin'));
    await fireEvent.press(screen.getByText('Delete community'));
    expect(alert).not.toHaveBeenCalled();
    expect(updateCommunity).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('does not expose role changes to admins who are not the owner', async () => {
    await openSettings({ ...ownerCommunity, role: 'admin' });

    expect(await screen.findByText('Sakura')).toBeTruthy();
    expect(screen.queryByText('Make admin')).toBeNull();
    expect(screen.queryByText('Delete community')).toBeNull();
  });
});
