import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '@drop/tokens';
import { validateOtp } from '../auth/validation';
import { getSupabase } from '../supabase';
import { Button } from '../ui/Button';
import { OtpBoxes } from '../ui/OtpBoxes';

type Props = {
  theme: Theme;
  phone: string;
  onBack: () => void;
};

export function OtpScreen({ theme, phone, onBack }: Props) {
  const { colors } = theme;
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const invalid = validateOtp(code);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setFormError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });
    setLoading(false);
    if (error) setFormError(error.message);
  };

  const resend = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setFormError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) setFormError(error.message);
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
      <Text style={[styles.title, { color: colors.text }]}>Enter the code</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Verification code sent to {phone}
      </Text>
      <OtpBoxes theme={theme} value={code} onChange={setCode} />
      {formError ? <Text style={{ color: colors.danger }}>{formError}</Text> : null}
      <Pressable onPress={() => void resend()}>
        <Text style={{ color: colors.textSecondary }}>Resend code</Text>
      </Pressable>
      <Button theme={theme} label="Verify" onPress={() => void submit()} loading={loading} />
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
