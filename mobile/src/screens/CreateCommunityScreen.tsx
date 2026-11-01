import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Chip, Icon, IconButton, PillButton, Screen} from '../components/ui';
import {newId, useApp} from '../context/AppContext';
import type {Community} from '../data/types';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';

const ICONS = [
  'school-outline',
  'book-outline',
  'code-slash-outline',
  'flask-outline',
  'calculator-outline',
  'bulb-outline',
  'musical-notes-outline',
  'basketball-outline',
];
const KINDS: {key: Community['kind']; label: string}[] = [
  {key: 'university', label: 'University'},
  {key: 'faculty', label: 'Faculty'},
  {key: 'topic', label: 'Topic'},
];

export default function CreateCommunityScreen({
  navigation,
}: RootScreenProps<'CreateCommunity'>) {
  const {dispatch} = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<Community['kind']>('topic');
  const [icon, setIcon] = useState(ICONS[0]);
  const [touched, setTouched] = useState(false);

  const nameError =
    name.trim().length < 3 ? 'Name must be at least 3 characters.' : null;

  const create = () => {
    setTouched(true);
    if (nameError) {
      return;
    }
    const community: Community = {
      id: newId('k'),
      name: name.trim(),
      description: description.trim() || 'A new community on StudyHub.',
      members: 0,
      icon,
      color: colors.primary,
      kind,
    };
    dispatch({type: 'createCommunity', community});
    navigation.replace('CommunityDetail', {communityId: community.id});
  };

  return (
    <Screen edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton
          name="close"
          label="Cancel"
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.title}>Create a Community</Text>
        <View style={styles.spacer} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.label} nativeID="nameLabel">
            Community name
          </Text>
          <TextInput
            accessibilityLabelledBy="nameLabel"
            value={name}
            onChangeText={setName}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Biology Study Group"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              touched && nameError ? styles.inputError : null,
            ]}
            maxLength={60}
            underlineColorAndroid="transparent"
          />
          {touched && nameError ? (
            <Text style={styles.error}>{nameError}</Text>
          ) : null}

          <Text style={styles.label} nativeID="descLabel">
            Description (optional)
          </Text>
          <TextInput
            accessibilityLabelledBy="descLabel"
            value={description}
            onChangeText={setDescription}
            placeholder="What is this community about?"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.multiline]}
            multiline
            textAlignVertical="top"
            maxLength={240}
            underlineColorAndroid="transparent"
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
            {ICONS.map(i => (
              <Pressable
                key={i}
                onPress={() => setIcon(i)}
                accessibilityRole="radio"
                accessibilityState={{selected: icon === i}}
                style={[styles.iconTile, icon === i && styles.iconTileActive]}>
                <Icon
                  name={i}
                  size={24}
                  color={icon === i ? colors.white : colors.primary}
                />
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <PillButton
            title="Create Community"
            icon="add-circle"
            onPress={create}
          />
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
  spacer: {width: 32},
  title: {fontSize: font.lg, fontWeight: weight.bold, color: colors.text},
  scroll: {padding: spacing.lg},
  label: {
    fontSize: font.sm,
    fontWeight: weight.semibold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: font.md,
    color: colors.text,
  },
  inputError: {borderColor: colors.danger},
  error: {color: colors.danger, fontSize: font.sm, marginTop: 4},
  multiline: {height: 110, paddingTop: spacing.md},
  wrap: {flexDirection: 'row', flexWrap: 'wrap'},
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconTileActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  footer: {padding: spacing.lg},
});
