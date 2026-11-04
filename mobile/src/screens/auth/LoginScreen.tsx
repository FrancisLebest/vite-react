import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {isApiError} from '../../api';
import {useAuth} from '../../auth/AuthContext';
import {PillButton, TextField} from '../../components/ui';
import type {RootScreenProps} from '../../navigation/types';
import {Errors, hasErrors, validators} from '../../utils/validation';
import {AuthLayout, FormError, useAuthStyles} from './AuthLayout';

type Field = 'identifier' | 'password';

export default function LoginScreen({navigation}: RootScreenProps<'Login'>) {
  const authStyles = useAuthStyles();
  const {login} = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = (): Errors<Field> => ({
    identifier: validators.required(identifier, 'Email or username'),
    password: password ? null : 'Password is required.',
  });

  const submit = async () => {
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (hasErrors(e)) {
      return;
    }
    setLoading(true);
    try {
      await login(identifier, password);
    } catch (err) {
      setLoading(false);
      if (isApiError(err) && err.status === 401) {
        setFormError('Incorrect email/username or password.');
      } else {
        setFormError(isApiError(err) ? err.message : 'Sign in failed.');
      }
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue learning.">
      <TextField
        label="Email or username"
        value={identifier}
        onChangeText={v => {
          setIdentifier(v);
          setErrors(e => ({...e, identifier: null}));
        }}
        onBlur={() =>
          setErrors(e => ({...e, identifier: validate().identifier}))
        }
        error={errors.identifier}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={v => {
          setPassword(v);
          setErrors(e => ({...e, password: null}));
        }}
        error={errors.password}
        secure
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Pressable
        style={authStyles.right}
        accessibilityRole="link"
        onPress={() =>
          navigation.navigate('ForgotPassword', {
            email: identifier.includes('@') ? identifier.trim() : undefined,
          })
        }>
        <Text style={authStyles.link}>Forgot password?</Text>
      </Pressable>
      <FormError message={formError} />
      <PillButton
        title="Sign in"
        onPress={submit}
        loading={loading}
        style={authStyles.submit}
      />
      <View style={authStyles.linkRow}>
        <Text style={authStyles.linkMuted}>New to StudyHub? </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => navigation.replace('Register')}>
          <Text style={authStyles.link}>Create an account</Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}
