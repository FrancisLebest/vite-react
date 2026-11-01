import React from 'react';
import {Share} from 'react-native';
import ProfileView from '../components/ProfileView';
import {BackHeader, IconButton, Screen} from '../components/ui';
import {useApp} from '../context/AppContext';
import type {RootScreenProps} from '../navigation/types';

export default function UserProfileScreen({
  route,
}: RootScreenProps<'UserProfile'>) {
  const {getUser} = useApp();
  const user = getUser(route.params.userId);
  return (
    <Screen>
      <BackHeader
        title={user.name}
        right={
          <IconButton
            name="share-social-outline"
            label="Share profile"
            onPress={() =>
              Share.share({
                message: `Follow @${user.handle} on StudyHub`,
              }).catch(() => undefined)
            }
          />
        }
      />
      <ProfileView userId={user.id} />
    </Screen>
  );
}
