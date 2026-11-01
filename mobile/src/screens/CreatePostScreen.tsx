import React, {useState} from 'react';
import {
  Alert,
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
import {errorMessage} from '../api';
import type {CategoryId} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {CommunityPicker} from '../components/CommunityPicker';
import {useSheet} from '../components/Sheet';
import {
  Avatar,
  ChipRow,
  Icon,
  IconButton,
  PillButton,
  ProgressBar,
  Screen,
} from '../components/ui';
import {PickedMedia, pickImage, takePhoto} from '../media/picker';
import {useCreatePost} from '../query/createPost';
import {useCategories} from '../query/hooks';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';

const MAX = 2000;

export default function CreatePostScreen({
  navigation,
  route,
}: RootScreenProps<'CreatePost'>) {
  const {me} = useAuth();
  const {categories} = useCategories();
  const openSheet = useSheet();
  const create = useCreatePost();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<CategoryId>('study-tips');
  const [communityId, setCommunityId] = useState<string | null>(
    route.params?.communityId ?? null,
  );
  const [image, setImage] = useState<PickedMedia | null>(null);

  const canPost =
    (text.trim().length > 0 || !!image) &&
    text.length <= MAX &&
    !create.isLoading;

  const publish = () => {
    if (!canPost) {
      return;
    }
    create.mutate(
      {
        type: 'post',
        text: text.trim(),
        category,
        communityId: communityId ?? undefined,
        media: image ?? undefined,
      },
      {
        onSuccess: post =>
          navigation.replace('ContentDetail', {postId: post.id}),
        onError: e => Alert.alert("Couldn't publish", errorMessage(e)),
      },
    );
  };

  const addPhoto = () =>
    openSheet({
      title: 'Add a photo',
      options: [
        {
          label: 'Choose from library',
          icon: 'images-outline',
          onPress: async () => setImage((await pickImage()) ?? image),
        },
        {
          label: 'Take a photo',
          icon: 'camera-outline',
          onPress: async () => setImage((await takePhoto()) ?? image),
        },
      ],
    });

  const close = () => {
    if ((text.trim() || image) && !create.isLoading) {
      Alert.alert('Discard post?', 'Your draft will be lost.', [
        {text: 'Keep editing', style: 'cancel'},
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ]);
    } else if (!create.isLoading) {
      navigation.goBack();
    }
  };

  return (
    <Screen edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton name="close" label="Cancel" onPress={close} />
        <Text style={styles.title}>Create Post</Text>
        <PillButton
          small
          title="Publish"
          disabled={!canPost}
          loading={create.isLoading}
          onPress={publish}
        />
      </View>
      {create.isLoading ? (
        <View style={styles.progress}>
          <ProgressBar
            progress={create.progress}
            label={image ? 'Uploading' : 'Publishing'}
          />
        </View>
      ) : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}>
          <View style={styles.author}>
            <Avatar uri={me?.avatarUrl} name={me?.name} size={44} />
            <View style={styles.authorBody}>
              <Text style={styles.name}>{me?.name}</Text>
              {me?.university ? (
                <Text style={styles.sub}>{me.university}</Text>
              ) : null}
            </View>
          </View>

          <Text style={styles.label} nativeID="postLabel">
            What do you want to share?
          </Text>
          <TextInput
            accessibilityLabel="Post text"
            accessibilityLabelledBy="postLabel"
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            maxLength={MAX + 100}
            editable={!create.isLoading}
            placeholder="Ask a question, share a tip… use #hashtags and @mentions"
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
              <Image
                source={{uri: image.uri}}
                style={styles.image}
                resizeMode="cover"
              />
              <IconButton
                name="close-circle"
                label="Remove image"
                color={colors.white}
                size={28}
                style={styles.removeImage}
                onPress={() => setImage(null)}
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
        <Text style={[styles.label, styles.labelPad]}>
          Community (optional)
        </Text>
        <CommunityPicker value={communityId} onChange={setCommunityId} />
        <View style={styles.toolbar}>
          <Pressable
            style={styles.tool}
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            onPress={addPhoto}>
            <Icon name="image-outline" size={22} color={colors.primary} />
            <Text style={styles.toolText}>Photo</Text>
          </Pressable>
          <Pressable
            style={styles.tool}
            accessibilityRole="button"
            accessibilityLabel="Add hashtag"
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
  progress: {paddingHorizontal: spacing.lg, paddingTop: spacing.md},
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
  labelPad: {paddingHorizontal: spacing.lg, marginTop: spacing.sm},
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
    marginTop: spacing.sm,
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
