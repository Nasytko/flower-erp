'use client';

import Link from 'next/link';
import { Card } from '@flower/ui';

type SettingsLink = {
  href: string;
  label: string;
  description: string;
};

type SettingsLinksProps = {
  links: SettingsLink[];
  title?: string;
};

export function SettingsLinks({ links, title = 'Разделы настроек' }: SettingsLinksProps) {
  if (links.length === 0) return null;
  return (
    <Card title={title}>
      <ul className="settings-links">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="settings-links__item">
              <strong>{link.label}</strong>
              <span>{link.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
