import { describe, expect, it } from '@jest/globals';
import {
  isEmptyErrors,
  normalizeThaiPhone,
  validateForgotForm,
  validateLoginForm,
  validateOtp,
  validatePhoneContinue,
  validateSignUpForm,
} from './validation';

describe('login form', () => {
  it('rejects empty or malformed email and empty password', () => {
    expect(validateLoginForm({ email: '', password: '' })).toEqual({
      email: 'Enter your email',
      password: 'Enter your password',
    });
    expect(validateLoginForm({ email: 'not-an-email', password: 'x' }).email).toBe(
      'Enter a valid email',
    );
  });

  it('accepts a filled login', () => {
    expect(
      isEmptyErrors(validateLoginForm({ email: 'bell@drop.co.th', password: 'secret' })),
    ).toBe(true);
  });
});

describe('sign up form', () => {
  const base = {
    fullName: 'Ploy Srisuk',
    email: 'ploy@example.com',
    password: 'password1',
    acceptedTerms: true,
  };

  it('requires name, email, password length, and terms', () => {
    const errors = validateSignUpForm({
      fullName: 'P',
      email: '',
      password: 'short',
      acceptedTerms: false,
    });
    expect(errors.fullName).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.password).toMatch(/8/);
    expect(errors.terms).toBeTruthy();
  });

  it('accepts a complete email sign up', () => {
    expect(isEmptyErrors(validateSignUpForm(base))).toBe(true);
  });

  it('requires a valid phone when requirePhone is set', () => {
    expect(validateSignUpForm({ ...base, requirePhone: true }).phone).toBeTruthy();
    expect(
      isEmptyErrors(
        validateSignUpForm({ ...base, requirePhone: true, phone: '0812345678' }),
      ),
    ).toBe(true);
  });
});

describe('forgot + phone + otp', () => {
  it('validates forgot-password email', () => {
    expect(validateForgotForm({ email: '' }).email).toBeTruthy();
    expect(isEmptyErrors(validateForgotForm({ email: 'a@b.co' }))).toBe(true);
  });

  it('normalizes Thai numbers to +66 E.164', () => {
    expect(normalizeThaiPhone('0812345678')).toBe('+66812345678');
    expect(normalizeThaiPhone('+66 81 234 5678')).toBe('+66812345678');
    expect(normalizeThaiPhone('66812345678')).toBe('+66812345678');
    expect(normalizeThaiPhone('123')).toBeNull();
  });

  it('validates phone continue and 6-digit OTP', () => {
    expect(validatePhoneContinue({ phone: '0812345678' })).toEqual({});
    expect(validateOtp('482901')).toBeNull();
    expect(validateOtp('12')).toBeTruthy();
  });
});
