import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { adminCssVars } from '@/lib/theme';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Drop Admin',
  description: 'Drop operations dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={plusJakarta.className} style={adminCssVars() as CSSProperties}>
        {children}
      </body>
    </html>
  );
}
