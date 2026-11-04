import React, {forwardRef, useState} from 'react';
import {
  NativeSyntheticEvent,
  Pressable,
  Text,
  TextInput,
  TextInputProps,
  TextInputSelectionChangeEventData,
  View,
} from 'react-native';
import type {UserSummary} from '../api/types';
import {t} from '../i18n';
import {useMentionSuggestions} from '../query/v11';
import {font, makeStyles, radius, shadowFor, spacing, weight} from '../theme';
import {useDebounced} from '../utils/hooks';
import {Avatar, VerifiedBadge} from './ui';

/** The "@query" being typed right before the cursor, or null. */
export function mentionQueryAt(text: string, cursor: number): {query: string; start: number} | null {
  const before = text.slice(0, cursor);
  const m = /(^|\s)@([\w.]{0,30})$/.exec(before);
  if (!m) {
    return null;
  }
  return {query: m[2], start: before.length - m[2].length - 1};
}

/** Insert "@username " in place of the "@query" at `start`. */
export function insertMention(
  text: string,
  start: number,
  cursor: number,
  username: string,
): {text: string; cursor: number} {
  const inserted = `@${username} `;
  const next = text.slice(0, start) + inserted + text.slice(cursor).replace(/^\s/, '');
  return {text: next, cursor: start + inserted.length};
}

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (v: string) => void;
  /** where the suggestion list opens relative to the input */
  placement?: 'above' | 'below';
};

/**
 * TextInput with @mention autocomplete (GET /users/mentions).
 * Used by the comment composer, the post composer and video captions.
 */
export const MentionInput = forwardRef<TextInput, Props>(function MentionInput(
  {value, onChangeText, placement = 'below', onSelectionChange, ...props},
  ref,
) {
  const styles = useStyles();
  const [cursor, setCursor] = useState(value.length);
  const active = mentionQueryAt(value, cursor);
  const q = useDebounced(active ? active.query : null, 200);
  const {data} = useMentionSuggestions(active ? q : null);
  const suggestions = active ? (data ?? []).slice(0, 5) : [];

  const pick = (u: UserSummary) => {
    if (!active) {
      return;
    }
    const r = insertMention(value, active.start, cursor, u.username);
    onChangeText(r.text);
    setCursor(r.cursor);
  };

  const list = suggestions.length ? (
    <View
      style={[styles.list, placement === 'above' ? styles.above : styles.below]}
      accessibilityLabel={t('Mention suggestions')}>
      {suggestions.map(u => (
        <Pressable
          key={u.id}
          onPress={() => pick(u)}
          accessibilityRole="button"
          accessibilityLabel={t('Mention {name}', {name: u.name})}
          style={({pressed}) => [styles.row, pressed && styles.pressed]}>
          <Avatar uri={u.avatarUrl} name={u.name} size={28} />
          <View style={styles.body}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {u.name}
              </Text>
              {u.verified ? <VerifiedBadge size={12} /> : null}
            </View>
            <Text style={styles.handle} numberOfLines={1}>
              @{u.username}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  ) : null;

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={v => {
          onChangeText(v);
          // keep the cursor estimate sane when typing at the end
          setCursor(c => (v.length > value.length && c === value.length ? v.length : c));
        }}
        onSelectionChange={(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
          setCursor(e.nativeEvent.selection.end);
          onSelectionChange?.(e);
        }}
        {...props}
      />
      {list}
    </View>
  );
});

const useStyles = makeStyles(c => ({
  wrap: {flexShrink: 1, flexGrow: 1},
  list: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: c.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: spacing.xs,
    ...shadowFor(c),
  },
  above: {bottom: '100%', marginBottom: spacing.xs},
  below: {top: '100%', marginTop: spacing.xs},
  row: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 6},
  pressed: {backgroundColor: c.primaryTint},
  body: {marginLeft: spacing.sm, flex: 1},
  nameRow: {flexDirection: 'row', alignItems: 'center'},
  name: {fontSize: font.sm, fontWeight: weight.semibold, color: c.text, marginRight: 4, flexShrink: 1},
  handle: {fontSize: font.xs, color: c.textSecondary},
}));
