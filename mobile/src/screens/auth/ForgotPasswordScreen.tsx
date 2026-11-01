import React, {useState} from 'react';
import {errorMessage} from '../../api';
import {api} from '../../api';
import {PillButton, TextField} from '../../components/ui';
import type {RootScreenProps} from '../../navigation/types';
import {validators} from '../../utils/validation';
import {AuthLayout, FormError, authStyles} from './AuthLayout';

export default function ForgotPasswordScreen({
  navigation,
  route,
}: RootScreenProps<'ForgotPassword'>) {
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e = validators.email(email);
    setError(e);
    setFormError(null);
    if (e) {
      return;
    }
    setLoading(true);
    try {
      await api.auth.forgotPassword(email.trim().toLowerCase());
      navigation.navigate('ResetPassword', {email: email.trim().toLowerCase()});
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Enter your account email. We'll send you a 6-digit code.">
      <TextField
        label="Email"
        value={email}
        onChangeText={v => {
          setEmail(v);
          setError(null);
        }}
        onBlur={() => setError(validators.email(email))}
        error={error}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      <FormError message={formError} />
      <PillButton
        title="Send code"
        onPress={submit}
        loading={loading}
        style={authStyles.submit}
      />
    </AuthLayout>
  );
}
