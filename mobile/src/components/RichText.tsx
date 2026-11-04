import React from 'react';
import {StyleProp, Text, TextStyle} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {makeStyles, weight} from '../theme';

// Latin (incl. accents) + Arabic letters; avoids \p{} escapes (Hermes on RN 0.72).
const TOKEN = /([#@][\w\u00C0-\u024F\u0600-\u06FF.]+)/;

/** Split text into plain / #hashtag / @mention parts. */
export function tokenize(text: string): {kind: 'text' | 'tag' | 'mention'; value: string}[] {
  return text
    .split(TOKEN)
    .filter(Boolean)
    .map(part =>
      part.startsWith('#') && part.length > 1
        ? {kind: 'tag' as const, value: part.slice(1).replace(/\.+$/, '')}
        : part.startsWith('@') && part.length > 1
        ? {kind: 'mention' as const, value: part.slice(1).replace(/\.+$/, '')}
        : {kind: 'text' as const, value: part},
    );
}

/** Text where #hashtags open the hashtag page and @mentions open the profile. */
export function RichText({
  text,
  style,
  linkStyle,
  numberOfLines,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const styles = useStyles();
  const navigation = useNavigation();
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {tokenize(text).map((p, i) =>
        p.kind === 'text' ? (
          p.value
        ) : (
          <Text
            key={i}
            style={[styles.link, linkStyle]}
            accessibilityRole="link"
            onPress={() =>
              p.kind === 'tag'
                ? navigation.navigate('Hashtag', {tag: p.value.toLowerCase()})
                : navigation.navigate('UserProfile', {userId: p.value})
            }>
            {p.kind === 'tag' ? '#' : '@'}
            {p.value}
          </Text>
        ),
      )}
    </Text>
  );
}

/** Row of tappable #tags (post hashtags array). */
export function HashtagList({
  tags,
  style,
}: {
  tags: string[];
  style?: StyleProp<TextStyle>;
}) {
  const styles = useStyles();
  const navigation = useNavigation();
  if (!tags.length) {
    return null;
  }
  return (
    <Text style={[styles.tags, style]}>
      {tags.map((h, i) => (
        <Text
          key={h}
          accessibilityRole="link"
          onPress={() => navigation.navigate('Hashtag', {tag: h.toLowerCase()})}>
          #{h}
          {i < tags.length - 1 ? ' ' : ''}
        </Text>
      ))}
    </Text>
  );
}

const useStyles = makeStyles(c => ({
  link: {color: c.primaryLight, fontWeight: weight.semibold},
  tags: {color: c.primaryLight, fontWeight: weight.semibold},
}));
