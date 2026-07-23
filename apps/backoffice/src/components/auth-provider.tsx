'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getApiClient, resetApiClient } from '@/lib/api-client';
import { clearAccessToken, getAccessToken, setAccessToken } from '@/lib/auth-session';
import { resolveStoreHomePath } from '@/lib/nav';
import { clearLastWorkspace, setLastWorkspace } from '@/lib/workspace-context';

type AuthState = {
  loading: boolean;
  user: { displayName: string; login: string } | null;
  organization: { id: string; name: string } | null;
  permissions: string[];
};

type AuthContextValue = AuthState & {
  login: (login: string, password: string, organizationId?: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (code: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolvePostAuthPath(
  organizationId: string,
  permissions: string[],
): Promise<string> {
  const hasPermission = (code: string) => permissions.includes(code);
  try {
    const stores = await getApiClient().listStores(organizationId, 1, 1);
    const first = stores.items[0];
    if (!first) return '/organizations';
    setLastWorkspace({
      organizationId,
      storeId: first.id,
      storeName: first.name,
    });
    return resolveStoreHomePath(organizationId, first.id, hasPermission);
  } catch {
    return '/organizations';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>({
    loading: true,
    user: null,
    organization: null,
    permissions: [],
  });

  const bootstrap = useCallback(async () => {
    const api = getApiClient();
    try {
      if (!getAccessToken()) {
        const refreshed = await api.refresh();
        setAccessToken(refreshed.accessToken);
      }
      const me = await api.me();
      setState({
        loading: false,
        user: { displayName: me.user.displayName, login: me.user.login },
        organization: me.organization,
        permissions: me.permissions,
      });
    } catch {
      clearAccessToken();
      resetApiClient();
      setState({ loading: false, user: null, organization: null, permissions: [] });
      if (pathname !== '/login') {
        router.replace('/login');
      }
    }
  }, [pathname, router]);

  useEffect(() => {
    if (pathname === '/login') {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    void bootstrap();
  }, [bootstrap, pathname]);

  const login = useCallback(
    async (loginValue: string, password: string, organizationId?: string) => {
      const api = getApiClient();
      const result = await api.login({ login: loginValue, password, organizationId });
      setAccessToken(result.accessToken);
      setState({
        loading: false,
        user: { displayName: result.user.displayName, login: result.user.login },
        organization: result.organization,
        permissions: result.permissions,
      });
      const target = await resolvePostAuthPath(result.organization.id, result.permissions);
      router.replace(target);
    },
    [router],
  );

  const logout = useCallback(async () => {
    try {
      await getApiClient().logout();
    } finally {
      clearAccessToken();
      resetApiClient();
      clearLastWorkspace();
      setState({ loading: false, user: null, organization: null, permissions: [] });
      router.replace('/login');
    }
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      hasPermission: (code) => state.permissions.includes(code),
    }),
    [state, login, logout],
  );

  if (state.loading && pathname !== '/login') {
    return <div className="page-state">Загрузка сессии…</div>;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
