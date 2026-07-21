import type { ReactNode } from 'react';
import { AppShell as ProductShell } from './shell/app-shell';

/** Product shell wrapper used by the root layout. */
export function AppShell({ children }: { children: ReactNode }) {
  return <ProductShell>{children}</ProductShell>;
}
