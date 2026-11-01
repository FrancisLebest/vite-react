import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useCommunities} from '../query/hooks';
import {colors, font, spacing} from '../theme';
import {ChipRow} from './ui';

/** Optional community selector (communities the user is a member of). */
export function CommunityPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const mine = useCommunities({mine: true, sort: 'recent'});
  if (mine.isLoading) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }
  if (!mine.items.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Join a community to post in it.</Text>
      </View>
    );
  }
  return (
    <ChipRow
      items={[
        {key: '__none__', label: 'No community'},
        ...mine.items.map(c => ({key: c.id, label: c.name})),
      ]}
      value={value ?? '__none__'}
      onChange={k => onChange(k === '__none__' ? null : k)}
    />
  );
}

const styles = StyleSheet.create({
  loader: {marginVertical: spacing.sm},
  empty: {paddingHorizontal: spacing.lg},
  emptyText: {color: colors.textMuted, fontSize: font.sm},
});
