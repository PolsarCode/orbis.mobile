import * as Organism from '@organism';
import * as Template from '@template';

import { useCurrentProfile } from '@/hooks/use-current-profile';

export default function DirectoryScreen() {
  const { profile, failed, retry } = useCurrentProfile();
  const access = failed ? 'failed' : !profile ? 'loading' : profile.isAdmin ? 'allowed' : 'denied';

  return (
    <Template.ScreenTemplate>
      <Organism.AccessGate
        access={access}
        description="Only site admins can see the directory."
        onRetry={retry}>
        {profile ? <Organism.DirectoryView headAdmin={profile.isHeadAdmin} /> : null}
      </Organism.AccessGate>
    </Template.ScreenTemplate>
  );
}
