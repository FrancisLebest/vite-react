import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {AppNotification, NotificationType} from '../api/types';
import {mediaUrl} from '../config';
import {font, makeStyles, radius, spacing, useTheme, weight} from '../theme';
import {timeAgo} from '../utils/time';
import {Avatar, Icon} from './ui';

const ICONS: Record<NotificationType, string> = {
  like: 'heart',
  comment: 'chatbubble',
  follow: 'person-add',
  mention: 'at',
  community_join: 'people',
  message: 'mail',
  reply: 'return-down-forward',
  comment_like: 'heart',
  follow_request: 'person-add-outline',
  follow_accepted: 'checkmark-circle',
  repost: 'repeat',
  event: 'calendar',
  verification: 'checkmark-circle',
};

export function NotificationRow({
  notification: n,
  highlight,
}: {
  notification: AppNotification;
  /** override the unread highlight (Notifications screen keeps a snapshot) */
  highlight?: boolean;
}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const navigation = useNavigation();
  const unread = highlight ?? !n.read;
  const thumb = mediaUrl(n.post?.thumbnailUrl);

  const open = () => {
    if (n.post) {
      navigation.navigate('ContentDetail', {postId: n.post.id});
    } else if (n.community) {
      navigation.navigate('CommunityDetail', {communityId: n.community.id});
    } else if (n.type === 'message') {
      navigation.navigate('Tabs', {screen: 'Inbox'});
    } else {
      navigation.navigate('UserProfile', {userId: n.actor.id});
    }
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${n.actor.name} ${n.text}, ${timeAgo(n.createdAt)}`}
      style={({pressed}) => [
        styles.row,
        unread && styles.unread,
        pressed && styles.pressed,
      ]}>
      <Pressable
        onPress={() => navigation.navigate('UserProfile', {userId: n.actor.id})}
        accessibilityRole="button"
        accessibilityLabel={`Open ${n.actor.name}'s profile`}>
        <Avatar uri={n.actor.avatarUrl} name={n.actor.name} size={48} />
        <View style={styles.icon}>
          <Icon
            name={ICONS[n.type] ?? 'notifications'}
            size={11}
            color={colors.white}
          />
        </View>
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.text} numberOfLines={3}>
          <Text style={styles.name}>{n.actor.name} </Text>
          {n.text}
          {n.community && !n.text.includes(n.community.name) ? (
            <Text style={styles.name}> {n.community.name}</Text>
          ) : null}
        </Text>
        <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
      </View>
      {thumb ? <Image source={{uri: thumb}} style={styles.thumb} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles(c => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  unread: {backgroundColor: c.primaryTint},
  pressed: {opacity: 0.7},
  icon: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.primary,
    borderWidth: 2,
    borderColor: c.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {flex: 1, marginHorizontal: spacing.md},
  text: {fontSize: font.md, color: c.textSecondary},
  name: {fontWeight: weight.bold, color: c.text},
  time: {fontSize: font.xs, color: c.textMuted, marginTop: 2},
  thumb: {
    width: 44,
    height: 58,
    borderRadius: radius.sm,
    backgroundColor: c.primarySoft,
  },
}));
