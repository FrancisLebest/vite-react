import React, {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {errorMessage} from '../api';
import type {CategoryId} from '../api/types';
import {CommunityPicker} from '../components/CommunityPicker';
import {
  ChipRow,
  Icon,
  IconButton,
  PillButton,
  ProgressBar,
  Screen,
  TextField,
} from '../components/ui';
import {VideoPlayer} from '../components/VideoPlayer';
import {PickedMedia, pickVideo, recordVideo} from '../media/picker';
import {useCreatePost} from '../query/createPost';
import {useCategories} from '../query/hooks';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {useAppActive} from '../utils/hooks';
import {duration} from '../utils/time';

const MAX_CAPTION = 2000;

export default function CreateVideoScreen({
  navigation,
  route,
}: RootScreenProps<'CreateVideo'>) {
  const {categories} = useCategories();
  const create = useCreatePost();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const [video, setVideo] = useState<PickedMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<CategoryId>('study-tips');
  const [communityId, setCommunityId] = useState<string | null>(
    route.params?.communityId ?? null,
  );
  const [paused, setPaused] = useState(false);

  const choose = async (source: 'camera' | 'library') => {
    const picked =
      source === 'camera' ? await recordVideo() : await pickVideo();
    if (picked) {
      setVideo(picked);
      setPaused(false);
    }
  };

  const publish = () => {
    if (!video || create.isLoading) {
      return;
    }
    if (caption.length > MAX_CAPTION) {
      Alert.alert(
        'Caption too long',
        `Keep it under ${MAX_CAPTION} characters.`,
      );
      return;
    }
    setPaused(true);
    create.mutate(
      {
        type: 'video',
        text: caption.trim(),
        category,
        communityId: communityId ?? undefined,
        media: video,
      },
      {
        onSuccess: post =>
          navigation.replace('ContentDetail', {postId: post.id}),
        onError: e => Alert.alert('Upload failed', errorMessage(e)),
      },
    );
  };

  const close = () => {
    if (create.isLoading) {
      return;
    }
    if (video) {
      Alert.alert('Discard video?', 'Your video and caption will be lost.', [
        {text: 'Keep editing', style: 'cancel'},
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ]);
    } else {
      navigation.goBack();
    }
  };

  return (
    <Screen edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton name="close" label="Cancel" onPress={close} />
        <Text style={styles.title}>New Video</Text>
        {video ? (
          <PillButton
            small
            title="Publish"
            loading={create.isLoading}
            onPress={publish}
          />
        ) : (
          <View style={styles.spacer} />
        )}
      </View>

      {!video ? (
        <View style={styles.choose}>
          <Icon name="videocam" size={56} color={colors.primary} />
          <Text style={styles.chooseTitle}>Share a short study video</Text>
          <Text style={styles.chooseSub}>
            MP4 or MOV, up to 100 MB. Vertical videos look best.
          </Text>
          <PillButton
            title="Record with camera"
            icon="radio-button-on"
            style={styles.chooseBtn}
            onPress={() => choose('camera')}
          />
          <PillButton
            title="Pick from library"
            icon="images-outline"
            variant="outline"
            style={styles.chooseBtn}
            onPress={() => choose('library')}
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scroll}>
            <Pressable
              onPress={() => setPaused(p => !p)}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Play preview' : 'Pause preview'}>
              <VideoPlayer
                uri={video.uri}
                paused={paused || !focused || !appActive || create.isLoading}
                resizeMode="contain"
                showPausedIcon
                style={styles.preview}
              />
            </Pressable>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {[
                  duration(video.durationSec),
                  video.fileSize
                    ? `${(video.fileSize / 1024 / 1024).toFixed(1)} MB`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {!create.isLoading ? (
                <Pressable
                  onPress={() => setVideo(null)}
                  accessibilityRole="button"
                  hitSlop={8}>
                  <Text style={styles.change}>Change video</Text>
                </Pressable>
              ) : null}
            </View>

            {create.isLoading ? (
              <View style={styles.progress}>
                <ProgressBar
                  progress={create.progress}
                  label={create.progress >= 1 ? 'Processing' : 'Uploading'}
                />
              </View>
            ) : null}

            <TextField
              label="Caption"
              value={caption}
              onChangeText={setCaption}
              placeholder="Describe your video… #hashtags @mentions"
              multiline
              editable={!create.isLoading}
              maxLength={MAX_CAPTION + 50}
              error={
                caption.length > MAX_CAPTION
                  ? `Max ${MAX_CAPTION} characters.`
                  : null
              }
              hint={`${caption.length}/${MAX_CAPTION}`}
            />
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
          <View style={styles.footer}>
            <PillButton
              title={create.isLoading ? 'Uploading…' : 'Publish video'}
              icon="cloud-upload-outline"
              loading={create.isLoading}
              onPress={publish}
            />
          </View>
        </KeyboardAvoidingView>
      )}
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
  spacer: {width: 70},
  title: {fontSize: font.lg, fontWeight: weight.bold, color: colors.text},
  choose: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  chooseTitle: {
    fontSize: font.xl,
    fontWeight: weight.bold,
    color: colors.text,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  chooseSub: {
    fontSize: font.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  chooseBtn: {alignSelf: 'stretch', marginTop: spacing.md},
  scroll: {padding: spacing.lg},
  preview: {height: 320, borderRadius: radius.lg},
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  meta: {fontSize: font.sm, color: colors.textSecondary},
  change: {
    fontSize: font.sm,
    color: colors.primary,
    fontWeight: weight.semibold,
  },
  progress: {marginTop: spacing.md},
  label: {
    fontSize: font.sm,
    fontWeight: weight.semibold,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  labelPad: {paddingHorizontal: spacing.lg, marginTop: spacing.sm},
  footer: {padding: spacing.lg},
});
