import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Manrope, Source_Serif_4 } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { DevEnvironmentBanner } from '@/components/dev-environment-banner';
import { AppShell } from '@/components/shell/app-shell';
import { ErrorBoundary } from '@/components/error-boundary';
import { ThemeProvider } from '@/components/theme/theme-context';
import { ThemeScript } from '@/components/theme/theme-script';
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
    title: environment.showBanner ? `[${environment.badge}] Floro` : 'Floro',
    description: 'Floro — бэк-офис для флористов',
  };
}

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef2ec' },
    { media: '(prefers-color-scheme: dark)', color: '#151f1a' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const environment = getAppEnvironment();

  return (
    <html lang="ru" className={`${manrope.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={environment.showBanner ? 'has-dev-banner' : undefined}>
        <DevEnvironmentBanner environment={environment} />
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <AppShell environment={environment}>{children}</AppShell>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
