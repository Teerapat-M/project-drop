import type { Role } from '@drop/types';

export type AdminGate = 'login' | 'not-authorized' | 'dashboard';

export type AdminGateInput = {
  userId: string | null;
  role: Role | null;
  /** When false, never open the dashboard (missing Supabase env). */
  configured?: boolean;
};

export function canAccessAdmin(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function resolveAdminGate(input: AdminGateInput): AdminGate {
  if (input.configured === false) return 'login';
  if (!input.userId) return 'login';
  if (canAccessAdmin(input.role)) return 'dashboard';
  return 'not-authorized';
}

export function adminRedirectPath(gate: AdminGate): '/login' | '/not-authorized' | null {
  if (gate === 'login') return '/login';
  if (gate === 'not-authorized') return '/not-authorized';
  return null;
}
