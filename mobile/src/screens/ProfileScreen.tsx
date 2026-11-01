import React from 'react';
import ProfileView from '../components/ProfileView';
import {IconButton, Screen, ScreenHeader} from '../components/ui';
import {useApp} from '../context/AppContext';
import type {TabScreenProps} from '../navigation/types';

export default function ProfileScreen({navigation}: TabScreenProps<'Profile'>) {
  const {me, unreadNotifications} = useApp();
  return (
    <Screen>
      <ScreenHeader
        title="Profile"
        right={
          <IconButton
            name="notifications-outline"
            label="Notifications"
            badge={unreadNotifications}
            onPress={() => navigation.navigate('Notifications')}
          />
        }
      />
      <ProfileView userId={me.id} />
    </Screen>
  );
}
