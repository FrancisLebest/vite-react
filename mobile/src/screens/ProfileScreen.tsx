import React from 'react';
import ProfileView from '../components/ProfileView';
import {IconButton, Screen, ScreenHeader} from '../components/ui';
import {useMe} from '../auth/AuthContext';
import {useUnreadCounts} from '../query/messaging';
import type {TabScreenProps} from '../navigation/types';
import {StyleSheet} from 'react-native';
import {spacing} from '../theme';

export default function ProfileScreen({navigation}: TabScreenProps<'Profile'>) {
  const me = useMe();
  const unread = useUnreadCounts();
  return (
    <Screen>
      <ScreenHeader
        title="Profile"
        right={
          <>
            <IconButton
              name="notifications-outline"
              label="Notifications"
              badge={unread.notifications}
              onPress={() => navigation.navigate('Notifications')}
            />
            <IconButton
              name="settings-outline"
              label="Settings"
              style={styles.ml}
              onPress={() => navigation.navigate('Settings')}
            />
          </>
        }
      />
      <ProfileView userId={me.id} />
    </Screen>
  );
}

const styles = StyleSheet.create({ml: {marginLeft: spacing.md}});
