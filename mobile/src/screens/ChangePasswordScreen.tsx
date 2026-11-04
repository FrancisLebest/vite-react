import React, {useState} from 'react';
import {Alert} from 'react-native';
import {api, isApiError} from '../api';
import {PillButton, TextField} from '../components/ui';
import type {RootScreenProps} from '../navigation/types';
import {Errors, hasErrors, validators} from '../utils/validation';
import {AuthLayout, FormError, useAuthStyles} from './auth/AuthLayout';

type Field = 'current' | 'next' | 'confirm';

export default function ChangePasswordScreen({
  navigation,
}: RootScreenProps<'ChangePassword'>) {
  const authStyles = useAuthStyles();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e: Errors<Field> = {
      current: current ? null : 'Enter your current password.',
      next: validators.password(next),
      confirm: confirm === next ? null : 'Passwords do not match.',
    };
    setErrors(e);
    setFormError(null);
    if (hasErrors(e)) {
      return;
    }
    setLoading(true);
    try {
      await api.auth.changePassword(current, next);
      Alert.alert('Password changed', 'Your password has been updated.');
      navigation.goBack();
    } catch (err) {
      setLoading(false);
      if (isApiError(err) && err.fields.currentPassword) {
        setErrors(x => ({...x, current: 'Current password is incorrect.'}));
      } else {
        setFormError(
          isApiError(err) ? err.message : 'Could not change password.',
        );
      }
    }
  };

  return (
    <AuthLayout title="Change password" subtitle="Use at least 8 characters.">
      <TextField
        label="Current password"
        value={current}
        onChangeText={v => {
          setCurrent(v);
          setErrors(x => ({...x, current: null}));
        }}
        error={errors.current}
        secure
        textContentType="password"
      />
      <TextField
        label="New password"
        value={next}
        onChangeText={v => {
          setNext(v);
          setErrors(x => ({...x, next: null}));
        }}
        onBlur={() => setErrors(x => ({...x, next: validators.password(next)}))}
        error={errors.next}
        secure
        textContentType="newPassword"
      />
      <TextField
        label="Confirm new password"
        value={confirm}
        onChangeText={v => {
          setConfirm(v);
          setErrors(x => ({...x, confirm: null}));
        }}
        error={errors.confirm}
        secure
        textContentType="newPassword"
        onSubmitEditing={submit}
      />
      <FormError message={formError} />
      <PillButton
        title="Update password"
        loading={loading}
        onPress={submit}
        style={authStyles.submit}
      />
    </AuthLayout>
  );
}
