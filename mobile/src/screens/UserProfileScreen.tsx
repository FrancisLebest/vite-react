import React from 'react';
import {Share} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import type {User} from '../api/types';
import ProfileView from '../components/ProfileView';
import {BackHeader, IconButton, Screen} from '../components/ui';
import {qk} from '../query/keys';
import type {RootScreenProps} from '../navigation/types';

export default function UserProfileScreen({
  route,
}: RootScreenProps<'UserProfile'>) {
  const {userId} = route.params;
  const qc = useQueryClient();
  const cached = qc.getQueryData<User>(qk.user(userId));
  return (
    <Screen>
      <BackHeader
        title={cached?.name ?? 'Profile'}
        right={
          <IconButton
            name="share-social-outline"
            label="Share profile"
            onPress={() => {
              const u = qc.getQueryData<User>(qk.user(userId));
              Share.share({
                message: u
                  ? `Follow @${u.username} on StudyHub`
                  : 'Join me on StudyHub',
              }).catch(() => undefined);
            }}
          />
        }
      />
      <ProfileView userId={userId} />
    </Screen>
  );
}
