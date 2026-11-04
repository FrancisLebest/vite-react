import React, {useState} from 'react';
import {Modal, Pressable, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getLang, t} from '../i18n';
import {font, makeStyles, MAX_CONTENT_WIDTH, radius, spacing, useTheme, weight} from '../theme';
import {formatDateTime, monthName, weekdayShort} from '../utils/time';
import {Icon, IconButton, PillButton} from './ui';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** 6×7 grid of dates for the month containing `month` (weeks start Monday, Sunday in en). */
export function monthGrid(month: Date, weekStartsOn: 0 | 1): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  return Array.from(
    {length: 42},
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

/**
 * Date + time picker built with core components only (no native dependency,
 * works the same on iOS 12 and Android 7). Minutes step by 5.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  minimumDate,
  error,
  optional,
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  minimumDate?: Date;
  error?: string | null;
  optional?: boolean;
}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? defaultDate(minimumDate));
  const [month, setMonth] = useState(new Date(draft.getFullYear(), draft.getMonth(), 1));
  const weekStart: 0 | 1 = getLang() === 'en' ? 0 : 1;
  const min = minimumDate ? startOfDay(minimumDate) : null;

  const show = () => {
    const d = value ?? defaultDate(minimumDate);
    setDraft(d);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setOpen(true);
  };

  const setDay = (day: Date) =>
    setDraft(
      new Date(day.getFullYear(), day.getMonth(), day.getDate(), draft.getHours(), draft.getMinutes()),
    );
  const shiftTime = (minutes: number) => setDraft(new Date(draft.getTime() + minutes * 60000));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDateTime(value) : t('Not set')}`}
        style={[styles.field, error ? styles.fieldError : null]}>
        <Icon name="calendar-outline" size={18} color={colors.primary} />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value ? formatDateTime(value) : t('Choose a date and time')}
        </Text>
        {optional && value ? (
          <IconButton name="close-circle" size={18} color={colors.textMuted} label={t('Clear')} onPress={() => onChange(null)} />
        ) : null}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('Close')} />
        <View style={[styles.sheet, {paddingBottom: insets.bottom + spacing.lg}]}>
          <View style={styles.handle} />
          <View style={styles.monthRow}>
            <IconButton
              name="chevron-back"
              label={t('Previous month')}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            />
            <Text style={styles.month} accessibilityRole="header">
              {monthName(month.getMonth())} {month.getFullYear()}
            </Text>
            <IconButton
              name="chevron-forward"
              label={t('Next month')}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            />
          </View>
          <View style={styles.week}>
            {Array.from({length: 7}, (_, i) => (
              <Text key={i} style={styles.weekday}>
                {weekdayShort((i + weekStart) % 7)}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {monthGrid(month, weekStart).map(d => {
              const inMonth = d.getMonth() === month.getMonth();
              const selected = startOfDay(d).getTime() === startOfDay(draft).getTime();
              const disabled = !!min && d < min;
              return (
                <Pressable
                  key={d.toISOString()}
                  disabled={disabled}
                  onPress={() => setDay(d)}
                  accessibilityRole="button"
                  accessibilityState={{selected, disabled}}
                  accessibilityLabel={`${d.getDate()} ${monthName(d.getMonth())}`}
                  style={[styles.day, selected && styles.daySelected]}>
                  <Text
                    style={[
                      styles.dayText,
                      !inMonth && styles.dayOut,
                      disabled && styles.dayDisabled,
                      selected && styles.dayTextSelected,
                    ]}>
                    {d.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.timeRow}>
            <Stepper label={t('Hour')} value={pad(draft.getHours())} onMinus={() => shiftTime(-60)} onPlus={() => shiftTime(60)} />
            <Text style={styles.colon}>:</Text>
            <Stepper label={t('Minutes')} value={pad(draft.getMinutes())} onMinus={() => shiftTime(-5)} onPlus={() => shiftTime(5)} />
          </View>
          <PillButton
            title={t('Done')}
            onPress={() => {
              onChange(draft);
              setOpen(false);
            }}
            style={styles.done}
          />
        </View>
      </Modal>
    </View>
  );
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.stepper} accessibilityLabel={`${label} ${value}`}>
      <IconButton name="remove" label={t('Decrease {what}', {what: label})} onPress={onMinus} />
      <Text style={styles.stepValue}>{value}</Text>
      <IconButton name="add" label={t('Increase {what}', {what: label})} onPress={onPlus} />
    </View>
  );
}

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

function defaultDate(min?: Date) {
  const base = min && min.getTime() > Date.now() ? min : new Date();
  const d = new Date(base.getTime() + 24 * 3600 * 1000);
  d.setHours(18, 0, 0, 0);
  return d;
}

const useStyles = makeStyles(c => ({
  wrap: {marginTop: spacing.md},
  label: {fontSize: font.sm, fontWeight: weight.semibold, color: c.text, marginBottom: spacing.xs},
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: c.card,
  },
  fieldError: {borderColor: c.danger},
  value: {flex: 1, marginLeft: spacing.sm, fontSize: font.md, color: c.text},
  placeholder: {color: c.textMuted},
  error: {color: c.danger, fontSize: font.sm, marginTop: 4},
  backdrop: {flex: 1, backgroundColor: c.overlay},
  sheet: {
    backgroundColor: c.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  monthRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  month: {fontSize: font.lg, fontWeight: weight.bold, color: c.text},
  week: {flexDirection: 'row', marginTop: spacing.sm},
  weekday: {flex: 1, textAlign: 'center', fontSize: font.xs, color: c.textMuted, fontWeight: weight.semibold},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  day: {width: `${100 / 7}%`, aspectRatio: 1.2, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill},
  daySelected: {backgroundColor: c.primary},
  dayText: {fontSize: font.md, color: c.text},
  dayOut: {color: c.textMuted},
  dayDisabled: {color: c.border},
  dayTextSelected: {color: c.onPrimary, fontWeight: weight.bold},
  timeRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md},
  colon: {fontSize: font.xxl, fontWeight: weight.bold, color: c.text, marginHorizontal: spacing.sm},
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
  },
  stepValue: {fontSize: font.xxl, fontWeight: weight.bold, color: c.text, minWidth: 40, textAlign: 'center'},
  done: {marginTop: spacing.lg},
}));
