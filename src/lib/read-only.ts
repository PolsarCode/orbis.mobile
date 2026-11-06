import { useAuthStore } from '@/stores/auth-store';

export function useReadOnly() {
  return useAuthStore((state) => state.profile?.emailVerifiedAt === null);
}
