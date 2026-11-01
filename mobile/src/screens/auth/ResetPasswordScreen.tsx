import React, {useState} from 'react';
import {Alert, Pressable, Text, View} from 'react-native';
import {api, errorMessage, isApiError} from '../../api';
import {PillButton, TextField} from '../../components/ui';
import type {RootScreenProps} from '../../navigation/types';
import {Errors, hasErrors, validators} from '../../utils/validation';
import {AuthLayout, FormError, authStyles} from './AuthLayout';

type Field = 'code' | 'password' | 'confirm';

export default function ResetPasswordScreen({
  navigation,
  route,
}: RootScreenProps<'ResetPassword'>) {
  const {email} = route.params;
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e: Errors<Field> = {
      code: validators.code(code),
      password: validators.password(password),
      confirm: confirm === password ? null : 'Passwords do not match.',
    };
    setErrors(e);
    setFormError(null);
    if (hasErrors(e)) {
      return;
    }
    setLoading(true);
    try {
      await api.auth.resetPassword(email, code.trim(), password);
      Alert.alert(
        'Password updated',
        'You can now sign in with your new password.',
      );
      navigation.reset({
        index: 1,
        routes: [{name: 'Welcome'}, {name: 'Login'}],
      });
    } catch (err) {
      setLoading(false);
      setFormError(
        isApiError(err) &&
          (err.code === 'VALIDATION_ERROR' || err.status === 400)
          ? 'This code is invalid or has expired.'
          : errorMessage(err),
      );
    }
  };

  const resend = () =>
    api.auth
      .forgotPassword(email)
      .then(() => Alert.alert('Code sent', `A new code was sent to ${email}.`))
      .catch(e => Alert.alert('Error', errorMessage(e)));

  return (
    <AuthLayout
      title="Reset password"
      subtitle={`Enter the code sent to ${email}.`}>
      <TextField
        label="6-digit code"
        value={code}
        onChangeText={v => {
          setCode(v.replace(/\D/g, '').slice(0, 6));
          setErrors(e => ({...e, code: null}));
        }}
        error={errors.code}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        maxLength={6}
      />
      <TextField
        label="New password"
        value={password}
        onChangeText={v => {
          setPassword(v);
          setErrors(e => ({...e, password: null}));
        }}
        onBlur={() =>
          setErrors(e => ({...e, password: validators.password(password)}))
        }
        error={errors.password}
        secure
        textContentType="newPassword"
      />
      <TextField
        label="Confirm new password"
        value={confirm}
        onChangeText={v => {
          setConfirm(v);
          setErrors(e => ({...e, confirm: null}));
        }}
        error={errors.confirm}
        secure
        textContentType="newPassword"
        onSubmitEditing={submit}
      />
      <FormError message={formError} />
      <PillButton
        title="Update password"
        onPress={submit}
        loading={loading}
        style={authStyles.submit}
      />
      <View style={authStyles.linkRow}>
        <Text style={authStyles.linkMuted}>Didn't get it? </Text>
        <Pressable accessibilityRole="link" onPress={resend}>
          <Text style={authStyles.link}>Resend code</Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}
