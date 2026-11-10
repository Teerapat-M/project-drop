import { isAppRole, type Role } from '@drop/types';

export type AuthDestination = 'loading' | 'auth' | 'role-select' | 'rider' | 'driver';

export type AuthGateInput = {
  ready: boolean;
  userId: string | null;
  role: Role | null;
};

/**
 * Unauthenticated → auth stack.
 * Signed in with no rider/driver role → M04 role select.
 * Otherwise the matching mode. Admin on mobile is treated as no app role
 * (they use the admin dashboard); they still see role-select if they open the app.
 */
export function resolveAuthDestination(input: AuthGateInput): AuthDestination {
  if (!input.ready) return 'loading';
  if (!input.userId) return 'auth';
  if (isAppRole(input.role)) return input.role;
  return 'role-select';
}

export type AuthScreen = 'login' | 'signup' | 'forgot' | 'otp';

export function nextAuthScreen(
  current: AuthScreen,
  action: 'signup' | 'login' | 'forgot' | 'otp' | 'back',
): AuthScreen {
  if (action === 'back') {
    if (current === 'otp') return 'login';
    if (current === 'forgot') return 'login';
    if (current === 'signup') return 'login';
    return 'login';
  }
  return action;
}
