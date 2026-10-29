import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ThemeMode } from '@/lib/api';
import { secureStorage } from '@/lib/storage';

type ThemeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'theme',
      storage: createJSONStorage(() => secureStorage),
      partialize: ({ mode }) => ({ mode }),
    },
  ),
);

export function useThemeHydrated() {
  return useSyncExternalStore(
    (onChange) => useThemeStore.persist.onFinishHydration(onChange),
    () => useThemeStore.persist.hasHydrated(),
    () => false,
  );
}
