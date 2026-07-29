'use client';

import Link from 'next/link';
import type { JourneyStripNode } from '@/lib/order-journey';

export type OrderJourneyStripProps = {
  nodes: JourneyStripNode[];
  className?: string;
};

function nodeClass(node: JourneyStripNode): string {
  return [
    'order-journey-strip__node',
    `order-journey-strip__node--${node.state}`,
    node.isCurrent ? 'order-journey-strip__node--current' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function OrderJourneyStrip({ nodes, className }: OrderJourneyStripProps) {
  if (nodes.length === 0) return null;
  return (
    <div
      className={['order-journey-strip', className].filter(Boolean).join(' ')}
      aria-label="Путь заказа"
      role="list"
    >
      {nodes.map((node, index) => (
        <div key={node.id} className="order-journey-strip__item" role="listitem">
          <span className={nodeClass(node)}>
            <span className="order-journey-strip__dot" aria-hidden="true" />
            <span className="order-journey-strip__label">{node.shortLabel}</span>
          </span>
          {index < nodes.length - 1 ? (
            <span
              className={`order-journey-strip__arrow order-journey-strip__arrow--${node.state === 'done' ? 'done' : 'pending'}`}
              aria-hidden="true"
            >
              →
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export type OrderJourneyNextBannerProps = {
  title: string;
  description?: string;
  href: string;
  actionLabel: string;
};

export function OrderJourneyNextBanner({
  title,
  description,
  href,
  actionLabel,
}: OrderJourneyNextBannerProps) {
  return (
    <div className="order-journey-next">
      <div className="order-journey-next__text">
        <span className="order-journey-next__eyebrow">Дальше</span>
        <strong className="order-journey-next__title">{title}</strong>
        {description ? <p className="order-journey-next__desc">{description}</p> : null}
      </div>
      <Link href={href} className="order-journey-next__link">
        {actionLabel}
      </Link>
    </div>
  );
}
