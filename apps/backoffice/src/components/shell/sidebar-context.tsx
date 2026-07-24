'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'flower.sidebarExpanded';

type SidebarContextValue = {
  expanded: boolean;
  toggle: () => void;
  setExpanded: (value: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpandedState] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === '0') setExpandedState(false);
    if (stored === '1') setExpandedState(true);
    setReady(true);
  }, []);

  const setExpanded = useCallback((value: boolean) => {
    setExpandedState(value);
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  }, []);

  const toggle = useCallback(() => {
    setExpandedState((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ expanded: ready ? expanded : true, toggle, setExpanded }),
    [expanded, ready, setExpanded, toggle],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return ctx;
}
