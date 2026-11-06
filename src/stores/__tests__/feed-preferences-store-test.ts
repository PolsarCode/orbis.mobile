import { useFeedPreferencesStore } from '../feed-preferences-store';

const mockItems = new Map<string, string>();

jest.mock('@/lib/storage', () => ({
  secureStorage: {
    getItem: async (key: string) => mockItems.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockItems.set(key, value);
    },
    removeItem: async (key: string) => {
      mockItems.delete(key);
    },
  },
}));

function saved(state: unknown) {
  mockItems.set('feed-preferences', JSON.stringify({ state, version: 0 }));
}

describe('feed preferences store', () => {
  beforeEach(() => {
    mockItems.clear();
    useFeedPreferencesStore.setState({ view: 'card', excludedTypes: [] });
  });

  it('restores valid saved preferences', async () => {
    saved({ view: 'compact', excludedTypes: ['activity'] });

    await useFeedPreferencesStore.persist.rehydrate();

    expect(useFeedPreferencesStore.getState()).toEqual(expect.objectContaining({
      view: 'compact',
      excludedTypes: ['activity'],
    }));
  });

  it('drops saved values it does not recognise', async () => {
    saved({ view: 'grid', excludedTypes: ['activity', 'repost', 42, 'activity'] });

    await useFeedPreferencesStore.persist.rehydrate();

    expect(useFeedPreferencesStore.getState()).toEqual(expect.objectContaining({
      view: 'card',
      excludedTypes: ['activity'],
    }));
  });

  it('falls back to defaults when the saved filters are not a list', async () => {
    useFeedPreferencesStore.setState({ view: 'compact', excludedTypes: ['post'] });
    saved({ view: null, excludedTypes: 'post' });

    await useFeedPreferencesStore.persist.rehydrate();

    expect(useFeedPreferencesStore.getState()).toEqual(expect.objectContaining({
      view: 'compact',
      excludedTypes: [],
    }));
  });

  it('toggles types without ever hiding everything', () => {
    const { toggleType } = useFeedPreferencesStore.getState();

    toggleType('activity');
    expect(useFeedPreferencesStore.getState().excludedTypes).toEqual(['activity']);

    toggleType('post');
    expect(useFeedPreferencesStore.getState().excludedTypes).toEqual(['activity']);

    toggleType('activity');
    expect(useFeedPreferencesStore.getState().excludedTypes).toEqual([]);
  });

  it('saves the view and filters', async () => {
    useFeedPreferencesStore.getState().setView('compact');
    useFeedPreferencesStore.getState().toggleType('post');

    await Promise.resolve();
    expect(JSON.parse(mockItems.get('feed-preferences') ?? '{}').state).toEqual({
      view: 'compact',
      excludedTypes: ['post'],
    });
  });

  it('shows every type again', () => {
    useFeedPreferencesStore.setState({ excludedTypes: ['post'] });

    useFeedPreferencesStore.getState().showAll();

    expect(useFeedPreferencesStore.getState().excludedTypes).toEqual([]);
  });
});
