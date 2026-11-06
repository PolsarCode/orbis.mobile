import {
  api,
  acceptMessageRequest,
  addFriend,
  createComment,
  createCommunity,
  createMediaPost,
  createWallPost,
  declineMessageRequest,
  deleteCommunity,
  editMessage,
  getChatHistory,
  getConversations,
  getCommunity,
  getCommunityMembers,
  getCommunityPosts,
  getDirectoryUsers,
  getComments,
  getFeed,
  getFriends,
  getLinkPreview,
  getMediaPosts,
  getMediaProfile,
  getMembers,
  getProfile,
  getRailLayout,
  getUserPosts,
  joinCommunity,
  login,
  markMessagesRead,
  openDirectChat,
  reactToMessage,
  removeCommunityImage,
  removeFriend,
  searchChatPeople,
  searchCommunities,
  searchPeople,
  sendMessage,
  setCommunityAdmin,
  setLike,
  setNickname,
  setProfileVerified,
  setShowLibraryUpdates,
  setUnauthorizedHandler,
  updateCommunity,
  updateRailLayout,
  uploadCommunityImage,
} from '../api';

function respond(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('api requests', () => {
  const fetchMock = jest.fn();
  const onUnauthorized = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    onUnauthorized.mockReset();
    globalThis.fetch = fetchMock;
    setUnauthorizedHandler(onUnauthorized);
  });

  afterAll(() => setUnauthorizedHandler(null));

  it('reports an expired session for the token that was rejected', async () => {
    fetchMock.mockReturnValue(respond(401, { message: 'Unauthorized' }));

    await expect(getProfile('old-token')).resolves.toBeNull();
    expect(onUnauthorized).toHaveBeenCalledWith('old-token');
  });

  it('does not treat a failed login as an expired session', async () => {
    fetchMock.mockReturnValue(respond(401, { message: 'Unauthorized' }));

    await expect(login({ identifier: 'naruto', password: 'wrong' })).rejects.toThrow(
      'Invalid username, email, or password.',
    );
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('keeps the session when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(getProfile('token')).rejects.toThrow("Can't reach Orbis right now. Please try again.");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('shows the server’s wait time when rate limited', async () => {
    fetchMock.mockReturnValue(
      respond(429, { message: 'You’re doing that too often. Try again in 45 minutes' }),
    );

    await expect(api('/friends', { method: 'POST' })).rejects.toThrow(
      'You’re doing that too often. Try again in 45 minutes.',
    );
  });

  it('passes the server’s reason through when a post is refused', async () => {
    fetchMock.mockReturnValue(
      respond(403, {
        code: 'account_too_new',
        message: 'New accounts can post links after their first day. Try again in about 5 hours',
      }),
    );

    await expect(createWallPost('token', 'naruto', 'Free episodes https://spam.test')).rejects.toThrow(
      'New accounts can post links after their first day. Try again in about 5 hours.',
    );
  });

  it('asks the server to leave out hidden kinds of posts, like web', async () => {
    fetchMock.mockReturnValue(respond(200, { items: [], nextCursor: null }));

    await getUserPosts(null, 'naruto', 'next-page', ['post', 'activity']);

    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/users\/naruto\/posts\?cursor=next-page&exclude=post%2Cactivity$/,
    );
  });

  it('uses the feed cursor and content exclusions supported by web', async () => {
    fetchMock.mockReturnValue(respond(200, { items: [], nextCursor: null }));

    await getFeed('token', 'next page', ['activity']);

    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/feed\?cursor=next\+page&exclude=activity$/,
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('treats a hidden community as no access but reports outages', async () => {
    fetchMock.mockReturnValueOnce(respond(404, { message: 'Not Found' }));
    await expect(getCommunity('token', '5')).resolves.toBeNull();

    fetchMock.mockReturnValueOnce(respond(500, { message: 'Internal server error' }));
    await expect(getCommunity('token', '5')).rejects.toThrow();
  });

  it('uses the existing Explore search and join endpoints', async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, []))
      .mockReturnValueOnce(respond(200, { id: 5, name: 'Konoha', iconUrl: null }));

    await searchCommunities('token', 'leaf village');
    await joinCommunity('token', 5);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/communities/search?q=leaf+village');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/communities/5/join');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  });

  it('uses the web friendship search, list, add, and remove contracts', async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, []))
      .mockReturnValueOnce(respond(200, { friends: [], incoming: [], outgoing: [] }))
      .mockReturnValueOnce(respond(200, {}))
      .mockReturnValueOnce(respond(200, {}));

    await searchPeople('token', 'sakura & naruto');
    await getFriends('token');
    await addFriend('token', { userId: 7 });
    await removeFriend('token', 7);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/friends/search?q=sakura+%26+naruto');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/friends');
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ userId: 7 });
    expect(String(fetchMock.mock.calls[3][0])).toContain('/friends/7');
    expect(fetchMock.mock.calls[3][1].method).toBe('DELETE');
  });

  it('explains invalid targets and preserves duplicate-request errors', async () => {
    fetchMock
      .mockReturnValueOnce(respond(404, {}))
      .mockReturnValueOnce(respond(409, { message: 'A request already exists' }));

    await expect(addFriend('token', { username: 'missing' })).rejects.toThrow(
      'No one with that username is on Orbis.',
    );
    await expect(addFriend('token', { userId: 7 })).rejects.toThrow('A request already exists.');
  });

  it('treats a removed friendship or request as already resolved', async () => {
    fetchMock.mockReturnValue(respond(404, {}));

    await expect(removeFriend('token', 7)).resolves.toBeUndefined();
  });

  it('loads and saves the server community layout contract', async () => {
    const layout = [
      { type: 'community', communityId: 5 },
      { type: 'folder', id: 8, name: 'Friends', color: '#5b8def', communityIds: [6, 7] },
    ];
    fetchMock
      .mockReturnValueOnce(respond(200, layout))
      .mockReturnValueOnce(respond(200, layout));

    await expect(getRailLayout('token')).resolves.toEqual(layout);
    await updateRailLayout('token', [
      { type: 'community', communityId: 5 },
      { type: 'folder', id: -10, name: 'Friends', color: null, communityIds: [6, 7] },
    ]);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/communities/layout');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      items: [
        { communityId: 5 },
        { folder: { name: 'Friends', communityIds: [6, 7] } },
      ],
    });
  });

  it('uses server member and personal community-setting endpoints', async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, [{ userId: 7, nickname: null }]))
      .mockReturnValueOnce(respond(200, { nickname: 'Leaf' }))
      .mockReturnValueOnce(respond(200, { showLibraryUpdates: false }));

    await getMembers('token', 5);
    await setNickname('token', 5, 'Leaf');
    await setShowLibraryUpdates('token', 5, false);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/communities/5/members');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/communities/5/nickname');
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ nickname: 'Leaf' });
    expect(String(fetchMock.mock.calls[2][0])).toContain('/communities/5/library-updates');
    expect(fetchMock.mock.calls[2][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ show: false });
  });

  it('reports member-list access failures instead of showing an empty list', async () => {
    fetchMock.mockReturnValue(respond(403, { message: 'Not a member' }));

    await expect(getMembers('token', 5)).rejects.toThrow('Not a member.');
  });

  it('uses existing admin directory and verification endpoints', async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, { items: [], total: 0, page: 1, pageSize: 20 }))
      .mockReturnValueOnce(respond(200, { isVerified: true }));

    await getDirectoryUsers('token', 2);
    await expect(setProfileVerified('token', 'sakura', true)).resolves.toBe(true);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/admin/users?page=2');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/users/sakura/verified');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
  });

  it('creates communities with the shared name and visibility contract', async () => {
    fetchMock.mockReturnValue(respond(201, { id: 8, name: 'Konoha', isPublic: false }));

    await createCommunity('token', '  Konoha  ', false);

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/communities$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Konoha',
      isPublic: false,
    });
  });

  it('updates community fields and applies the owner-only admin endpoints', async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, { name: 'New name', isPublic: true }))
      .mockReturnValueOnce(respond(200, [{ userId: 7, isAdmin: true }]))
      .mockReturnValueOnce(respond(200, [{ userId: 7, isAdmin: false }]));

    await updateCommunity('token', 5, {
      name: 'New name',
      description: 'A description',
      isPublic: true,
      links: { website: 'https://example.com' },
    });
    await setCommunityAdmin('token', 5, 7, true);
    await setCommunityAdmin('token', 5, 7, false);

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/communities\/5$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'New name',
      description: 'A description',
      isPublic: true,
      links: { website: 'https://example.com' },
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/communities/5/admins/7');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
  });

  it('loads community members and reports denied access', async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, [{ userId: 7, username: 'sakura' }]))
      .mockReturnValueOnce(respond(403, { message: 'Forbidden' }));

    await expect(getCommunityMembers('token', 5)).resolves.toMatchObject([
      { userId: 7, username: 'sakura' },
    ]);
    await expect(getCommunityMembers('token', 5)).rejects.toThrow();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/communities/5/members');
  });

  it('uploads and deletes community images using shared image endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(new Blob(['image']), { status: 200 }))
      .mockReturnValueOnce(respond(200, { coverUrl: 'https://example.com/cover.jpg' }))
      .mockReturnValueOnce(respond(200, { coverUrl: null }))
      .mockReturnValueOnce(new Response(null, { status: 204 }));

    await uploadCommunityImage('token', 5, 'cover', 'file:///cover.jpg', 'cover.jpg', 'image/jpeg');
    await removeCommunityImage('token', 5, 'cover');
    await deleteCommunity('token', 5);

    expect(String(fetchMock.mock.calls[1][0])).toContain('/communities/5/cover');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(fetchMock.mock.calls[1][1].body).toBeInstanceOf(FormData);
    expect(String(fetchMock.mock.calls[2][0])).toContain('/communities/5/cover');
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
    expect(String(fetchMock.mock.calls[3][0])).toContain('/communities/5');
    expect(fetchMock.mock.calls[3][1].method).toBe('DELETE');
  });

  it('loads community activity using the shared feed cursor contract', async () => {
    fetchMock.mockReturnValue(respond(200, { items: [], nextCursor: null }));

    await getCommunityPosts('token', 5, 'next-page');

    expect(String(fetchMock.mock.calls[0][0])).toContain('/communities/5/posts?cursor=next-page');
  });

  it('uses the guest-compatible community read endpoints without leaking an account token', async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, { id: 5, name: 'Konoha' }))
      .mockReturnValueOnce(respond(200, { items: [], nextCursor: null }));

    await getCommunity(null, '5');
    await getCommunityPosts(null, 5);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });

  it('uses the web messaging routes and cursor contract', async () => {
    const conversation = { id: 8, status: 'accepted' };
    const message = { id: 12, text: 'Hello' };
    fetchMock
      .mockReturnValueOnce(respond(200, [{ userId: 7, username: 'sakura' }]))
      .mockReturnValueOnce(respond(200, [conversation]))
      .mockReturnValueOnce(respond(200, conversation))
      .mockReturnValueOnce(respond(200, { messages: [message], members: [], hasMore: true }))
      .mockReturnValueOnce(respond(200, message))
      .mockReturnValueOnce(respond(200, message))
      .mockReturnValueOnce(respond(200, message))
      .mockReturnValueOnce(respond(200, {}));

    await searchChatPeople('token', 'sakura');
    await getConversations('token');
    await openDirectChat('token', 7);
    await getChatHistory('token', 8, 12);
    await sendMessage('token', 8, 'Hello', 11);
    await editMessage('token', 8, 12, 'Updated');
    await reactToMessage('token', 8, 12, '❤️');
    await markMessagesRead('token', 8);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/friends/search?q=sakura');
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/messages$/);
    expect(fetchMock.mock.calls[1][1].method).toBe('GET');
    expect(String(fetchMock.mock.calls[2][0])).toContain('/messages/direct/7');
    expect(String(fetchMock.mock.calls[3][0])).toContain('/messages/8?before=12');
    expect(JSON.parse(fetchMock.mock.calls[4][1].body)).toEqual({ text: 'Hello', replyToId: 11 });
    expect(fetchMock.mock.calls[5][1].method).toBe('PATCH');
    expect(String(fetchMock.mock.calls[6][0])).toContain('/messages/8/messages/12/reaction');
    expect(String(fetchMock.mock.calls[7][0])).toContain('/messages/8/read');
  });

  it('accepts and declines message requests and reports failed message operations', async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, {}))
      .mockReturnValueOnce(respond(200, {}))
      .mockReturnValueOnce(respond(403, { message: 'You cannot send messages to this person.' }));

    await acceptMessageRequest('token', 8);
    await declineMessageRequest('token', 8);
    await expect(sendMessage('token', 8, 'Hello')).rejects.toThrow(
      'You cannot send messages to this person.',
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain('/messages/8/accept');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/messages/8');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });

  it('uses friend-scoped people search for mention identities', async () => {
    fetchMock.mockReturnValue(respond(200, [{
      userId: 8,
      username: 'sakura',
      name: 'Sakura',
      avatarUrl: null,
    }]));

    await expect(searchPeople('token', 'sa')).resolves.toMatchObject([{ userId: 8, username: 'sakura' }]);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/friends/search?q=sa');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('loads public comments without leaking a session token', async () => {
    fetchMock.mockReturnValue(respond(200, []));

    await expect(getComments(null, { type: 'post', id: 12 })).resolves.toEqual([]);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/comments?type=post&id=12');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('sends reply identity and rich content through the comment contract', async () => {
    fetchMock.mockReturnValue(respond(201, { id: 21, parentId: 7 }));

    await createComment(
      'token',
      { type: 'activity', id: 10 },
      '<p>Hello <strong>there</strong></p>',
      7,
      'https://example.com',
    );

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/comments$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      type: 'activity',
      id: 10,
      content: '<p>Hello <strong>there</strong></p>',
      parentId: 7,
      linkUrl: 'https://example.com',
    });
  });

  it('supports comment likes using the shared likes endpoint', async () => {
    fetchMock.mockReturnValue(respond(200, { liked: true, likeCount: 1 }));

    await setLike('token', 'comment', 21, true);

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/likes$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      type: 'comment',
      id: 21,
      liked: true,
    });
  });

  it('loads link previews and treats missing metadata as unavailable', async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, { url: 'https://example.com/', title: 'Example' }))
      .mockReturnValueOnce(respond(404, {}));

    await expect(getLinkPreview('token', 'https://example.com/')).resolves.toMatchObject({
      title: 'Example',
    });
    await expect(getLinkPreview(null, 'https://missing.example/')).resolves.toBeNull();

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/links/preview?url=https%3A%2F%2Fexample.com%2F',
    );
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });

  it('loads a media profile and paginated title discussions', async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, { type: 'anime', sourceId: 'show/1', title: 'Example' }))
      .mockReturnValueOnce(respond(200, { items: [], nextCursor: null }));

    await getMediaProfile(null, 'anime', 'show/1');
    await getMediaPosts('token', 'anime', 'show/1', 'next page');

    expect(String(fetchMock.mock.calls[0][0])).toContain('/library/media/anime/show%2F1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/library/media/anime/show%2F1/posts?cursor=next+page',
    );
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeDefined();
  });

  it('creates title discussion posts through the media posts endpoint', async () => {
    fetchMock.mockReturnValue(respond(201, { id: 8, type: 'post' }));

    await createMediaPost('token', 'manga', 'series-1', '<p>Thoughts</p>', 'https://example.com');

    expect(String(fetchMock.mock.calls[0][0])).toContain('/library/media/manga/series-1/posts');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      content: '<p>Thoughts</p>',
      linkUrl: 'https://example.com',
    });
  });

  it('treats unavailable media profiles as missing and explains adult-only access', async () => {
    fetchMock
      .mockReturnValueOnce(respond(404, {}))
      .mockReturnValueOnce(respond(403, {}));

    await expect(getMediaProfile(null, 'game', 'missing')).resolves.toBeNull();
    await expect(getMediaProfile(null, 'game', 'adult')).rejects.toThrow('This title is 18+');
  });
});
