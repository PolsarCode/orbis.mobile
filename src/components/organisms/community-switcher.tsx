import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getCommunities,
  getRailLayout,
  updateRailLayout,
  type Community,
  type RailFolder,
  type RailItem,
} from '@/lib/api';
import {
  COMMUNITY_FOLDER_COLORS,
  createCommunityFolder,
  moveFolderCommunity,
  moveLayoutItem,
  normalizeCommunityLayout,
  ungroupCommunityFolder,
  updateCommunityFolder,
} from '@/lib/community-layout';
import { useReadOnly } from '@/lib/read-only';
import { useAuthStore } from '@/stores/auth-store';

type Loaded = {
  token: string;
  communities: Community[];
  layout: RailItem[];
  error: string | null;
};

function CommunityRow({
  community,
  selected,
  disabled,
  onSelect,
  onMoveUp,
  onMoveDown,
}: {
  community: Community;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.communityRow, { borderColor: theme.divider }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${community.name}`}
        onPress={() => router.push(`/communities/${community.id}` as Href)}
        style={styles.communityLink}>
        {community.iconUrl ? (
          <Image source={{ uri: community.iconUrl }} style={styles.icon} />
        ) : (
          <View style={[styles.icon, styles.iconFallback, { backgroundColor: theme.rail }]}>
            <Atom.ThemedText type="smallBold">
              {community.name.slice(0, 1).toUpperCase()}
            </Atom.ThemedText>
          </View>
        )}
        <Atom.ThemedText type="smallBold" numberOfLines={1} style={styles.communityName}>
          {community.name}
        </Atom.ThemedText>
      </Pressable>
      <View style={styles.rowActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${community.name} for a folder`}
          accessibilityState={{ selected, disabled }}
          disabled={disabled}
          onPress={onSelect}
          style={[styles.action, { borderColor: theme.divider }, disabled && styles.disabled]}>
          <Atom.ThemedText type="small">{selected ? 'Selected' : 'Select'}</Atom.ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${community.name} up`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onMoveUp}
          style={[styles.action, { borderColor: theme.divider }, disabled && styles.disabled]}>
          <Atom.ThemedText type="small">Up</Atom.ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${community.name} down`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onMoveDown}
          style={[styles.action, { borderColor: theme.divider }, disabled && styles.disabled]}>
          <Atom.ThemedText type="small">Down</Atom.ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function keepUnsavedDrafts<T>(drafts: Record<number, T>, layout: RailItem[], savedFolderId?: number) {
  const kept = new Set(
    layout.flatMap((item) => item.type === 'folder' && item.id !== savedFolderId ? [item.id] : []),
  );
  return Object.fromEntries(
    Object.entries(drafts).filter(([id]) => kept.has(Number(id))),
  ) as Record<number, T>;
}

