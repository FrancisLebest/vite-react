import React, {useEffect, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {api, isApiError} from '../api';
import type {CommunityKind} from '../api/types';
import {
  Chip,
  Icon,
  IconButton,
  LoadingState,
  PillButton,
  Screen,
  TextField,
} from '../components/ui';
import {FormError} from './auth/AuthLayout';
import {COMMUNITY_COLORS, COMMUNITY_ICONS} from '../constants/categories';
import {useCommunity} from '../query/hooks';
import {qk} from '../query/keys';
import type {RootScreenProps} from '../navigation/types';
import {font, makeStyles, radius, spacing, useTheme, weight} from '../theme';

const KINDS: {key: CommunityKind; label: string}[] = [
  {key: 'university', label: 'University'},
  {key: 'faculty', label: 'Faculty'},
  {key: 'topic', label: 'Topic'},
];

export default function CreateCommunityScreen({
  navigation,
  route,
}: RootScreenProps<'CreateCommunity'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const editId = route.params?.communityId;
  const qc = useQueryClient();
  const existing = useCommunity(editId ?? '', !!editId);
  const editing = !!editId;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<CommunityKind>('topic');
  const [icon, setIcon] = useState(COMMUNITY_ICONS[0]);
  const [color, setColor] = useState(COMMUNITY_COLORS[0]);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (editing && existing.data && !prefilled) {
      const c = existing.data;
      setName(c.name);
      setDescription(c.description ?? '');
      setKind(c.kind);
      setIcon(c.icon || COMMUNITY_ICONS[0]);
      setColor(c.color || COMMUNITY_COLORS[0]);
      setPrefilled(true);
    }
  }, [editing, existing.data, prefilled]);

  const trimmed = name.trim();
  const nameError =
    trimmed.length < 3
      ? 'Name must be at least 3 characters.'
      : trimmed.length > 60
      ? 'Name must be 60 characters or less.'
      : null;

  const submit = async () => {
    setTouched(true);
    setFormError(null);
    if (nameError) {
      return;
    }
    setSaving(true);
    const body = {
      name: trimmed,
      description: description.trim(),
      kind,
      icon,
      color,
    };
    try {
      const saved = editId
        ? await api.communities.update(editId, body)
        : await api.communities.create(body);
      qc.setQueryData(qk.community(saved.id), saved);
      qc.invalidateQueries(['communities']);
      if (editing) {
        navigation.goBack();
      } else {
        navigation.replace('CommunityDetail', {communityId: saved.id});
      }
    } catch (e) {
      setSaving(false);
      setFormError(
        isApiError(e) && e.code === 'CONFLICT'
          ? 'A community with this name already exists.'
          : isApiError(e)
          ? e.fields.name ?? e.message
          : 'Could not save the community.',
      );
    }
  };

  if (editing && existing.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton
          name="close"
          label="Cancel"
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.title}>
          {editing ? 'Edit Community' : 'Create a Community'}
        </Text>
        <View style={styles.spacer} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <TextField
            label="Community name"
            value={name}
            onChangeText={setName}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Biology Study Group"
            error={touched ? nameError : null}
            maxLength={60}
          />
          <TextField
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="What is this community about?"
            multiline
            maxLength={500}
          />

          <Text style={styles.label}>Type</Text>
          <View style={styles.wrap}>
            {KINDS.map(k => (
              <Chip
                key={k.key}
                label={k.label}
                active={kind === k.key}
                onPress={() => setKind(k.key)}
              />
            ))}
          </View>

          <Text style={styles.label}>Icon</Text>
          <View style={styles.wrap}>
            {COMMUNITY_ICONS.map(i => (
              <Pressable
                key={i}
                onPress={() => setIcon(i)}
                accessibilityRole="radio"
                accessibilityLabel={i.replace('-outline', '')}
                accessibilityState={{selected: icon === i}}
                style={[
                  styles.iconTile,
                  icon === i && {backgroundColor: color, borderColor: color},
                ]}>
                <Icon
                  name={i}
                  size={24}
                  color={icon === i ? colors.white : colors.primary}
                />
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Color</Text>
          <View style={styles.wrap}>
            {COMMUNITY_COLORS.map(c => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityRole="radio"
                accessibilityLabel={`Color ${c}`}
                accessibilityState={{selected: color === c}}
                style={[
                  styles.swatch,
                  {backgroundColor: c},
                  color === c && styles.swatchActive,
                ]}>
                {color === c ? (
                  <Icon name="checkmark" size={18} color={colors.white} />
                ) : null}
              </Pressable>
            ))}
          </View>
          <FormError message={formError} />
        </ScrollView>
        <View style={styles.footer}>
          <PillButton
            title={editing ? 'Save changes' : 'Create Community'}
            icon={editing ? 'checkmark' : 'add-circle'}
            loading={saving}
            onPress={submit}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  flex: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  spacer: {width: 32},
  title: {fontSize: font.lg, fontWeight: weight.bold, color: c.text},
  scroll: {padding: spacing.lg},
  label: {
    fontSize: font.sm,
    fontWeight: weight.semibold,
    color: c.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  wrap: {flexDirection: 'row', flexWrap: 'wrap'},
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: c.primaryTint,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: {borderWidth: 3, borderColor: c.primarySoft},
  footer: {padding: spacing.lg},
}));
