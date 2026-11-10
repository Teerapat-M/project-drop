import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { adminCssVars } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Drop Admin',
  description: 'Drop operations dashboard (placeholder)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={adminCssVars() as CSSProperties}>{children}</body>
    </html>
  );
}
