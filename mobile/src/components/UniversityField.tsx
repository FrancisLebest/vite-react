import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useUniversities} from '../query/hooks';
import {colors, font, radius, spacing} from '../theme';
import {useDebounced} from '../utils/hooks';
import {Icon, TextField} from './ui';

/** Free-text university input with suggestions from GET /universities. */
export function UniversityField({
  value,
  onChange,
  label = 'University (optional)',
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const [focused, setFocused] = useState(false);
  const q = useDebounced(value, 300);
  const {data} = useUniversities(q);
  const suggestions = (data ?? [])
    .filter(u => u.toLowerCase() !== value.trim().toLowerCase())
    .slice(0, 5);

  return (
    <View>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Start typing your university"
        autoCorrect={false}
      />
      {focused && suggestions.length ? (
        <View style={styles.list} accessibilityLabel="University suggestions">
          {suggestions.map(u => (
            <Pressable
              key={u}
              accessibilityRole="button"
              onPress={() => {
                onChange(u);
                setFocused(false);
              }}
              style={({pressed}) => [styles.item, pressed && styles.pressed]}>
              <Icon name="business-outline" size={16} color={colors.primary} />
              <Text style={styles.text} numberOfLines={1}>
                {u}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    backgroundColor: colors.white,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pressed: {backgroundColor: colors.primaryTint},
  text: {
    marginLeft: spacing.sm,
    fontSize: font.md,
    color: colors.text,
    flex: 1,
  },
});
