import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useEffect, useState, type ReactNode } from 'react';
import * as Atom from '@atom';

import { Spacing } from '@/constants/theme';
import { useCurrentProfile } from '@/hooks/use-current-profile';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteCommunity,
  getCommunityMembers,
  removeCommunityImage,
  setCommunityAdmin,
  updateCommunity,
  uploadCommunityImage,
  type Community,
  type CommunityImage,
  type CommunityLinks,
  type CommunityMember,
} from '@/lib/api';
import {
  communityLinkFields,
  invalidCommunityLink,
  normalizeCommunityLink,
  normalizeCommunityLinks,
} from '@/lib/community-links';
import { useReadOnly } from '@/lib/read-only';
import { useAuthStore } from '@/stores/auth-store';

const imageFields: { key: CommunityImage; label: string; ratio?: [number, number] }[] = [
  { key: 'icon', label: 'Icon', ratio: [1, 1] },
  { key: 'cover', label: 'Cover', ratio: [3, 1] },
  { key: 'background', label: 'Background', ratio: [16, 9] },
];

function imageUrl(community: Community, image: CommunityImage) {
  switch (image) {
    case 'icon':
      return community.iconUrl;
    case 'cover':
      return community.coverUrl;
    case 'background':
      return community.backgroundUrl;
  }
}

