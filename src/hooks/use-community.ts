import { useEffect, useState } from 'react';

import { getCommunity, type Community } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

type Loaded = { key: string; community: Community | null; failed: boolean };

export function useCommunity(communityId: string) {
  const token = useAuthStore((state) => state.token);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${token ?? ''}:${communityId}:${attempt}`;

  useEffect(() => {
    let active = true;
    getCommunity(token, communityId)
      .then((community) => {
        if (active) setLoaded({ key, community, failed: false });
      })
      .catch(() => {
        if (active) setLoaded({ key, community: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [communityId, key, token]);

  const current = loaded?.key === key ? loaded : null;

  return {
    loading: !current,
    community: current?.community ?? null,
    failed: current?.failed ?? false,
    retry: () => setAttempt((value) => value + 1),
  };
}
