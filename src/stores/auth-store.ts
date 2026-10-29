import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as api from '@/lib/api';
import type {
  LoginCredentials,
  Profile,
  ProfilePreferences,
  SignupDetails,
} from '@/lib/api';
import { clearOAuthState } from '@/lib/oauth';
import { secureStorage } from '@/lib/storage';

type AuthState = {
  token: string | null;
  profile: Profile | null;
  sessionExpired: boolean;
  preferencesPending: boolean;
  preferencesVersion: number;
  login: (credentials: LoginCredentials, signal?: AbortSignal) => Promise<void>;
  loginWithToken: (token: string) => void;
  setAvatarUrl: (avatarUrl: string | null) => void;
  signup: (details: SignupDetails, signal?: AbortSignal) => Promise<void>;
  logout: () => void;
  expireSession: (token: string) => void;
  fetchProfile: () => Promise<Profile | null>;
  updatePreferences: (preferences: ProfilePreferences) => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      profile: null,
      sessionExpired: false,
      preferencesPending: false,
      preferencesVersion: 0,
      login: async (credentials, signal) => {
        const token = await api.login(credentials, signal);
        set({
          token,
          profile: null,
          sessionExpired: false,
          preferencesPending: false,
          preferencesVersion: 0,
        });
      },
      loginWithToken: (token) => {
        set({
          token,
          profile: null,
          sessionExpired: false,
          preferencesPending: false,
          preferencesVersion: 0,
        });
      },
      setAvatarUrl: (avatarUrl) => {
        set((state) =>
          state.profile ? { profile: { ...state.profile, avatarUrl } } : state,
        );
      },
      signup: async (details, signal) => {
        const token = await api.signup(details, signal);
        set({
          token,
          profile: null,
          sessionExpired: false,
          preferencesPending: false,
          preferencesVersion: 0,
        });
      },
      logout: () => {
        set({
          token: null,
          profile: null,
          sessionExpired: false,
          preferencesPending: false,
          preferencesVersion: 0,
        });
        void clearOAuthState();
      },
      expireSession: (token) => {
        if (get().token !== token) return;
        set({
          token: null,
          profile: null,
          sessionExpired: true,
          preferencesPending: false,
          preferencesVersion: 0,
        });
        void clearOAuthState();
      },
      fetchProfile: async () => {
        const { token } = get();

        if (!token) {
          set({ profile: null });
          return null;
        }

        const profile = await api.getProfile(token);
        if (!profile || get().token !== token) return null;

        set({ profile });
        return profile;
      },
      updatePreferences: async (preferences) => {
        const { token, profile } = get();
        if (!token || !profile) throw new Error('Your profile is still loading. Try again.');
        if (get().preferencesPending) throw new Error('Another preference change is still saving.');

        set({
          profile: { ...profile, ...preferences },
          preferencesPending: true,
        });

        try {
          const updatedProfile = await api.updatePreferences(token, preferences);
          set((state) => state.token === token
            ? {
                profile: updatedProfile,
                preferencesPending: false,
                preferencesVersion: state.preferencesVersion + 1,
              }
            : state);
        } catch (error) {
          set((state) => {
            if (state.token !== token) return state;

            const rollback = {
              ...(preferences.theme !== undefined && { theme: profile.theme }),
              ...(preferences.appearOffline !== undefined && {
                appearOffline: profile.appearOffline,
              }),
              ...(preferences.status !== undefined && { status: profile.status }),
              ...(preferences.isPublic !== undefined && { isPublic: profile.isPublic }),
              ...(preferences.showNsfw !== undefined && { showNsfw: profile.showNsfw }),
              ...(preferences.showChangelog !== undefined && {
                showChangelog: profile.showChangelog,
              }),
            };

            return {
              profile: state.profile ? { ...state.profile, ...rollback } : profile,
              preferencesPending: false,
              preferencesVersion: state.preferencesVersion + 1,
            };
          });
          throw error;
        }
      },
    }),
    {
      name: 'auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: ({ token }) => ({ token }),
    },
  ),
);

api.setUnauthorizedHandler((token) => useAuthStore.getState().expireSession(token));

export function useAuthHydrated() {
  return useSyncExternalStore(
    (onChange) => useAuthStore.persist.onFinishHydration(onChange),
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  );
}
