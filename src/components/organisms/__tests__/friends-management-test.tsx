import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { FriendsManagement } from '../friends-management';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getFriends: jest.fn(),
  searchPeople: jest.fn(),
  addFriend: jest.fn(),
  removeFriend: jest.fn(),
}));

const getFriends = api.getFriends as jest.Mock;
const searchPeople = api.searchPeople as jest.Mock;
const addFriend = api.addFriend as jest.Mock;
const removeFriend = api.removeFriend as jest.Mock;

const sakura: api.FriendUser = { userId: 7, username: 'sakura', name: 'Sakura', avatarUrl: null };
const hinata: api.FriendUser = { userId: 9, username: 'hinata', name: 'Hinata', avatarUrl: null };
const empty: api.FriendList = { friends: [], incoming: [], outgoing: [] };

function signIn(emailVerifiedAt: string | null = '2026-10-01T00:00:00.000Z') {
  useAuthStore.setState({
    token: 'token',
    sessionExpired: false,
    profile: {
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
    },
  });
}

async function openFriends() {
  await renderRouter({ index: () => <FriendsManagement /> });
}

async function openRequests() {
  await openFriends();
  await fireEvent.press(await screen.findByRole('tab', { name: /^Requests/ }));
}

describe('friends management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ token: null, profile: null, sessionExpired: false });
    getFriends.mockResolvedValue(empty);
    searchPeople.mockResolvedValue([]);
    addFriend.mockResolvedValue(undefined);
    removeFriend.mockResolvedValue(undefined);
    signIn();
  });

  it('shows loading until the list arrives, then the empty state', async () => {
    let finish: (list: api.FriendList) => void = () => undefined;
    getFriends.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

    await openFriends();

    expect(screen.getByRole('button', { busy: true })).toBeTruthy();
    expect(screen.queryByText(/No friends yet/)).toBeNull();

    finish(empty);

    expect(await screen.findByText(
      'No friends yet. Search for people by username to send a request.',
    )).toBeTruthy();
  });

  it('shows the load error and retries', async () => {
    getFriends
      .mockRejectedValueOnce(new Error('Could not load your friends.'))
      .mockResolvedValueOnce({ ...empty, friends: [{ ...sakura, online: true, status: 'online' }] });

    await openFriends();

    expect(await screen.findByText('Could not load your friends.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Sakura')).toBeTruthy();
    expect(screen.queryByText('Could not load your friends.')).toBeNull();
  });

  it('accepts and rejects received requests', async () => {
    getFriends.mockResolvedValue({ ...empty, incoming: [sakura, hinata] });

    await openRequests();
    expect(await screen.findByText('Sakura')).toBeTruthy();

    await fireEvent.press(screen.getAllByRole('button', { name: 'Accept' })[0]);
    await waitFor(() => expect(addFriend).toHaveBeenCalledWith('token', { userId: 7 }));

    await fireEvent.press(screen.getAllByRole('button', { name: 'Reject' })[1]);
    await waitFor(() => expect(removeFriend).toHaveBeenCalledWith('token', 9));
  });

  it('cancels a sent request', async () => {
    getFriends.mockResolvedValue({ ...empty, outgoing: [hinata] });

    await openRequests();
    await fireEvent.press(await screen.findByRole('button', { name: /^Sent/ }));
    expect(await screen.findByText('Hinata')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(removeFriend).toHaveBeenCalledWith('token', 9));
  });

  it('searches people and sends a friend request', async () => {
    searchPeople.mockResolvedValue([sakura]);

    await openFriends();
    await fireEvent.changeText(screen.getByLabelText('Search people by username'), 's');
    expect(screen.getByText('Enter at least 2 characters to search.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Search people by username'), 'sak');
    expect(await screen.findByText('Sakura')).toBeTruthy();
    expect(searchPeople).toHaveBeenCalledWith('token', 'sak');

    await fireEvent.press(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(addFriend).toHaveBeenCalledWith('token', { userId: 7 }));
  });

  it('says when a search finds no one', async () => {
    await openFriends();
    await fireEvent.changeText(screen.getByLabelText('Search people by username'), 'nobody');

    expect(await screen.findByText('No people found. Check the username and try again.')).toBeTruthy();
  });

  it('shows the server’s refusal when a block stops the request', async () => {
    const actual = jest.requireActual<typeof api>('@/lib/api');
    const fetchMock = jest.fn(async () => new Response(
      JSON.stringify({ message: 'You can’t send this person a friend request' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    ));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    addFriend.mockImplementation(actual.addFriend);
    searchPeople.mockResolvedValue([sakura]);

    try {
      await openFriends();
      await fireEvent.changeText(screen.getByLabelText('Search people by username'), 'sakura');
      await fireEvent.press(await screen.findByRole('button', { name: 'Send request' }));

      expect(await screen.findByText('You can’t send this person a friend request.')).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps friend actions disabled until the email is confirmed', async () => {
    signIn(null);
    getFriends.mockResolvedValue({ ...empty, incoming: [sakura], outgoing: [hinata] });
    searchPeople.mockResolvedValue([{ ...hinata }]);

    await openFriends();
    await fireEvent.changeText(screen.getByLabelText('Search people by username'), 'hinata');
    expect(await screen.findByText('Confirm your email first to cancel friend requests.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel request', disabled: true })).toBeTruthy();

    await fireEvent.press(screen.getByRole('tab', { name: /^Requests/ }));
    expect(await screen.findByText('Confirm your email first to answer friend requests.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Accept', disabled: true }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reject', disabled: true }));

    expect(addFriend).not.toHaveBeenCalled();
    expect(removeFriend).not.toHaveBeenCalled();
  });
});
