import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Theme } from '@drop/tokens';
import { isPhoneOtpEnabled } from '../auth/flags';
import {
  isEmptyErrors,
  normalizeThaiPhone,
  validateLoginForm,
  validatePhoneContinue,
  type FieldErrors,
} from '../auth/validation';
import { getSupabase } from '../supabase';
import { Button } from '../ui/Button';
import { DropMark } from '../ui/DropMark';
import { Field } from '../ui/Field';

type Props = {
  theme: Theme;
  onSignUp: () => void;
  onForgot: () => void;
  onOtp: (phone: string) => void;
};

export function LoginScreen({ theme, onSignUp, onForgot, onOtp }: Props) {
  const { colors } = theme;
  const phoneOtp = isPhoneOtpEnabled();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitEmail = async () => {
    const next = validateLoginForm({ email, password });
    setErrors(next);
    setFormError(null);
    if (!isEmptyErrors(next)) return;
    const supabase = getSupabase();
    if (!supabase) {
      setFormError('Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and ANON_KEY.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) setFormError(error.message);
  };

  const submitPhone = async () => {
    const next = validatePhoneContinue({ phone });
    setErrors(next);
    setFormError(null);
    if (!isEmptyErrors(next)) return;
    const e164 = normalizeThaiPhone(phone);
    const supabase = getSupabase();
    if (!supabase || !e164) {
      setFormError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setLoading(false);
    if (error) setFormError(error.message);
    else onOtp(e164);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <DropMark theme={theme} />
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.text }]}>Welcome to Drop</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {phoneOtp
              ? "Enter your phone number to sign in. We'll text you a 6-digit code."
              : 'Sign in with the email you used to create your account.'}
          </Text>
        </View>

        {phoneOtp ? (
          <>
            <Field
              theme={theme}
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="812345678"
              error={errors.phone}
              autoComplete="tel"
            />
            <Button theme={theme} label="Continue" onPress={() => void submitPhone()} loading={loading} />
            <View style={styles.orRow}>
              <View style={[styles.orLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.or, { color: colors.textMuted }]}>or</Text>
              <View style={[styles.orLine, { backgroundColor: colors.border }]} />
            </View>
          </>
        ) : null}

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
        <Field
          theme={theme}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          placeholder="••••••••"
          error={errors.password}
        />
        <Pressable onPress={onForgot} accessibilityRole="link">
          <Text style={[styles.forgot, { color: colors.text }]}>Forgot password?</Text>
        </Pressable>
        <Button
          theme={theme}
          label={phoneOtp ? 'Sign in with email' : 'Continue'}
          onPress={() => void submitEmail()}
          loading={loading && !phoneOtp}
        />
        {formError ? <Text style={[styles.error, { color: colors.danger }]}>{formError}</Text> : null}

        <View style={styles.footer}>
          <Text style={{ color: colors.textSecondary }}>
            New to Drop?{' '}
            <Text onPress={onSignUp} style={[styles.link, { color: colors.text }]}>
              Create an account
            </Text>
          </Text>
          <Text style={[styles.legal, { color: colors.textMuted }]}>
            By continuing you agree to the Terms & Privacy Policy
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, gap: 16 },
  heading: { gap: 8, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
  sub: { fontSize: 15, lineHeight: 22 },
  forgot: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
  error: { fontSize: 13 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: 1 },
  or: { fontSize: 13 },
  footer: { alignItems: 'center', gap: 12, marginTop: 12 },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
  legal: { fontSize: 12, textAlign: 'center' },
});
