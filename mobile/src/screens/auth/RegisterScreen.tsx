import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {isApiError} from '../../api';
import type {Role} from '../../api/types';
import {useAuth} from '../../auth/AuthContext';
import {UniversityField} from '../../components/UniversityField';
import {Chip, PillButton, TextField} from '../../components/ui';
import {ROLES} from '../../constants/categories';
import type {RootScreenProps} from '../../navigation/types';
import {colors, font, spacing, weight} from '../../theme';
import {Errors, hasErrors, validators} from '../../utils/validation';
import {AuthLayout, FormError, authStyles} from './AuthLayout';

type Field = 'name' | 'username' | 'email' | 'password';

export default function RegisterScreen({
  navigation,
}: RootScreenProps<'Register'>) {
  const {register} = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [university, setUniversity] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [errors, setErrors] = useState<Errors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const values: Record<Field, string> = {name, username, email, password};
  const check = (f: Field, v = values[f]) => validators[f](v);
  const blur = (f: Field) => () => setErrors(e => ({...e, [f]: check(f)}));
  const change = (f: Field, set: (v: string) => void) => (v: string) => {
    set(v);
    setErrors(e => ({...e, [f]: null}));
  };

  const submit = async () => {
    const e: Errors<Field> = {
      name: check('name'),
      username: check('username'),
      email: check('email'),
      password: check('password'),
    };
    setErrors(e);
    setFormError(null);
    if (hasErrors(e)) {
      return;
    }
    setLoading(true);
    try {
      await register({
        name: name.trim(),
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        university: university.trim() || undefined,
        role,
      });
    } catch (err) {
      setLoading(false);
      if (isApiError(err)) {
        const fields = err.fields;
        if (Object.keys(fields).length) {
          setErrors(prev => ({...prev, ...fields}));
        }
        setFormError(
          Object.keys(fields).length
            ? null
            : err.code === 'CONFLICT'
            ? 'This email or username is already taken.'
            : err.message,
        );
      } else {
        setFormError('Sign up failed. Please try again.');
      }
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join students from your university.">
      <TextField
        label="Full name"
        value={name}
        onChangeText={change('name', setName)}
        onBlur={blur('name')}
        error={errors.name}
        textContentType="name"
        autoCapitalize="words"
      />
      <TextField
        label="Username"
        value={username}
        onChangeText={change('username', v => setUsername(v.toLowerCase()))}
        onBlur={blur('username')}
        error={errors.username}
        autoCapitalize="none"
        autoCorrect={false}
        hint="Lowercase letters, numbers, dots and underscores."
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={change('email', setEmail)}
        onBlur={blur('email')}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={change('password', setPassword)}
        onBlur={blur('password')}
        error={errors.password}
        secure
        textContentType="newPassword"
        hint="At least 8 characters."
      />
      <UniversityField value={university} onChange={setUniversity} />
      <Text style={styles.label}>I am a…</Text>
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
      <PillButton
        title="Create account"
        onPress={submit}
        loading={loading}
        style={authStyles.submit}
      />
      <View style={authStyles.linkRow}>
        <Text style={authStyles.linkMuted}>Already registered? </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => navigation.replace('Login')}>
          <Text style={authStyles.link}>Sign in</Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: font.sm,
    fontWeight: weight.semibold,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  roles: {flexDirection: 'row', flexWrap: 'wrap'},
});
