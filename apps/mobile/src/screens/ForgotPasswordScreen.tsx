import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '@drop/tokens';
import { isEmptyErrors, validateForgotForm, type FieldErrors } from '../auth/validation';
import { getSupabase } from '../supabase';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

type Props = {
  theme: Theme;
  onBack: () => void;
};

export function ForgotPasswordScreen({ theme, onBack }: Props) {
  const { colors } = theme;
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [info, setInfo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const next = validateForgotForm({ email });
    setErrors(next);
    setFormError(null);
    setInfo(null);
    if (!isEmptyErrors(next)) return;
    const supabase = getSupabase();
    if (!supabase) {
      setFormError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'drop://auth/callback',
    });
    setLoading(false);
    if (error) setFormError(error.message);
    else setInfo('If that email is registered, we sent a reset link.');
  };

  return (
    <View style={styles.content}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.back, { backgroundColor: colors.surface }]}
      >
        <Text style={{ color: colors.text, fontSize: 18 }}>←</Text>
      </Pressable>
      <Text style={[styles.title, { color: colors.text }]}>Forgot password?</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Enter the email on your account. We will send a reset link.
      </Text>
      <Field
        theme={theme}
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email}
      />
      {formError ? <Text style={{ color: colors.danger }}>{formError}</Text> : null}
      {info ? <Text style={{ color: colors.success }}>{info}</Text> : null}
      <Button theme={theme} label="Send reset email" onPress={() => void submit()} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
  sub: { fontSize: 15, lineHeight: 22 },
});
