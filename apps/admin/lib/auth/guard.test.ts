import { describe, expect, it } from '@jest/globals';
import { adminRedirectPath, canAccessAdmin, resolveAdminGate } from './guard';

describe('admin role guard', () => {
  it('only admin may access the dashboard', () => {
    expect(canAccessAdmin('admin')).toBe(true);
    expect(canAccessAdmin('rider')).toBe(false);
    expect(canAccessAdmin('driver')).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
    expect(canAccessAdmin(undefined)).toBe(false);
  });

  it('sends anonymous users to login', () => {
    expect(resolveAdminGate({ userId: null, role: null })).toBe('login');
    expect(resolveAdminGate({ userId: null, role: 'admin' })).toBe('login');
    expect(adminRedirectPath('login')).toBe('/login');
  });

  it('sends authenticated non-admins to not-authorized', () => {
    expect(resolveAdminGate({ userId: 'u1', role: 'rider' })).toBe('not-authorized');
    expect(resolveAdminGate({ userId: 'u1', role: null })).toBe('not-authorized');
    expect(adminRedirectPath('not-authorized')).toBe('/not-authorized');
  });

  it('lets admins through', () => {
    expect(resolveAdminGate({ userId: 'u1', role: 'admin' })).toBe('dashboard');
    expect(adminRedirectPath('dashboard')).toBeNull();
  });
});
