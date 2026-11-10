import { SignOutButton } from './SignOutButton';

export const dynamic = 'force-dynamic';

export default function NotAuthorizedPage() {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '80px 24px' }}>
      <p
        style={{
          display: 'inline-block',
          margin: 0,
          padding: '6px 10px',
          background: 'var(--drop-primary)',
          color: 'var(--drop-on-primary)',
          fontWeight: 700,
          borderRadius: 8,
        }}
      >
        Drop
      </p>
      <h1 style={{ fontSize: 32, margin: '16px 0 8px' }}>Not authorized</h1>
      <p style={{ color: 'var(--drop-muted)', lineHeight: 1.5 }}>
        This account is signed in but does not have the admin role. Rider and driver
        accounts use the mobile app. Ask Bell to set <code>profiles.role = admin</code>{' '}
        for staff.
      </p>
      <SignOutButton />
    </main>
  );
}
