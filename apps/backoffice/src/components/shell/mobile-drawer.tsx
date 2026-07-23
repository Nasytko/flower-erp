'use client';

import { useEffect, useId, useRef } from 'react';
import { t } from '@/i18n/ru';
import { SidebarNav } from './sidebar-nav';

type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.classList.add('shell-scroll-locked');
    const timeout = window.setTimeout(() => closeRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
      if (event.key !== 'Tab') {
        return;
      }
      const drawer = document.getElementById('shell-mobile-drawer');
      if (!drawer) {
        return;
      }
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('shell-scroll-locked');
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className="shell-drawer-backdrop"
        data-open={open ? 'true' : 'false'}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id="shell-mobile-drawer"
        className="shell-drawer"
        data-open={open ? 'true' : 'false'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!open}
        // Prevent focus while closed (drawer stays mounted for exit transitions).
        {...(!open ? { inert: true } : {})}
      >
        <button
          ref={closeRef}
          type="button"
          className="shell-drawer__close"
          onClick={onClose}
          aria-label={t('closeNav')}
        >
          {t('close')}
        </button>
        <div id={titleId} className="shell__brand">
          {t('brand')}
        </div>
        <SidebarNav onNavigate={onClose} />
      </div>
    </>
  );
}
