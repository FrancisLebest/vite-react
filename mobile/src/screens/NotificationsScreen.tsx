import React, {useEffect} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {Avatar, BackHeader, EmptyState, Icon, Screen} from '../components/ui';
import {useApp} from '../context/AppContext';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, spacing, weight} from '../theme';
import {timeAgo} from '../utils/time';

export default function NotificationsScreen({
  navigation,
}: RootScreenProps<'Notifications'>) {
  const {state, getUser, dispatch} = useApp();
  // Snapshot of unread ids so they stay highlighted during this visit.
  const [unreadIds] = React.useState(
    () => new Set(state.notifications.filter(n => !n.read).map(n => n.id)),
  );

  useEffect(() => {
    dispatch({type: 'markNotificationsRead'});
  }, [dispatch]);

  return (
    <Screen>
      <BackHeader title="Notifications" />
      <FlatList
        data={state.notifications}
        keyExtractor={n => n.id}
        renderItem={({item}) => {
          const actor = getUser(item.actorId);
          return (
            <Pressable
              style={[styles.row, unreadIds.has(item.id) && styles.unread]}
              onPress={() =>
                navigation.navigate('UserProfile', {userId: actor.id})
              }>
              <View>
                <Avatar uri={actor.avatar} size={48} />
                <View style={styles.icon}>
                  <Icon name={item.icon} size={11} color={colors.white} />
                </View>
              </View>
              <Text style={styles.text} numberOfLines={2}>
                <Text style={styles.name}>{actor.name} </Text>
                {item.text}
              </Text>
              <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-off-outline"
            title="No notifications"
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  unread: {backgroundColor: colors.primaryTint},
  icon: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    marginHorizontal: spacing.md,
    fontSize: font.md,
    color: colors.textSecondary,
  },
  name: {fontWeight: weight.bold, color: colors.text},
  time: {fontSize: font.xs, color: colors.textMuted},
});
