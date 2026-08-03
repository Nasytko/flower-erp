'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getApiClient, resetApiClient } from '@/lib/api-client';
import { clearAccessToken, getAccessToken, setAccessToken } from '@/lib/auth-session';
import { resolveStoreHomePath } from '@/lib/nav';
import { clearLastWorkspace, setLastWorkspace } from '@/lib/workspace-context';

type AuthUser = {
  displayName: string;
  login: string;
  mustChangePassword: boolean;
};

type AuthState = {
  loading: boolean;
  user: AuthUser | null;
  organization: { id: string; name: string } | null;
  permissions: string[];
  totpEnabled: boolean;
};

type AuthContextValue = AuthState & {
  login: (
    login: string,
    password: string,
    totpCode?: string,
    organizationId?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  completePasswordChange: () => Promise<void>;
  hasPermission: (code: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = new Set(['/login', '/change-password']);

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
    totpEnabled: false,
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
        user: {
          displayName: me.user.displayName,
          login: me.user.login,
          mustChangePassword: me.user.mustChangePassword,
        },
        organization: me.organization,
        permissions: me.permissions,
        totpEnabled: me.totpEnabled,
      });
      if (me.user.mustChangePassword && pathname !== '/change-password') {
        router.replace('/change-password');
      }
    } catch {
      clearAccessToken();
      resetApiClient();
      setState({ loading: false, user: null, organization: null, permissions: [], totpEnabled: false });
      if (!PUBLIC_PATHS.has(pathname)) {
        router.replace('/login');
      }
    }
  }, [pathname, router]);

  useEffect(() => {
    if (pathname === '/login') {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    if (pathname === '/change-password') {
      void bootstrap();
      return;
    }
    void bootstrap();
  }, [bootstrap, pathname]);

  const login = useCallback(
    async (loginValue: string, password: string, totpCode?: string, organizationId?: string) => {
      const api = getApiClient();
      const result = await api.login({
        login: loginValue,
        password,
        ...(totpCode ? { totpCode } : {}),
        organizationId,
      });
      setAccessToken(result.accessToken);
      const user = {
        displayName: result.user.displayName,
        login: result.user.login,
        mustChangePassword: result.user.mustChangePassword,
      };
      setState({
        loading: false,
        user,
        organization: result.organization,
        permissions: result.permissions,
        totpEnabled: result.totpEnabled,
      });
      if (result.user.mustChangePassword) {
        router.replace('/change-password');
        return;
      }
      const target = await resolvePostAuthPath(result.organization.id, result.permissions);
      router.replace(target);
    },
    [router],
  );

  const completePasswordChange = useCallback(async () => {
    setState((current) =>
      current.user
        ? {
            ...current,
            user: { ...current.user, mustChangePassword: false },
          }
        : current,
    );
  }, []);

  const logout = useCallback(async () => {
    try {
      await getApiClient().logout();
    } finally {
      clearAccessToken();
      resetApiClient();
      clearLastWorkspace();
      setState({ loading: false, user: null, organization: null, permissions: [], totpEnabled: false });
      router.replace('/login');
    }
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      completePasswordChange,
      hasPermission: (code) => state.permissions.includes(code),
    }),
    [state, login, logout, completePasswordChange],
  );

  if (state.loading && !PUBLIC_PATHS.has(pathname)) {
    return <div className="page-state">Загрузка сессии…</div>;
  }

  if (
    state.user?.mustChangePassword &&
    pathname !== '/change-password' &&
    pathname !== '/login'
  ) {
    return <div className="page-state">Перенаправление на смену пароля…</div>;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
