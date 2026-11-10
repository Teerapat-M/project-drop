export const MIN_PASSWORD_LENGTH = 8;

export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return 'Enter your email';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email';
  return null;
}

export function validatePassword(value: string, { create }: { create?: boolean } = {}): string | null {
  if (!value) return 'Enter your password';
  if (create && value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export function validateFullName(value: string): string | null {
  const name = value.trim();
  if (!name) return 'Enter your name';
  if (name.length < 2) return 'Enter your full name';
  return null;
}

/** Accepts local 0xx, +66, or 66. Returns E.164 (+66…) or null if invalid. */
export function normalizeThaiPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  let national = digits;
  if (digits.startsWith('66')) national = digits.slice(2);
  else if (digits.startsWith('0')) national = digits.slice(1);
  if (national.length < 8 || national.length > 10) return null;
  return `+66${national}`;
}

export function validatePhone(value: string): string | null {
  if (!value.trim()) return 'Enter your phone number';
  if (!normalizeThaiPhone(value)) return 'Enter a valid +66 phone number';
  return null;
}

export function validateOtp(value: string): string | null {
  const code = value.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return 'Enter the 6-digit code';
  return null;
}

export function validateLoginForm(input: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = validateEmail(input.email);
  const password = validatePassword(input.password);
  if (email) errors.email = email;
  if (password) errors.password = password;
  return errors;
}

export function validateSignUpForm(input: {
  fullName: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
  phone?: string;
  requirePhone?: boolean;
}): FieldErrors {
  const errors: FieldErrors = {};
  const name = validateFullName(input.fullName);
  const email = validateEmail(input.email);
  const password = validatePassword(input.password, { create: true });
  if (name) errors.fullName = name;
  if (email) errors.email = email;
  if (password) errors.password = password;
  if (!input.acceptedTerms) errors.terms = 'Agree to the Terms to continue';
  if (input.requirePhone) {
    const phone = validatePhone(input.phone ?? '');
    if (phone) errors.phone = phone;
  } else if (input.phone && input.phone.trim()) {
    const phone = validatePhone(input.phone);
    if (phone) errors.phone = phone;
  }
  return errors;
}

export function validateForgotForm(input: { email: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  return errors;
}

export function validatePhoneContinue(input: { phone: string }): FieldErrors {
  const errors: FieldErrors = {};
  const phone = validatePhone(input.phone);
  if (phone) errors.phone = phone;
  return errors;
}

export function isEmptyErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length === 0;
}
