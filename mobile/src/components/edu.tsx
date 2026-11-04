import React from 'react';
import {Alert, Pressable, Text, TextInput, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {errorMessage} from '../api';
import type {Poll, Post, PostStatus, SeriesRef, UserSummary} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {t} from '../i18n';
import {useVote} from '../query/v11';
import {font, makeStyles, radius, spacing, useTheme, weight} from '../theme';
import {Icon, IconButton} from './ui';

/* ------------------------------------------------------------------ */
/* Poll / quiz card                                                    */
/* ------------------------------------------------------------------ */

export function pollPercent(count: number | null, total: number | null): number {
  if (!count || !total) {
    return 0;
  }
  return Math.round((count / total) * 100);
}

/** Vote, then results bars; for quizzes the correct answer is revealed after voting. */
export function PollCard({post}: {post: Post}) {
  const poll = post.poll as Poll;
  const styles = useStyles();
  const {colors} = useTheme();
  const {me} = useAuth();
  const vote = useVote();
  const isAuthor = post.author.id === me?.id;
  const voted = !!poll.myVoteOptionId;
  const showResults = voted || isAuthor || poll.totalVotes !== null;
  const quiz = poll.kind === 'quiz';

  const onVote = (optionId: string) => {
    if (voted || isAuthor || vote.isLoading) {
      return;
    }
    vote.mutate(
      {postId: post.id, optionId},
      {onError: e => Alert.alert(t("Couldn't vote"), errorMessage(e))},
    );
  };

  return (
    <View style={styles.poll} accessibilityLabel={quiz ? t('Quiz') : t('Poll')}>
      <View style={styles.pollHead}>
        <Icon name={quiz ? 'school-outline' : 'stats-chart-outline'} size={16} color={colors.primary} />
        <Text style={styles.pollKind}>{quiz ? t('Quiz') : t('Poll')}</Text>
      </View>
      {poll.question ? <Text style={styles.question}>{poll.question}</Text> : null}
      {poll.options.map(o => {
        const mine = poll.myVoteOptionId === o.id;
        const correct = quiz && poll.correctOptionId === o.id;
        const wrongMine = !!(quiz && mine && poll.correctOptionId && !correct);
        const pct = pollPercent(o.voteCount, poll.totalVotes);
        return (
          <Pressable
            key={o.id}
            onPress={() => onVote(o.id)}
            disabled={showResults && (voted || isAuthor)}
            accessibilityRole="button"
            accessibilityState={{selected: mine, disabled: voted || isAuthor}}
            accessibilityLabel={
              showResults
                ? t('{option}: {pct}%', {option: o.text, pct}) +
                  (correct ? `, ${t('correct answer')}` : '') +
                  (mine ? `, ${t('your vote')}` : '')
                : t('Vote for {option}', {option: o.text})
            }
            style={[
              styles.option,
              mine && styles.optionMine,
              correct && styles.optionCorrect,
              wrongMine && styles.optionWrong,
            ]}>
            {showResults ? (
              <View
                style={[
                  styles.bar,
                  {width: `${pct}%`},
                  correct ? styles.barCorrect : wrongMine ? styles.barWrong : null,
                ]}
              />
            ) : null}
            <Text style={[styles.optionText, mine && styles.optionTextMine]} numberOfLines={2}>
              {o.text}
            </Text>
            {correct ? <Icon name="checkmark-circle" size={18} color={colors.success} /> : null}
            {wrongMine ? <Icon name="close-circle" size={18} color={colors.danger} /> : null}
            {showResults ? <Text style={styles.pct}>{pct}%</Text> : null}
          </Pressable>
        );
      })}
      <Text style={styles.meta}>
        {poll.totalVotes !== null
          ? t('{count} votes', {count: poll.totalVotes})
          : t('Vote to see the results')}
        {quiz && poll.isCorrect !== null
          ? ` · ${poll.isCorrect ? t('Correct! 🎉') : t('Not quite — the right answer is highlighted')}`
          : ''}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Poll / quiz composer                                                */
/* ------------------------------------------------------------------ */

export interface PollDraft {
  kind: 'poll' | 'quiz';
  question: string;
  options: string[];
  correct: number | null;
}

export const emptyPoll = (kind: 'poll' | 'quiz'): PollDraft => ({
  kind,
  question: '',
  options: ['', ''],
  correct: kind === 'quiz' ? 0 : null,
});

/** Returns an error message, or null when the draft can be published. */
export function validatePoll(p: PollDraft): string | null {
  const opts = p.options.map(o => o.trim());
  if (opts.length < 2 || opts.length > 4) {
    return t('Add between 2 and 4 options.');
  }
  if (opts.some(o => !o)) {
    return t('Options cannot be empty.');
  }
  if (opts.some(o => o.length > 100)) {
    return t('Options are limited to 100 characters.');
  }
  if (new Set(opts.map(o => o.toLowerCase())).size !== opts.length) {
    return t('Options must be different.');
  }
  if (p.question.length > 200) {
    return t('The question is limited to 200 characters.');
  }
  if (p.kind === 'quiz' && (p.correct === null || p.correct >= opts.length)) {
    return t('Mark the correct answer.');
  }
  return null;
}

export function toPollInput(p: PollDraft) {
  return {
    question: p.question.trim() || undefined,
    options: p.options.map(o => o.trim()),
    correctOptionIndex: p.kind === 'quiz' && p.correct !== null ? p.correct : undefined,
  };
}

export function PollComposer({
  value,
  onChange,
  onRemove,
}: {
  value: PollDraft;
  onChange: (p: PollDraft) => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const quiz = value.kind === 'quiz';
  const setOption = (i: number, text: string) =>
    onChange({...value, options: value.options.map((o, j) => (j === i ? text : o))});
  const removeOption = (i: number) =>
    onChange({
      ...value,
      options: value.options.filter((_, j) => j !== i),
      correct:
        value.correct === null
          ? null
          : value.correct === i
          ? 0
          : value.correct > i
          ? value.correct - 1
          : value.correct,
    });

  return (
    <View style={styles.composer}>
      <View style={styles.composerHead}>
        <View style={styles.segment}>
          {(['poll', 'quiz'] as const).map(k => (
            <Pressable
              key={k}
              onPress={() =>
                onChange({...value, kind: k, correct: k === 'quiz' ? value.correct ?? 0 : null})
              }
              accessibilityRole="radio"
              accessibilityState={{selected: value.kind === k}}
              style={[styles.segItem, value.kind === k && styles.segActive]}>
              <Text style={[styles.segText, value.kind === k && styles.segTextActive]}>
                {k === 'quiz' ? t('Quiz') : t('Poll')}
              </Text>
            </Pressable>
          ))}
        </View>
        <IconButton name="trash-outline" label={t('Remove poll')} color={colors.danger} onPress={onRemove} />
      </View>
      <TextInput
        value={value.question}
        onChangeText={q => onChange({...value, question: q})}
        placeholder={t('Question (optional)')}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={t('Question (optional)')}
        maxLength={220}
        style={styles.input}
      />
      {value.options.map((o, i) => (
        <View key={i} style={styles.optRow}>
          {quiz ? (
            <Pressable
              onPress={() => onChange({...value, correct: i})}
              accessibilityRole="radio"
              accessibilityState={{selected: value.correct === i}}
              accessibilityLabel={t('Mark option {n} as correct', {n: i + 1})}
              hitSlop={8}
              style={styles.radio}>
              <Icon
                name={value.correct === i ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={value.correct === i ? colors.success : colors.textMuted}
              />
            </Pressable>
          ) : null}
          <TextInput
            value={o}
            onChangeText={v => setOption(i, v)}
            placeholder={t('Option {n}', {n: i + 1})}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('Option {n}', {n: i + 1})}
            maxLength={110}
            style={[styles.input, styles.flex]}
          />
          {value.options.length > 2 ? (
            <IconButton
              name="close"
              size={18}
              label={t('Remove option {n}', {n: i + 1})}
              onPress={() => removeOption(i)}
            />
          ) : null}
        </View>
      ))}
      {value.options.length < 4 ? (
        <Pressable
          onPress={() => onChange({...value, options: [...value.options, '']})}
          accessibilityRole="button"
          style={styles.addOpt}>
          <Icon name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.addOptText}>{t('Add option')}</Text>
        </Pressable>
      ) : null}
      {quiz ? <Text style={styles.hint}>{t('Tap the circle next to the correct answer.')}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Series chip + next episode                                          */
/* ------------------------------------------------------------------ */

export function SeriesChip({series, onMedia}: {series: SeriesRef; onMedia?: boolean}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const navigation = useNavigation();
  return (
    <Pressable
      onPress={() => navigation.navigate('SeriesDetail', {seriesId: series.id})}
      accessibilityRole="button"
      accessibilityLabel={t('Part {n} of {total}: {title}', {
        n: series.position,
        total: series.total,
        title: series.title,
      })}
      style={[styles.seriesChip, onMedia && styles.seriesChipMedia]}>
      <Icon name="albums-outline" size={14} color={onMedia ? colors.onPrimary : colors.primary} />
      <Text style={[styles.seriesText, onMedia && styles.onMedia]} numberOfLines={1}>
        {t('Part {n} of {total}', {n: series.position, total: series.total})} · {series.title}
      </Text>
    </Pressable>
  );
}

export function NextEpisodeButton({series, onMedia}: {series: SeriesRef; onMedia?: boolean}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const navigation = useNavigation();
  if (!series.nextPostId) {
    return null;
  }
  const next = series.nextPostId;
  return (
    <Pressable
      onPress={() => navigation.navigate('ContentDetail', {postId: next})}
      accessibilityRole="button"
      accessibilityLabel={t('Next episode')}
      style={[styles.next, onMedia && styles.nextMedia]}>
      <Text style={[styles.nextText, onMedia && styles.onMedia]}>{t('Next episode')}</Text>
      <Icon name="play-skip-forward" size={14} color={onMedia ? colors.onPrimary : colors.primary} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Processing / failed badge (author's own videos)                     */
/* ------------------------------------------------------------------ */

export function StatusBadge({status, compact}: {status?: PostStatus; compact?: boolean}) {
  const styles = useStyles();
  const {colors} = useTheme();
  if (!status || status === 'ready') {
    return null;
  }
  const failed = status === 'failed';
  return (
    <View
      style={[styles.status, failed ? styles.statusFailed : styles.statusProcessing]}
      accessibilityLabel={failed ? t('Processing failed') : t('Processing…')}>
      <Icon
        name={failed ? 'alert-circle' : 'hourglass-outline'}
        size={12}
        color={failed ? colors.danger : colors.warning}
      />
      {compact ? null : (
        <Text style={[styles.statusText, failed ? styles.statusTextFailed : styles.statusTextProc]}>
          {failed ? t('Failed') : t('Processing…')}
        </Text>
      )}
    </View>
  );
}

/** "Reposted by X" label above following-feed items. */
export function RepostedBy({user, onMedia}: {user: UserSummary; onMedia?: boolean}) {
  const styles = useStyles();
  const {colors} = useTheme();
  return (
    <View style={styles.reposted} accessibilityLabel={t('Reposted by {name}', {name: user.name})}>
      <Icon name="repeat" size={14} color={onMedia ? colors.onPrimary : colors.textSecondary} />
      <Text style={[styles.repostedText, onMedia && styles.onMedia]} numberOfLines={1}>
        {t('Reposted by {name}', {name: user.name})}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  flex: {flex: 1},
  poll: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.primaryTint,
  },
  pollHead: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs},
  pollKind: {
    marginLeft: 6,
    fontSize: font.xs,
    fontWeight: weight.bold,
    color: c.primary,
    textTransform: 'uppercase',
  },
  question: {fontSize: font.md, fontWeight: weight.semibold, color: c.text, marginBottom: spacing.sm},
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 42,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: c.primarySoft,
    backgroundColor: c.card,
    overflow: 'hidden',
  },
  optionMine: {borderColor: c.primary},
  optionCorrect: {borderColor: c.success},
  optionWrong: {borderColor: c.danger},
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: c.primarySoft,
  },
  barCorrect: {backgroundColor: c.success, opacity: 0.18},
  barWrong: {backgroundColor: c.danger, opacity: 0.15},
  optionText: {flex: 1, fontSize: font.md, color: c.text},
  optionTextMine: {fontWeight: weight.semibold},
  pct: {fontSize: font.sm, fontWeight: weight.bold, color: c.text, marginLeft: spacing.sm},
  meta: {fontSize: font.xs, color: c.textSecondary, marginTop: spacing.sm},
  composer: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.primaryTint,
  },
  composerHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  segment: {flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.pill, padding: 3},
  segItem: {paddingHorizontal: spacing.lg, paddingVertical: 6, borderRadius: radius.pill},
  segActive: {backgroundColor: c.primary},
  segText: {fontSize: font.sm, color: c.text, fontWeight: weight.medium},
  segTextActive: {color: c.onPrimary, fontWeight: weight.semibold},
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    fontSize: font.md,
    color: c.text,
    backgroundColor: c.card,
  },
  optRow: {flexDirection: 'row', alignItems: 'center'},
  radio: {marginTop: spacing.sm, marginRight: spacing.sm},
  addOpt: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.md},
  addOptText: {marginLeft: 6, color: c.primary, fontWeight: weight.semibold, fontSize: font.sm},
  hint: {fontSize: font.xs, color: c.textMuted, marginTop: spacing.sm},
  seriesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: c.primarySoft,
  },
  seriesChipMedia: {backgroundColor: c.scrim},
  seriesText: {
    marginLeft: 6,
    fontSize: font.xs,
    fontWeight: weight.semibold,
    color: c.primary,
    flexShrink: 1,
  },
  onMedia: {color: c.onPrimary},
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: c.primary,
  },
  nextMedia: {borderColor: c.onPrimary},
  nextText: {fontSize: font.xs, fontWeight: weight.bold, color: c.primary, marginRight: 4},
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusProcessing: {backgroundColor: c.warningSoft},
  statusFailed: {backgroundColor: c.dangerSoft},
  statusText: {fontSize: 10, fontWeight: weight.bold, marginLeft: 3},
  statusTextProc: {color: c.warning},
  statusTextFailed: {color: c.danger},
  reposted: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs},
  repostedText: {fontSize: font.xs, color: c.textSecondary, marginLeft: 4, fontWeight: weight.semibold},
}));
