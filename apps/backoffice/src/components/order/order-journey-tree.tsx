'use client';

import Link from 'next/link';
import { Button } from '@flower/ui';
import {
  buildOrderJourney,
  buildJourneyStrip,
  journeyCurrentBranch,
  journeyNextAction,
  type OrderJourneyDelivery,
  type OrderJourneyInput,
  type OrderJourneyOrder,
  type OrderJourneySale,
  type JourneyBranch,
  type JourneyStepState,
} from '@/lib/order-journey';
import { OrderJourneyNextBanner, OrderJourneyStrip } from '@/components/order/order-journey-strip';

export type OrderJourneyTreeProps = {
  basePath: string;
  order: OrderJourneyOrder;
  delivery?: OrderJourneyDelivery | null;
  sale?: OrderJourneySale | null;
  compact?: boolean;
  title?: string;
  showNextBanner?: boolean;
  showStrip?: boolean;
  links?: OrderJourneyInput['links'];
  permissions?: OrderJourneyInput['permissions'];
};

function stepClass(state: JourneyStepState): string {
  return `order-journey__mini-step order-journey__mini-step--${state}`;
}

function branchClass(branch: JourneyBranch): string {
  return [
    'order-journey__branch',
    `order-journey__branch--${branch.branchState}`,
    branch.isCurrent ? 'order-journey__branch--current' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function BranchHeader({ branch }: { branch: JourneyBranch }) {
  const titleBlock = (
    <div className="order-journey__branch-title">
      <span className="order-journey__branch-name">{branch.title}</span>
      {branch.docNumber ? (
        <span className="order-journey__branch-doc">{branch.docNumber}</span>
      ) : null}
      <span className="order-journey__branch-status">{branch.statusText}</span>
    </div>
  );

  return (
    <div className="order-journey__branch-head">
      {branch.href ? (
        <Link href={branch.href} className="order-journey__branch-link">
          {titleBlock}
        </Link>
      ) : (
        titleBlock
      )}
      <div className="order-journey__branch-actions">
        {branch.actionHref && branch.actionLabel ? (
          <Link href={branch.actionHref}>
            <Button type="button" variant="secondary">
              {branch.actionLabel}
            </Button>
          </Link>
        ) : null}
        {branch.href ? (
          <Link href={branch.href}>
            <Button type="button" variant="ghost">
              Открыть
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function MiniSteps({ branch }: { branch: JourneyBranch }) {
  if (branch.branchState === 'skipped') {
    return <p className="order-journey__skipped">{branch.statusText}</p>;
  }
  return (
    <div className="order-journey__mini-steps" aria-label={`Этапы: ${branch.title}`}>
      {branch.steps.map((step) => (
        <span key={step.id} className={stepClass(step.state)} title={step.label}>
          {step.label}
        </span>
      ))}
    </div>
  );
}

export function OrderJourneyTree({
  basePath,
  order,
  delivery,
  sale,
  compact = false,
  title = 'Путь заказа',
  showNextBanner = true,
  showStrip = true,
  links,
  permissions,
}: OrderJourneyTreeProps) {
  const input: OrderJourneyInput = {
    basePath,
    order,
    delivery,
    sale,
    links,
    permissions,
  };
  const branches = buildOrderJourney(input);
  const current = journeyCurrentBranch(branches);
  const next = showNextBanner ? journeyNextAction(input) : null;
  const strip = showStrip ? buildJourneyStrip(input) : [];

  return (
    <section
      className={`order-journey${compact ? ' order-journey--compact' : ''}`}
      aria-label={title}
    >
      <div className="order-journey__header">
        <h2 className="order-journey__title">{title}</h2>
        {current ? (
          <p className="order-journey__hint">
            Сейчас: <strong>{current.title}</strong> — {current.statusText}
          </p>
        ) : null}
      </div>

      {strip.length > 0 ? <OrderJourneyStrip nodes={strip} /> : null}

      {next ? (
        <OrderJourneyNextBanner
          title={next.title}
          description={next.description}
          href={next.href}
          actionLabel={next.actionLabel}
        />
      ) : null}

      {!compact ? (
        <ol className="order-journey__tree">
          {branches.map((branch, index) => (
            <li key={branch.id} className={branchClass(branch)}>
              <div className="order-journey__connector" aria-hidden="true">
                <span className="order-journey__node" />
                {index < branches.length - 1 ? <span className="order-journey__line" /> : null}
              </div>
              <div className="order-journey__branch-body">
                <BranchHeader branch={branch} />
                <MiniSteps branch={branch} />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
