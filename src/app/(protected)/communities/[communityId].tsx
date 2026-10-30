import { useLocalSearchParams } from 'expo-router';
import * as Organism from '@organism';
import * as Template from '@template';

export default function CommunityDetailScreen() {
  const { communityId = '' } = useLocalSearchParams<{ communityId: string }>();

  return (
    <Template.ScreenTemplate>
      <Organism.CommunityDetail communityId={communityId} />
    </Template.ScreenTemplate>
  );
}