function askForConfirmation(
  title: string,
  message: string,
  action: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

function ReadOnlyHint({ action }: { action: string }) {
  return (
    <Atom.ThemedText type="small" themeColor="textSecondary">
      Confirm your email first to {action}.
    </Atom.ThemedText>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
      <View style={styles.sectionHeading}>
        <Atom.ThemedText type="smallBold">{title}</Atom.ThemedText>
        {description ? (
          <Atom.ThemedText type="small" themeColor="textSecondary">{description}</Atom.ThemedText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function CommunitySettings({
  community: initialCommunity,
  onDeleted,
}: {
  community: Community;
  onDeleted: () => void;
}) {
  const theme = useTheme();
  const token = useAuthStore((state) => state.token);
  useCurrentProfile();
  const readOnly = useReadOnly();
  const [community, setCommunity] = useState(initialCommunity);
  const [name, setName] = useState(initialCommunity.name);
  const [description, setDescription] = useState(initialCommunity.description ?? '');
  const [isPublic, setIsPublic] = useState(initialCommunity.isPublic !== false);
  const [links, setLinks] = useState<CommunityLinks>(initialCommunity.links ?? {});
  const [savedLinks, setSavedLinks] = useState<CommunityLinks>(initialCommunity.links ?? {});
  const [membersState, setMembersState] = useState<{
    key: string;
    members: CommunityMember[] | null;
    error: string | null;
  } | null>(null);
  const [memberAttempt, setMemberAttempt] = useState(0);
  const [pendingMember, setPendingMember] = useState<number | null>(null);
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<CommunityImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const normalizedLinks = normalizeCommunityLinks(links);
  const invalidLink = invalidCommunityLink(normalizedLinks);
  const linksChanged = communityLinkFields.some(({ key }) =>
    normalizedLinks[key] !== savedLinks[key],
  );
  const membersKey = `${token ?? ''}:${community.id}:${memberAttempt}`;
  const currentMembersState = membersState?.key === membersKey ? membersState : null;
  const members = currentMembersState?.members ?? null;
  const memberError = currentMembersState?.error ?? (
    token ? null : 'Sign in again to manage community admins.'
  );
  const generalChanged =
    name.trim() !== community.name ||
    description.trim() !== (community.description ?? '') ||
    isPublic !== (community.isPublic !== false);
  const isOwner = community.role === 'owner';

  useEffect(() => {
    if (!token) return;
    let active = true;
    getCommunityMembers(token, community.id)
      .then((result) => {
        if (active) setMembersState({ key: membersKey, members: result, error: null });
      })
      .catch((cause: unknown) => {
        if (active) {
          setMembersState({
            key: membersKey,
            members: null,
            error: cause instanceof Error ? cause.message : 'Could not load community members.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [community.id, membersKey, token]);

  async function saveGeneral() {
    if (!token || pendingSection || readOnly) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter a community name.');
      return;
    }
    const keepLinkDrafts = linksChanged;
    setPendingSection('general');
    setError(null);
    setMessage(null);
    try {
      const updated = await updateCommunity(token, community.id, {
        name: trimmedName,
        description: description.trim(),
        isPublic,
      });
      setCommunity(updated);
      setName(updated.name);
      setDescription(updated.description ?? '');
      setIsPublic(updated.isPublic !== false);
      setSavedLinks(updated.links ?? {});
      if (!keepLinkDrafts) setLinks(updated.links ?? {});
      setMessage('Settings saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the settings.');
    } finally {
      setPendingSection(null);
    }
  }

  async function saveLinks() {
    if (!token || pendingSection || invalidLink || readOnly) return;
    setPendingSection('links');
    setError(null);
    setMessage(null);
    try {
      const updated = await updateCommunity(token, community.id, { links: normalizedLinks });
      setCommunity(updated);
      const nextLinks = updated.links ?? {};
      setLinks(nextLinks);
      setSavedLinks(nextLinks);
      setMessage('Links saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save community links.');
    } finally {
      setPendingSection(null);
    }
  }

  async function pickImage(image: CommunityImage, ratio?: [number, number]) {
    if (!token || pendingImage || readOnly) return;
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: Boolean(ratio),
        ...(ratio ? { aspect: ratio } : {}),
        quality: 1,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('The image picker returned no image.');
      if (asset.fileSize !== null && asset.fileSize !== undefined && asset.fileSize > 10 * 1024 * 1024) {
        throw new Error('Images must be 10 MB or smaller.');
      }
      setPendingImage(image);
      const updated = await uploadCommunityImage(
        token,
        community.id,
        image,
        asset.uri,
        asset.fileName ?? null,
        asset.mimeType ?? null,
      );
      setCommunity(updated);
      setMessage(`${image[0].toUpperCase()}${image.slice(1)} updated.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not upload the ${image}.`);
    } finally {
      setPendingImage(null);
    }
  }

  async function removeImage(image: CommunityImage) {
    if (!token || pendingImage || readOnly) return;
    setPendingImage(image);
    setError(null);
    setMessage(null);
    try {
      const updated = await removeCommunityImage(token, community.id, image);
      setCommunity(updated);
      setMessage(`${image[0].toUpperCase()}${image.slice(1)} removed.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not remove the ${image}.`);
    } finally {
      setPendingImage(null);
    }
  }

  function confirmRemoveImage(image: CommunityImage, label: string) {
    askForConfirmation(
      `Remove community ${label.toLowerCase()}?`,
      'You can add another image at any time.',
      'Remove',
      () => void removeImage(image),
    );
  }

  function confirmAdminChange(member: CommunityMember, promote: boolean) {
    if (!isOwner || member.isOwner || !token || pendingMember !== null || readOnly) return;
    const label = member.name || member.username;
    askForConfirmation(
      promote ? `Make ${label} an admin?` : `Remove ${label} as an admin?`,
      promote
        ? 'Admins can manage community details.'
        : 'They will no longer be able to manage community details.',
      promote ? 'Make admin' : 'Remove admin',
      () => void updateAdmin(member, promote),
    );
  }

  async function updateAdmin(member: CommunityMember, isAdmin: boolean) {
    if (!token) return;
    setPendingMember(member.userId);
    try {
      setMembersState({
        key: membersKey,
        members: await setCommunityAdmin(token, community.id, member.userId, isAdmin),
        error: null,
      });
    } catch (cause) {
      setMembersState({
        key: membersKey,
        members,
        error: cause instanceof Error ? cause.message : 'Could not update admins.',
      });
    } finally {
      setPendingMember(null);
    }
  }

  function confirmDelete() {
    if (!isOwner || !token || pendingSection || readOnly) return;
    askForConfirmation(
      `Delete ${community.name}?`,
      'This permanently deletes the community, its posts, and member access. This cannot be undone.',
      'Delete',
      () => void handleDelete(),
    );
  }

  async function handleDelete() {
    if (!token) return;
    setPendingSection('delete');
    setError(null);
    try {
      await deleteCommunity(token, community.id);
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the community.');
      setPendingSection(null);
    }
  }

  return (
    <View style={styles.page}>
      <Atom.ThemedText type="subtitle">Community settings</Atom.ThemedText>
      <Atom.ThemedText type="small" themeColor="textSecondary">
        Manage {community.name}. The server enforces each action’s permissions.
      </Atom.ThemedText>

      <Section title="General">
        <View style={styles.field}>
          <Atom.ThemedText type="smallBold">Community name</Atom.ThemedText>
          <Atom.Input
            accessibilityLabel="Community name"
            autoCapitalize="sentences"
            autoComplete="off"
            maxLength={100}
            value={name}
            onChangeText={(value) => {
              setName(value);
              setMessage(null);
            }}
          />
        </View>
        <View style={styles.field}>
          <Atom.ThemedText type="smallBold">Description</Atom.ThemedText>
          <Atom.Input
            accessibilityLabel="Community description"
            maxLength={300}
            multiline
            numberOfLines={4}
            placeholder="What’s this community about?"
            textAlignVertical="top"
            value={description}
            onChangeText={(value) => {
              setDescription(value);
              setMessage(null);
            }}
          />
          <Atom.ThemedText type="small" themeColor="textSecondary">
            {description.length}/300 · Shown in Explore.
          </Atom.ThemedText>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Public community"
          accessibilityState={{ checked: isPublic }}
          onPress={() => {
            setIsPublic((value) => !value);
            setMessage(null);
          }}
          style={styles.switchRow}>
          <View style={styles.field}>
            <Atom.ThemedText type="smallBold">Public community</Atom.ThemedText>
            <Atom.ThemedText type="small" themeColor="textSecondary">
              Anyone can find it in Explore and join. Private communities are visible only to members.
            </Atom.ThemedText>
          </View>
          <View style={[
            styles.switch,
            { backgroundColor: isPublic ? theme.accent : theme.rail },
          ]}>
            <View style={[styles.switchKnob, isPublic && styles.switchKnobOn]} />
          </View>
        </Pressable>
        <Atom.Button
          label="Save changes"
          loading={pendingSection === 'general'}
          disabled={readOnly || !generalChanged || Boolean(pendingSection)}
          onPress={() => void saveGeneral()}
        />
        {readOnly ? <ReadOnlyHint action="change this" /> : null}
      </Section>

      <Section title="Images" description="Images are shared with Orbis on the web. Maximum size: 10 MB.">
        {imageFields.map(({ key, label, ratio }) => {
          const uri = imageUrl(community, key);
          return (
            <View key={key} style={[styles.imageRow, { borderColor: theme.divider }]}>
              {uri ? (
                <Image source={{ uri }} style={key === 'icon' ? styles.iconPreview : styles.imagePreview} />
              ) : (
                <View style={[
                  key === 'icon' ? styles.iconPreview : styles.imagePreview,
                  styles.imagePlaceholder,
                  { backgroundColor: theme.rail },
                ]}>
                  <Atom.ThemedText type="small" themeColor="textSecondary">No {label.toLowerCase()}</Atom.ThemedText>
                </View>
              )}
              <View style={styles.imageInfo}>
                <Atom.ThemedText type="smallBold">{label}</Atom.ThemedText>
                {readOnly ? null : (
                  <>
                    <Atom.Button
                      label="Choose image"
                      accessibilityLabel={`Choose community ${label.toLowerCase()}`}
                      variant="secondary"
                      loading={pendingImage === key}
                      disabled={Boolean(pendingImage)}
                      onPress={() => void pickImage(key, ratio)}
                    />
                    {uri ? (
                      <Atom.Button
                        label="Remove"
                        accessibilityLabel={`Remove community ${label.toLowerCase()}`}
                        variant="secondary"
                        disabled={Boolean(pendingImage)}
                        onPress={() => confirmRemoveImage(key, label)}
                      />
                    ) : null}
                  </>
                )}
              </View>
            </View>
          );
        })}
        {readOnly ? <ReadOnlyHint action="change images" /> : null}
      </Section>

      <Section title="External links" description="Add the community’s other places.">
        {communityLinkFields.map(({ key, label, example, pattern }) => {
          const value = normalizeCommunityLink(links[key] ?? '');
          const invalid = Boolean(value && !pattern.test(value));
          return (
            <View key={key} style={styles.field}>
              <Atom.ThemedText type="smallBold">{label}</Atom.ThemedText>
              <Atom.Input
                accessibilityLabel={`${label} link`}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
                maxLength={300}
                placeholder={example}
                keyboardType="url"
                value={links[key] ?? ''}
                onChangeText={(next) => {
                  setLinks((current) => ({ ...current, [key]: next }));
                  setMessage(null);
                }}
              />
              {invalid ? (
                <Atom.ErrorMessage>Use a link like {example}</Atom.ErrorMessage>
              ) : null}
            </View>
          );
        })}
        <Atom.Button
          label="Save links"
          variant="secondary"
          loading={pendingSection === 'links'}
          disabled={readOnly || !linksChanged || Boolean(invalidLink) || Boolean(pendingSection)}
          onPress={() => void saveLinks()}
        />
        {readOnly ? <ReadOnlyHint action="change this" /> : null}
      </Section>

      <Section
        title="Admins"
        description="Admins can manage community details. Only the owner can add or remove admins.">
        {memberError ? (
          <View style={styles.inlineState}>
            <Atom.ErrorMessage>{memberError}</Atom.ErrorMessage>
            <Atom.Button
              label="Try again"
              variant="secondary"
              onPress={() => setMemberAttempt((value) => value + 1)}
            />
          </View>
        ) : members === null ? (
          <Atom.ThemedText type="small" themeColor="textSecondary">Loading community members…</Atom.ThemedText>
        ) : members.length === 0 ? (
          <Atom.ThemedText type="small" themeColor="textSecondary">No community members found.</Atom.ThemedText>
        ) : (
          members.map((member) => {
            const label = member.name || member.username;
            const isAdmin = member.isOwner || member.isAdmin;
            return (
              <View key={member.userId} style={[styles.memberRow, { borderColor: theme.divider }]}>
                {member.avatarUrl ? (
                  <Image source={{ uri: member.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.rail }]}>
                    <Atom.ThemedText type="smallBold">{label.slice(0, 1).toUpperCase()}</Atom.ThemedText>
                  </View>
                )}
                <View style={styles.memberInfo}>
                  <Atom.ThemedText type="smallBold" numberOfLines={1}>{label}</Atom.ThemedText>
                  <Atom.ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    @{member.username} · {member.isOwner ? 'Owner' : member.isAdmin ? 'Admin' : 'Member'}
                  </Atom.ThemedText>
                </View>
                {isOwner && !member.isOwner ? (
                  <Atom.Button
                    label={isAdmin ? 'Remove admin' : 'Make admin'}
                    variant="secondary"
                    loading={pendingMember === member.userId}
                    disabled={readOnly || pendingMember !== null}
                    onPress={() => confirmAdminChange(member, !member.isAdmin)}
                  />
                ) : null}
              </View>
            );
          })
        )}
        {readOnly && isOwner ? <ReadOnlyHint action="change admins" /> : null}
      </Section>

      {isOwner ? (
        <Section
          title="Danger zone"
          description="Permanently remove this community and its posts. This action cannot be undone.">
          <Atom.Button
            label="Delete community"
            variant="secondary"
            loading={pendingSection === 'delete'}
            disabled={readOnly || Boolean(pendingSection)}
            onPress={confirmDelete}
          />
          {readOnly ? <ReadOnlyHint action="delete this community" /> : null}
        </Section>
      ) : null}

      {error ? <Atom.ErrorMessage>{error}</Atom.ErrorMessage> : null}
      {message ? <Atom.ThemedText type="small" themeColor="textSecondary">{message}</Atom.ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    gap: Spacing.three,
  },
  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sectionHeading: {
    gap: Spacing.one,
  },
  field: {
    gap: Spacing.one,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  switch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  switchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },
  switchKnobOn: {
    alignSelf: 'flex-end',
  },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  iconPreview: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  imagePreview: {
    width: 100,
    height: 64,
    borderRadius: 8,
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageInfo: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  inlineState: {
    gap: Spacing.two,
  },
});
