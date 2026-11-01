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
import {api, isApiError} from '../api';
import type {Role} from '../api/types';
import {useMe, useAuth} from '../auth/AuthContext';
import {useSheet} from '../components/Sheet';
import {UniversityField} from '../components/UniversityField';
import {
  Avatar,
  Chip,
  Icon,
  IconButton,
  PillButton,
  ProgressBar,
  Screen,
  TextField,
} from '../components/ui';
import {ROLES} from '../constants/categories';
import {MAX_AVATAR_BYTES, pickImage, takePhoto} from '../media/picker';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, spacing, weight} from '../theme';
import {Errors, hasErrors, validators} from '../utils/validation';
import {FormError} from './auth/AuthLayout';

type Field = 'name' | 'username';

export default function EditProfileScreen({
  navigation,
}: RootScreenProps<'EditProfile'>) {
  const me = useMe();
  const {setMe} = useAuth();
  const openSheet = useSheet();
  const [name, setName] = useState(me.name);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio ?? '');
  const [university, setUniversity] = useState(me.university ?? '');
  const [role, setRole] = useState<Role>(me.role);
  const [errors, setErrors] = useState<Errors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);

  const changeAvatar = () =>
    openSheet({
      title: 'Profile photo',
      options: [
        {
          label: 'Choose from library',
          icon: 'images-outline',
          onPress: () => uploadAvatar('library'),
        },
        {
          label: 'Take a photo',
          icon: 'camera-outline',
          onPress: () => uploadAvatar('camera'),
        },
      ],
    });

  const uploadAvatar = async (source: 'library' | 'camera') => {
    const img =
      source === 'camera' ? await takePhoto(800) : await pickImage(800);
    if (!img) {
      return;
    }
    if (img.fileSize && img.fileSize > MAX_AVATAR_BYTES) {
      Alert.alert('Image too large', 'Profile photos must be 5 MB or less.');
      return;
    }
    setAvatarProgress(0);
    try {
      setMe(await api.users.uploadAvatar(img, {onProgress: setAvatarProgress}));
    } catch (e) {
      Alert.alert(
        'Upload failed',
        isApiError(e) ? e.message : 'Could not upload the photo.',
      );
    } finally {
      setAvatarProgress(null);
    }
  };

  const save = async () => {
    const e: Errors<Field> = {
      name: validators.name(name),
      username: validators.username(username),
    };
    setErrors(e);
    setFormError(null);
    if (hasErrors(e)) {
      return;
    }
    setSaving(true);
    try {
      const updated = await api.users.updateMe({
        name: name.trim(),
        username: username.trim(),
        bio: bio.trim() || null,
        university: university.trim() || null,
        role,
      });
      setMe(updated);
      navigation.goBack();
    } catch (err) {
      setSaving(false);
      if (isApiError(err) && Object.keys(err.fields).length) {
        setErrors(x => ({...x, ...err.fields}));
      } else {
        setFormError(
          isApiError(err) ? err.message : 'Could not save your profile.',
        );
      }
    }
  };

  return (
    <Screen edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton
          name="close"
          label="Cancel"
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.title}>Edit Profile</Text>
        <PillButton small title="Save" loading={saving} onPress={save} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <Pressable
            style={styles.avatarWrap}
            onPress={changeAvatar}
            disabled={avatarProgress !== null}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo">
            <Avatar uri={me.avatarUrl} name={me.name} size={96} />
            <View style={styles.camera}>
              <Icon name="camera" size={16} color={colors.white} />
            </View>
          </Pressable>
          {avatarProgress !== null ? (
            <ProgressBar progress={avatarProgress} label="Uploading photo" />
          ) : (
            <Text style={styles.change} onPress={changeAvatar}>
              Change photo
            </Text>
          )}

          <TextField
            label="Name"
            value={name}
            onChangeText={v => {
              setName(v);
              setErrors(x => ({...x, name: null}));
            }}
            onBlur={() => setErrors(x => ({...x, name: validators.name(name)}))}
            error={errors.name}
            maxLength={60}
          />
          <TextField
            label="Username"
            value={username}
            onChangeText={v => {
              setUsername(v.toLowerCase());
              setErrors(x => ({...x, username: null}));
            }}
            onBlur={() =>
              setErrors(x => ({...x, username: validators.username(username)}))
            }
            error={errors.username}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
          />
          <TextField
            label="Bio"
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={300}
            hint={`${bio.length}/300`}
            placeholder="Tell people what you study"
          />
          <UniversityField
            value={university}
            onChange={setUniversity}
            label="University"
          />
          <Text style={styles.label}>Role</Text>
          <View style={styles.roles}>
            {ROLES.map(r => (
              <Chip
                key={r.key}
                label={r.label}
                active={role === r.key}
                onPress={() => setRole(r.key)}
              />
            ))}
          </View>
          <FormError message={formError} />
        </ScrollView>
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
  avatarWrap: {alignSelf: 'center'},
  camera: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  change: {
    textAlign: 'center',
    color: colors.primary,
    fontWeight: weight.semibold,
    marginTop: spacing.sm,
  },
  label: {
    fontSize: font.sm,
    fontWeight: weight.semibold,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  roles: {flexDirection: 'row', flexWrap: 'wrap'},
});
