export const ROLES = ['rider', 'driver', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Roles a mobile user may self-assign. Admin is dashboard-only. */
export const APP_ROLES = ['rider', 'driver'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type Profile = {
  id: string;
  role: Role | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

/** GET /me — Express, after a verified Supabase JWT. */
export type MeResponse = {
  id: string;
  role: Role | null;
};

export function isRole(value: unknown): value is Role {
  return value === 'rider' || value === 'driver' || value === 'admin';
}

export function isAppRole(value: unknown): value is AppRole {
  return value === 'rider' || value === 'driver';
}
