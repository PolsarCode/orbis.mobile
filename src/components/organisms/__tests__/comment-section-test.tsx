import { fireEvent } from '@testing-library/react-native';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { CommentSection } from '../comment-section';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getComments: jest.fn(),
  createComment: jest.fn(),
  setLike: jest.fn(),
}));

const getComments = api.getComments as jest.Mock;
const createComment = api.createComment as jest.Mock;
const setLike = api.setLike as jest.Mock;

const profile: api.Profile = {
  userId: 7,
  username: 'sakura',
  email: 'sakura@example.test',
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
  emailVerifiedAt: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
};

function comment(overrides: Partial<api.Comment> = {}): api.Comment {
  return {
    id: 1,
    parentId: null,
    content: '<p>First thoughts</p>',
    linkUrl: null,
    likeCount: 0,
    liked: false,
    hidden: null,
    deleted: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    author: { id: 8, username: 'naruto', name: 'Naruto', avatarUrl: null },
    ...overrides,
  };
}

async function renderSection(onCommentsChange = jest.fn(), canComment = true) {
  await renderRouter({
    index: () => (
      <CommentSection
        target={{ type: 'post', id: 3 }}
        canComment={canComment}
        onCommentsChange={onCommentsChange}
      />
    ),
  });
  return onCommentsChange;
}

