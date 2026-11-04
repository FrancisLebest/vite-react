import React, {useEffect, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, ScrollView, Text} from 'react-native';
import {errorMessage} from '../../api';
import type {CategoryId} from '../../api/types';
import {MentionInput} from '../../components/MentionInput';
import {ChipRow, ErrorState, LoadingState, ModalHeader, PillButton, Screen} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {useCategories, usePost} from '../../query/hooks';
import {useEditPost} from '../../query/v11';
import {font, makeStyles, radius, spacing, useTheme, weight} from '../../theme';

const MAX = 2000;

/** PATCH /posts/:id — text + category (author only). */
export default function EditPostScreen({navigation, route}: RootScreenProps<'EditPost'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const post = usePost(route.params.postId);
  const {categories} = useCategories();
  const edit = useEditPost();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<CategoryId>('other');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (post.data && !ready) {
      setText(post.data.text);
      setCategory(post.data.category);
      setReady(true);
    }
  }, [post.data, ready]);

  const save = () =>
    edit.mutate(
      {id: route.params.postId, text: text.trim(), category},
      {
        onSuccess: () => navigation.goBack(),
        onError: e => Alert.alert(t("Couldn't save"), errorMessage(e)),
      },
    );

  return (
    <Screen edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}>
      <ModalHeader
        title={t('Edit post')}
        onClose={() => navigation.goBack()}
        right={
          <PillButton
            small
            title={t('Save')}
            loading={edit.isLoading}
            disabled={!ready || text.length > MAX || (!text.trim() && !post.data?.media)}
            onPress={save}
          />
        }
      />
      {post.isLoading ? (
        <LoadingState />
      ) : post.isError ? (
        <ErrorState message={errorMessage(post.error)} onRetry={() => post.refetch()} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            <Text style={styles.label}>{t('Text')}</Text>
            <MentionInput
              value={text}
              onChangeText={setText}
              multiline
              accessibilityLabel={t('Text')}
              placeholder={t('Ask a question, share a tip… use #hashtags and @mentions')}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              textAlignVertical="top"
              maxLength={MAX + 100}
            />
            <Text style={[styles.counter, text.length > MAX && styles.error]}>
              {text.length}/{MAX}
            </Text>
            <Text style={styles.label}>{t('Category')}</Text>
          </ScrollView>
          <ChipRow items={categories.map(c => ({key: c.id, label: t(c.label)}))} value={category} onChange={setCategory} />
          <Text style={styles.note}>{t('Hashtags are updated from the new text.')}</Text>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  flex: {flex: 1},
  scroll: {padding: spacing.lg},
  label: {fontSize: font.sm, fontWeight: weight.semibold, color: c.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm},
  input: {
    minHeight: 160,
    fontSize: font.lg,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: c.card,
  },
  counter: {alignSelf: 'flex-end', fontSize: font.xs, color: c.textMuted, marginTop: 4},
  error: {color: c.danger},
  note: {fontSize: font.xs, color: c.textMuted, padding: spacing.lg},
}));