export function CommunitySwitcher({ refreshKey = 0 }: { refreshKey?: number }) {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  const readOnly = useReadOnly();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reload, setReload] = useState(0);
  const hasFocused = useRef(false);
  const saveCount = useRef(0);
  const savePending = useRef(false);
  const [savingToken, setSavingToken] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [folderName, setFolderName] = useState('');
  const [folderNames, setFolderNames] = useState<Record<number, string>>({});
  const [folderColors, setFolderColors] = useState<Record<number, string | null>>({});
  const saving = Boolean(token && savingToken === token);
  const current = token && loaded?.token === token ? loaded : null;
  const currentError = current?.error ?? null;
  const locked = saving || readOnly;
  const communityById = useMemo(
    () => new Map((current?.communities ?? []).map((community) => [community.id, community])),
    [current?.communities],
  );

  useFocusEffect(useCallback(() => {
    if (hasFocused.current) setReload((value) => value + 1);
    else hasFocused.current = true;
  }, []));

  useEffect(() => {
    if (!token) return;

    let active = true;
    const savesBefore = saveCount.current;
    const startedDuringSave = savePending.current;
    const outdated = () =>
      !active ||
      useAuthStore.getState().token !== token ||
      startedDuringSave ||
      savePending.current ||
      saveCount.current !== savesBefore;
    Promise.all([getCommunities(token), getRailLayout(token)])
      .then(([communities, layout]) => {
        if (outdated()) return;
        setLoaded({
          token,
          communities,
          layout: normalizeCommunityLayout(layout, communities.map(({ id }) => id)),
          error: null,
        });
        setSelectedIds([]);
        setFolderNames({});
        setFolderColors({});
        setSaveError(null);
      })
      .catch((cause: unknown) => {
        if (outdated()) return;
        setLoaded({
          token,
          communities: [],
          layout: [],
          error: cause instanceof Error ? cause.message : 'Could not load your communities.',
        });
      });

    return () => {
      active = false;
    };
  }, [refreshKey, reload, token]);

  async function saveLayout(nextLayout: RailItem[], savedFolderId?: number) {
    if (!token || !current || locked) return;
    const previous = current;
    const normalized = normalizeCommunityLayout(nextLayout, previous.communities.map(({ id }) => id));
    setLoaded({ ...previous, layout: normalized, error: null });
    setSavingToken(token);
    setSaveError(null);
    saveCount.current += 1;
    savePending.current = true;
    try {
      const saved = normalizeCommunityLayout(
        await updateRailLayout(token, normalized),
        previous.communities.map(({ id }) => id),
      );
      if (useAuthStore.getState().token !== token) return;
      setLoaded((value) => value?.token === token ? { ...value, layout: saved } : value);
      setFolderNames((drafts) => keepUnsavedDrafts(drafts, saved, savedFolderId));
      setFolderColors((drafts) => keepUnsavedDrafts(drafts, saved, savedFolderId));
    } catch (cause) {
      if (useAuthStore.getState().token === token) {
        setLoaded((value) => value?.token === token ? previous : value);
        setSaveError(cause instanceof Error ? cause.message : 'Could not save your communities.');
      }
    } finally {
      savePending.current = false;
      setSavingToken((value) => value === token ? null : value);
    }
  }

  function toggleSelected(communityId: number) {
    setSelectedIds((ids) =>
      ids.includes(communityId) ? ids.filter((id) => id !== communityId) : [...ids, communityId],
    );
  }

  function makeFolder() {
    if (!current || selectedIds.length < 2 || locked) return;
    const folder: RailFolder = {
      type: 'folder',
      id: -1,
      name: folderName.trim() || null,
      color: null,
      communityIds: selectedIds,
    };
    void saveLayout(createCommunityFolder(current.layout, selectedIds, folder));
    setSelectedIds([]);
    setFolderName('');
  }

  function moveEntry(index: number, direction: -1 | 1) {
    if (current) void saveLayout(moveLayoutItem(current.layout, index, direction));
  }

  function moveChild(folderId: number, communityId: number, direction: -1 | 1) {
    if (current) void saveLayout(moveFolderCommunity(current.layout, folderId, communityId, direction));
  }

  function saveFolder(folder: RailFolder) {
    if (!current) return;
    void saveLayout(updateCommunityFolder(current.layout, folder.id, {
      name: (folderNames[folder.id] ?? folder.name ?? '').trim() || null,
      color: folderColors[folder.id] === undefined ? folder.color : folderColors[folder.id],
    }), folder.id);
  }

  if (!token) return null;

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Atom.ThemedText type="subtitle">Your communities</Atom.ThemedText>
        <Atom.ThemedText type="small" themeColor="textSecondary">
          Open a community or organize your list. Changes sync with Orbis on the web.
        </Atom.ThemedText>
        {readOnly ? (
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Confirm your email first to organize your communities.
          </Atom.ThemedText>
        ) : null}
      </View>

      {currentError ? (
        <View style={styles.state}>
          <Atom.ErrorMessage>{currentError}</Atom.ErrorMessage>
          <Atom.Button
            label="Retry"
            variant="secondary"
            onPress={() => {
              setLoaded(null);
              setReload((value) => value + 1);
            }}
          />
        </View>
      ) : !current ? (
        <View style={styles.state}>
          <ActivityIndicator color={theme.accent} />
          <Atom.ThemedText type="small" themeColor="textSecondary">
            Loading your communities…
          </Atom.ThemedText>
        </View>
      ) : current.communities.length === 0 ? (
        <Atom.ThemedText type="small" themeColor="textSecondary">
          You haven’t joined any communities yet.
        </Atom.ThemedText>
      ) : (
        <>
          {current.layout.map((item, index) => {
            if (item.type === 'community') {
              const community = communityById.get(item.communityId);
              if (!community) return null;
              return (
                <CommunityRow
                  key={`community-${community.id}`}
                  community={community}
                  selected={selectedIds.includes(community.id)}
                  disabled={readOnly}
                  onSelect={() => toggleSelected(community.id)}
                  onMoveUp={() => moveEntry(index, -1)}
                  onMoveDown={() => moveEntry(index, 1)}
                />
              );
            }

            const selectedFolderColor =
              folderColors[item.id] === undefined ? item.color : folderColors[item.id];
            return (
              <View
                key={`folder-${item.id}`}
                style={[
                  styles.folder,
                  { backgroundColor: theme.surface, borderColor: theme.divider },
                  selectedFolderColor
                    ? { borderLeftColor: selectedFolderColor, borderLeftWidth: 5 }
                    : null,
                ]}>
                <View style={styles.folderTitle}>
                  <Atom.Input
                    accessibilityLabel={`Name for ${item.name || 'folder'}`}
                    maxLength={32}
                    placeholder="Folder"
                    editable={!readOnly}
                    value={folderNames[item.id] ?? item.name ?? ''}
                    onChangeText={(name) =>
                      setFolderNames((values) => ({ ...values, [item.id]: name }))
                    }
                    style={styles.folderInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.name || 'folder'} up`}
                    accessibilityState={{ disabled: readOnly }}
                    disabled={readOnly}
                    onPress={() => moveEntry(index, -1)}
                    style={[styles.action, { borderColor: theme.divider }, readOnly && styles.disabled]}>
                    <Atom.ThemedText type="small">Up</Atom.ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.name || 'folder'} down`}
                    accessibilityState={{ disabled: readOnly }}
                    disabled={readOnly}
                    onPress={() => moveEntry(index, 1)}
                    style={[styles.action, { borderColor: theme.divider }, readOnly && styles.disabled]}>
                    <Atom.ThemedText type="small">Down</Atom.ThemedText>
                  </Pressable>
                </View>
                <View style={styles.colors}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="No folder color"
                    accessibilityState={{ selected: selectedFolderColor === null, disabled: readOnly }}
                    disabled={readOnly}
                    onPress={() => setFolderColors((values) => ({ ...values, [item.id]: null }))}
                    style={[
                      styles.colorOption,
                      { borderColor: theme.divider, backgroundColor: theme.background },
                      readOnly && styles.disabled,
                    ]}>
                    <Atom.ThemedText type="small">None</Atom.ThemedText>
                  </Pressable>
                  {COMMUNITY_FOLDER_COLORS.map(({ value: color, label }) => {
                    const selected = selectedFolderColor === color;
                    return (
                      <Pressable
                        key={color}
                        accessibilityRole="button"
                        accessibilityLabel={`${label} folder color`}
                        accessibilityState={{ selected, disabled: readOnly }}
                        disabled={readOnly}
                        onPress={() =>
                          setFolderColors((values) => ({ ...values, [item.id]: color }))
                        }
                        style={[
                          styles.colorDot,
                          { backgroundColor: color, borderColor: selected ? theme.text : 'transparent' },
                          readOnly && styles.disabled,
                        ]}
                      />
                    );
                  })}
                </View>
                <View style={styles.folderActions}>
                  <Atom.Button
                    label="Save folder"
                    variant="secondary"
                    disabled={locked}
                    onPress={() => saveFolder(item)}
                  />
                  <Atom.Button
                    label="Ungroup"
                    variant="secondary"
                    disabled={locked}
                    onPress={() => void saveLayout(ungroupCommunityFolder(current.layout, item.id))}
                  />
                </View>
                {item.communityIds.map((communityId) => {
                  const community = communityById.get(communityId);
                  if (!community) return null;
                  return (
                    <CommunityRow
                      key={`community-${community.id}`}
                      community={community}
                      selected={selectedIds.includes(community.id)}
                      disabled={readOnly}
                      onSelect={() => toggleSelected(community.id)}
                      onMoveUp={() => moveChild(item.id, community.id, -1)}
                      onMoveDown={() => moveChild(item.id, community.id, 1)}
                    />
                  );
                })}
              </View>
            );
          })}

          {selectedIds.length > 0 && !readOnly ? (
            <View style={styles.folderCreator}>
              <Atom.ThemedText type="small">
                Select at least two communities to create a folder ({selectedIds.length} selected).
              </Atom.ThemedText>
              <Atom.Input
                accessibilityLabel="New folder name"
                maxLength={32}
                placeholder="Folder name (optional)"
                value={folderName}
                onChangeText={setFolderName}
              />
              <Atom.Button
                label="Create folder"
                variant="secondary"
                disabled={selectedIds.length < 2 || locked}
                onPress={makeFolder}
              />
            </View>
          ) : null}
          {saveError ? <Atom.ErrorMessage>{saveError}</Atom.ErrorMessage> : null}
          {saving ? (
            <Atom.ThemedText type="small" themeColor="textSecondary">Saving your layout…</Atom.ThemedText>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    gap: Spacing.two,
  },
  heading: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  state: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  communityRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  communityLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  iconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityName: {
    flex: 1,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  action: {
    minHeight: 44,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
  },
  folder: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  folderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  folderInput: {
    flex: 1,
  },
  folderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  colors: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  colorOption: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.two,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.5,
  },
  folderCreator: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
