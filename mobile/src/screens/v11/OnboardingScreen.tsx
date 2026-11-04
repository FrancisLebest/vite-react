import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import {api, errorMessage} from '../../api';
import type {CategoryId} from '../../api/types';
import {useAuth} from '../../auth/AuthContext';
import {Icon, PillButton, Screen} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {useCategories} from '../../query/hooks';
import {font, makeStyles, radius, spacing, useTheme, weight} from '../../theme';

const MAX = 10;

/** Interests picker: right after sign-up, and from Settings. */
export default function OnboardingScreen({navigation, route}: RootScreenProps<'Onboarding'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const {me, setMe, completeSetup} = useAuth();
  const {categories} = useCategories();
  const fromSettings = !!route.params?.fromSettings;
  const [selected, setSelected] = useState<CategoryId[]>(me?.interests ?? []);
  const [saving, setSaving] = useState(false);

  const toggle = (id: CategoryId) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : s.length < MAX ? [...s, id] : s));

  const finish = () => {
    if (fromSettings) {
      navigation.goBack();
    } else if (me && me.emailVerified === false) {
      navigation.replace('VerifyEmail');
    } else {
      completeSetup();
      navigation.reset({index: 0, routes: [{name: 'Tabs'}]});
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      setMe(await api.privacy.setInterests(selected));
      finish();
    } catch (e) {
      setSaving(false);
      Alert.alert(t("Couldn't save your interests"), errorMessage(e));
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.step}>{fromSettings ? t('Your interests') : t('Step 1 of 2')}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {t('What do you want to learn?')}
        </Text>
        <Text style={styles.sub}>
          {t('Pick the topics you care about. Your For You feed will show more of them.')}
        </Text>
        <View style={styles.grid}>
          {categories.map(c => {
            const on = selected.includes(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => toggle(c.id)}
                accessibilityRole="checkbox"
                accessibilityState={{checked: on}}
                accessibilityLabel={t(c.label)}
                style={[styles.tile, on && styles.tileOn]}>
                <Icon name={c.icon} size={26} color={on ? colors.onPrimary : colors.primary} />
                <Text style={[styles.tileText, on && styles.tileTextOn]} numberOfLines={1}>
                  {t(c.label)}
                </Text>
                {on ? (
                  <View style={styles.check}>
                    <Icon name="checkmark" size={12} color={colors.primary} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.count}>{t('{count} selected', {count: selected.length})}</Text>
      </ScrollView>
      <View style={styles.footer}>
        <PillButton title={t('Continue')} loading={saving} onPress={save} disabled={!selected.length} />
        {!fromSettings ? (
          <Pressable onPress={finish} accessibilityRole="button" style={styles.skip}>
            <Text style={styles.skipText}>{t('Skip for now')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  scroll: {padding: spacing.xl},
  step: {fontSize: font.sm, color: c.primary, fontWeight: weight.semibold},
  title: {fontSize: font.title, fontWeight: weight.bold, color: c.text, marginTop: spacing.xs},
  sub: {fontSize: font.md, color: c.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg},
  grid: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs},
  tile: {
    width: '30%',
    flexGrow: 1,
    margin: spacing.xs,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.primaryTint,
  },
  tileOn: {backgroundColor: c.primary, borderColor: c.primary},
  tileText: {marginTop: spacing.sm, fontSize: font.sm, color: c.text, fontWeight: weight.medium},
  tileTextOn: {color: c.onPrimary, fontWeight: weight.bold},
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: c.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {fontSize: font.sm, color: c.textSecondary, marginTop: spacing.md, textAlign: 'center'},
  footer: {padding: spacing.lg},
  skip: {alignItems: 'center', paddingVertical: spacing.md},
  skipText: {color: c.textSecondary, fontSize: font.md},
}));
