import type { ReactNode } from 'react';

/** Login route uses root AuthProvider only — no AppShell chrome. */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
