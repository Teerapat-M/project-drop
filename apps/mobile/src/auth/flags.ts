/** Phone OTP needs an SMS provider on the Supabase project. Off until Bell enables one. */
export function isPhoneOtpEnabled(
  value: string | undefined = process.env.EXPO_PUBLIC_ENABLE_PHONE_OTP,
): boolean {
  return value === 'true';
}
