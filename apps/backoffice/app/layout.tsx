import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Manrope, Source_Serif_4 } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { DevEnvironmentBanner } from '@/components/dev-environment-banner';
import { AppShell } from '@/components/shell/app-shell';
import { ErrorBoundary } from '@/components/error-boundary';
import { getAppEnvironment } from '@/lib/app-environment';
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

export function generateMetadata(): Metadata {
  const environment = getAppEnvironment();
  return {
    title: environment.showBanner ? `[${environment.badge}] Flower ERP` : 'Flower ERP',
    description: 'Бэк-офис Flower ERP',
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const environment = getAppEnvironment();

  return (
    <html lang="ru" className={`${manrope.variable} ${sourceSerif.variable}`}>
      <body className={environment.showBanner ? 'has-dev-banner' : undefined}>
        <DevEnvironmentBanner environment={environment} />
        <ErrorBoundary>
          <AuthProvider>
            <AppShell environment={environment}>{children}</AppShell>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
