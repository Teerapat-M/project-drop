import { describe, expect, it } from '@jest/globals';
import { nextAuthScreen, resolveAuthDestination } from './gate';
import { isPhoneOtpEnabled } from './flags';

describe('auth gate', () => {
  it('stays on loading until session is known', () => {
    expect(resolveAuthDestination({ ready: false, userId: null, role: null })).toBe(
      'loading',
    );
  });

  it('sends unauthenticated users to the auth stack', () => {
    expect(resolveAuthDestination({ ready: true, userId: null, role: null })).toBe(
      'auth',
    );
    expect(
      resolveAuthDestination({ ready: true, userId: null, role: 'rider' }),
    ).toBe('auth');
  });

  it('sends a signed-in user with no role to M04 role select', () => {
    expect(
      resolveAuthDestination({ ready: true, userId: 'u1', role: null }),
    ).toBe('role-select');
  });

  it('routes rider and driver to their modes', () => {
    expect(
      resolveAuthDestination({ ready: true, userId: 'u1', role: 'rider' }),
    ).toBe('rider');
    expect(
      resolveAuthDestination({ ready: true, userId: 'u1', role: 'driver' }),
    ).toBe('driver');
  });

  it('does not treat admin as a mobile mode', () => {
    expect(
      resolveAuthDestination({ ready: true, userId: 'u1', role: 'admin' }),
    ).toBe('role-select');
  });
});

describe('auth stack navigation', () => {
  it('opens signup, forgot, and otp from login and backs out', () => {
    expect(nextAuthScreen('login', 'signup')).toBe('signup');
    expect(nextAuthScreen('login', 'forgot')).toBe('forgot');
    expect(nextAuthScreen('login', 'otp')).toBe('otp');
    expect(nextAuthScreen('signup', 'back')).toBe('login');
    expect(nextAuthScreen('forgot', 'back')).toBe('login');
    expect(nextAuthScreen('otp', 'back')).toBe('login');
  });
});

describe('phone OTP flag', () => {
  it('defaults to false unless EXPO_PUBLIC_ENABLE_PHONE_OTP is the string true', () => {
    expect(isPhoneOtpEnabled(undefined)).toBe(false);
    expect(isPhoneOtpEnabled('')).toBe(false);
    expect(isPhoneOtpEnabled('false')).toBe(false);
    expect(isPhoneOtpEnabled('true')).toBe(true);
  });
});
