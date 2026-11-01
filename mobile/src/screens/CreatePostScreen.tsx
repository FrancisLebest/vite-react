import React, {useState} from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Avatar,
  ChipRow,
  Icon,
  IconButton,
  PillButton,
  Screen,
} from '../components/ui';
import {newId, useApp} from '../context/AppContext';
import {categories} from '../data/mock';
import type {CategoryId} from '../data/types';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';

const MAX = 500;

export default function CreatePostScreen({
  navigation,
}: RootScreenProps<'CreatePost'>) {
  const {me, dispatch} = useApp();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<CategoryId>('study-tips');
  const [image, setImage] = useState<string | undefined>();

  const hashtags = Array.from(
    new Set((text.match(/#(\w+)/g) ?? []).map(h => h.slice(1))),
  );
  const body = text.replace(/#\w+/g, '').trim();
  const canPost = body.length > 0 && text.length <= MAX;

  const publish = () => {
    if (!canPost) {
      return;
    }
    dispatch({
      type: 'addPost',
      post: {
        id: newId('p'),
        authorId: me.id,
        text: body,
        hashtags,
        image,
        likes: 0,
        shares: 0,
        createdAt: Date.now(),
        category,
      },
    });
    navigation.goBack();
    navigation.navigate('Posts');
  };

  return (
    <Screen edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton
          name="close"
          label="Cancel"
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.title}>Create Post</Text>
        <PillButton
          small
          title="Publish"
          disabled={!canPost}
          onPress={publish}
        />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}>
          <View style={styles.author}>
            <Avatar uri={me.avatar} size={44} />
            <View style={styles.authorBody}>
              <Text style={styles.name}>{me.name}</Text>
              <Text style={styles.sub}>{me.university}</Text>
            </View>
          </View>

          <Text style={styles.label} nativeID="postLabel">
            What do you want to share?
          </Text>
          <TextInput
            accessibilityLabelledBy="postLabel"
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            maxLength={MAX + 50}
            placeholder="Ask a question, share a tip… use #hashtags"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            textAlignVertical="top"
            underlineColorAndroid="transparent"
          />
          <Text
            style={[styles.counter, text.length > MAX && styles.counterError]}>
            {text.length}/{MAX}
          </Text>

          {image ? (
            <View>
              <Image source={{uri: image}} style={styles.image} />
              <IconButton
                name="close-circle"
                label="Remove image"
                color={colors.white}
                size={28}
                style={styles.removeImage}
                onPress={() => setImage(undefined)}
              />
            </View>
          ) : null}

          <Text style={styles.label}>Category</Text>
        </ScrollView>
        <ChipRow
          items={categories.map(c => ({key: c.id, label: c.label}))}
          value={category}
          onChange={setCategory}
        />
        <View style={styles.toolbar}>
          <Pressable
            style={styles.tool}
            accessibilityRole="button"
            onPress={() =>
              setImage(`https://picsum.photos/seed/${Date.now()}/800/500`)
            }>
            <Icon name="image-outline" size={22} color={colors.primary} />
            <Text style={styles.toolText}>Photo</Text>
          </Pressable>
          <Pressable
            style={styles.tool}
            accessibilityRole="button"
            onPress={() =>
              setText(t => `${t}${t.endsWith(' ') || !t ? '' : ' '}#`)
            }>
            <Icon name="pricetag-outline" size={22} color={colors.primary} />
            <Text style={styles.toolText}>Hashtag</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {fontSize: font.lg, fontWeight: weight.bold, color: colors.text},
  scroll: {padding: spacing.lg},
  author: {flexDirection: 'row', alignItems: 'center'},
  authorBody: {marginLeft: spacing.md},
  name: {fontSize: font.md, fontWeight: weight.bold, color: colors.text},
  sub: {fontSize: font.sm, color: colors.textSecondary},
  label: {
    fontSize: font.sm,
    fontWeight: weight.semibold,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 140,
    fontSize: font.lg,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  counter: {
    alignSelf: 'flex-end',
    fontSize: font.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  counterError: {color: colors.danger},
  image: {
    marginTop: spacing.md,
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  removeImage: {position: 'absolute', top: spacing.md + 4, right: 4},
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tool: {flexDirection: 'row', alignItems: 'center', marginRight: spacing.xl},
  toolText: {
    marginLeft: 6,
    color: colors.primary,
    fontWeight: weight.semibold,
    fontSize: font.md,
  },
});
