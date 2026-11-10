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
  validateSignUpForm,
  type FieldErrors,
} from '../auth/validation';
import { getSupabase } from '../supabase';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

type Props = {
  theme: Theme;
  onBack: () => void;
};

export function SignUpScreen({ theme, onBack }: Props) {
  const { colors } = theme;
  const requirePhone = isPhoneOtpEnabled();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [info, setInfo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const next = validateSignUpForm({
      fullName,
      email,
      password,
      acceptedTerms: accepted,
      phone,
      requirePhone,
    });
    setErrors(next);
    setFormError(null);
    setInfo(null);
    if (!isEmptyErrors(next)) return;
    const supabase = getSupabase();
    if (!supabase) {
      setFormError('Supabase is not configured.');
      return;
    }
    const e164 = phone.trim() ? normalizeThaiPhone(phone) : null;
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          phone: e164 ?? undefined,
        },
      },
    });
    if (!error && data.user && e164) {
      await supabase.from('profiles').update({ phone: e164, full_name: fullName.trim() }).eq('id', data.user.id);
    }
    setLoading(false);
    if (error) setFormError(error.message);
    else if (!data.session) setInfo('Check your email to confirm your account, then sign in.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.back, { backgroundColor: colors.surface }]}
        >
          <Text style={{ color: colors.text, fontSize: 18 }}>←</Text>
        </Pressable>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.text }]}>Create your account</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Ride across Bangkok in minutes.
          </Text>
        </View>
        <Field
          theme={theme}
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          autoComplete="name"
          placeholder="Ploy Srisuk"
          error={errors.fullName}
        />
        {requirePhone ? (
          <Field
            theme={theme}
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+66 81 234 5678"
            error={errors.phone}
          />
        ) : null}
        <Field
          theme={theme}
          label={requirePhone ? 'Email (optional)' : 'Email'}
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
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={errors.password}
        />
        <Pressable
          onPress={() => setAccepted((v) => !v)}
          style={styles.terms}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <View
            style={[
              styles.check,
              {
                backgroundColor: accepted ? colors.primary : colors.surface,
                borderColor: accepted ? colors.primary : colors.border,
              },
            ]}
          >
            {accepted ? <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>✓</Text> : null}
          </View>
          <Text style={{ color: colors.textSecondary, flex: 1, fontSize: 14, lineHeight: 20 }}>
            I agree to Drop Terms of Service and Privacy Policy
          </Text>
        </Pressable>
        {errors.terms ? <Text style={{ color: colors.danger }}>{errors.terms}</Text> : null}
        {formError ? <Text style={{ color: colors.danger }}>{formError}</Text> : null}
        {info ? <Text style={{ color: colors.success }}>{info}</Text> : null}
        <Button theme={theme} label="Create account" onPress={() => void submit()} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 16 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { gap: 8 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
  sub: { fontSize: 15, lineHeight: 22 },
  terms: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