describe('comment section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getComments.mockResolvedValue([]);
    useAuthStore.setState({ token: 'token', sessionExpired: false, profile });
  });

  it('does not expose comment/reply composition without community membership', async () => {
    await renderSection(jest.fn(), false);

    expect(screen.getByText('Join this community to comment.')).toBeTruthy();
    expect(screen.queryByLabelText('Write a comment…')).toBeNull();
  });

  it('shows a retry action when comments cannot be loaded', async () => {
    getComments
      .mockRejectedValueOnce(new Error('Could not load comments.'))
      .mockResolvedValueOnce([]);

    await renderSection();

    expect(await screen.findByText('Could not load comments.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('No comments yet.')).toBeTruthy();
  });

  it('posts a comment and updates the count', async () => {
    createComment.mockResolvedValue(comment({ id: 5, content: '<p>Nice one</p>' }));
    const onCommentsChange = await renderSection();
    expect(await screen.findByText('No comments yet.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Write a comment…'), 'Nice one');
    await fireEvent.press(screen.getByText('Comment'));

    expect(await screen.findByText('Nice one')).toBeTruthy();
    expect(screen.getByText('1 comment')).toBeTruthy();
    expect(createComment).toHaveBeenCalledWith(
      'token',
      { type: 'post', id: 3 },
      '<p>Nice one</p>',
      undefined,
      undefined,
    );
    expect(onCommentsChange).toHaveBeenLastCalledWith(1);
  });

  it('replies to a comment with its id as the parent', async () => {
    getComments.mockResolvedValue([comment()]);
    createComment.mockResolvedValue(comment({ id: 6, parentId: 1, content: '<p>Agreed</p>' }));
    const onCommentsChange = await renderSection();

    await fireEvent.press(await screen.findByText('Reply'));
    expect(screen.getByText('Replying to @naruto')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Write a reply…'), 'Agreed');
    await fireEvent.press(screen.getByText('Reply'));

    expect(await screen.findByText('Agreed')).toBeTruthy();
    expect(screen.queryByLabelText('Write a reply…')).toBeNull();
    expect(screen.queryByText('Replying to @naruto')).toBeNull();
    expect(createComment).toHaveBeenCalledWith(
      'token',
      { type: 'post', id: 3 },
      '<p>Agreed</p>',
      1,
      undefined,
    );
    expect(screen.getByText('2 comments')).toBeTruthy();
    expect(onCommentsChange).toHaveBeenLastCalledWith(2);
  });

  it('keeps the reply open with its text when the reply is refused', async () => {
    getComments.mockResolvedValue([comment()]);
    createComment.mockRejectedValue(new Error('Invalid parent comment.'));
    await renderSection();

    await fireEvent.press(await screen.findByText('Reply'));
    await fireEvent.changeText(screen.getByLabelText('Write a reply…'), 'Agreed');
    await fireEvent.press(screen.getByText('Reply'));

    expect(await screen.findByText('Invalid parent comment.')).toBeTruthy();
    expect(screen.getByDisplayValue('Agreed')).toBeTruthy();
    expect(screen.getByText('Replying to @naruto')).toBeTruthy();
  });

  it('keeps the text and shows the error when a comment is refused', async () => {
    createComment.mockRejectedValue(new Error('Comment cannot be empty.'));
    await renderSection();

    await fireEvent.changeText(screen.getByLabelText('Write a comment…'), 'Draft');
    await fireEvent.press(screen.getByText('Comment'));

    expect(await screen.findByText('Comment cannot be empty.')).toBeTruthy();
    expect(screen.getByDisplayValue('Draft')).toBeTruthy();
    expect(screen.getByText('No comments yet.')).toBeTruthy();
  });

  it('limits comments to the server’s 10,000 characters', async () => {
    await renderSection();

    expect(screen.getByLabelText('Write a comment…').props.maxLength).toBe(10_000);
    expect(screen.getByText('0/10,000')).toBeTruthy();
  });

  it('likes a comment and shows the saved count', async () => {
    getComments.mockResolvedValue([comment()]);
    setLike.mockResolvedValue({ liked: true, likeCount: 1 });
    await renderSection();

    await fireEvent.press(await screen.findByLabelText('Like comment'));

    expect(await screen.findByLabelText('Unlike comment')).toBeTruthy();
    expect(screen.getByText('♥ 1')).toBeTruthy();
    expect(setLike).toHaveBeenCalledWith('token', 'comment', 1, true);
  });

  it('labels deleted and hidden comments and keeps replies under a deleted comment', async () => {
    getComments.mockResolvedValue([
      comment({
        id: 1,
        deleted: true,
        content: '',
        author: { id: 10, username: 'sasuke', name: 'Sasuke', avatarUrl: null },
      }),
      comment({ id: 2, parentId: 1, content: '<p>Still here</p>' }),
      comment({ id: 3, hidden: 'review', content: '' }),
      comment({ id: 4, hidden: 'reported', content: '' }),
    ]);
    await renderSection();

    expect(await screen.findByText('Comment deleted')).toBeTruthy();
    expect(screen.queryByText('Sasuke')).toBeNull();
    expect(screen.queryByText(/@sasuke/)).toBeNull();
    expect(screen.queryByLabelText('View Sasuke’s profile')).toBeNull();
    expect(screen.getByText('Still here')).toBeTruthy();
    expect(screen.getByText('This comment is hidden while admins review it.')).toBeTruthy();
    expect(screen.getByText('You reported this comment.')).toBeTruthy();
    expect(screen.getByText('3 comments')).toBeTruthy();
    expect(screen.getAllByLabelText('Like comment')).toHaveLength(3);
  });

  it('keeps an unconfirmed account read-only', async () => {
    useAuthStore.setState({ profile: { ...profile, emailVerifiedAt: null } });
    getComments.mockResolvedValue([comment()]);
    await renderSection();

    expect(await screen.findByText('First thoughts')).toBeTruthy();
    expect(screen.queryByLabelText('Write a comment…')).toBeNull();
    expect(screen.getByText(
      'Confirm your email to post, comment, and react. Until then, you can read everything.',
    )).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Like comment'));
    expect(screen.getByText('Confirm your email first to like this.')).toBeTruthy();
    expect(setLike).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Reply'));
    expect(screen.queryByLabelText('Write a reply…')).toBeNull();
    await waitFor(() => expect(createComment).not.toHaveBeenCalled());
  });
});
