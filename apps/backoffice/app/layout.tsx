import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Manrope, Source_Serif_4 } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { AppShell } from '@/components/app-shell';
import { ErrorBoundary } from '@/components/error-boundary';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-manrope',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-source-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Flower ERP',
  description: 'Бэк-офис Flower ERP',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${manrope.variable} ${sourceSerif.variable}`}>
      <body>
        <ErrorBoundary>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
