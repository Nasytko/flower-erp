export type SupplyWorkflowStep = 1 | 2 | 3;

const STEPS: Array<{ n: SupplyWorkflowStep; label: string; hint: string }> = [
  { n: 1, label: 'Шапка', hint: 'Поставщик и даты' },
  { n: 2, label: 'Товары', hint: 'Кол-во и себестоимость' },
  { n: 3, label: 'Склад', hint: 'Провести приёмку' },
];

export function SupplyWorkflowSteps({ current }: { current: SupplyWorkflowStep }) {
  return (
    <ol className="supply-workflow-steps" aria-label="Шаги приёмки">
      {STEPS.map((step) => {
        const state =
          step.n === current ? 'current' : step.n < current ? 'done' : 'upcoming';
        return (
          <li key={step.n} className={`supply-workflow-steps__item supply-workflow-steps__item--${state}`}>
            <span className="supply-workflow-steps__num" aria-hidden>
              {step.n}
            </span>
            <span className="supply-workflow-steps__text">
              <span className="supply-workflow-steps__label">{step.label}</span>
              <span className="supply-workflow-steps__hint">{step.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function supplyWorkflowNextHint(current: SupplyWorkflowStep): string {
  if (current === 1) {
    return 'После нажатия «Далее» откроется карточка — добавьте цветы и материалы с количеством и закупочной ценой.';
  }
  if (current === 2) {
    return 'Когда все позиции добавлены — нажмите «Провести на склад», остатки обновятся автоматически.';
  }
  return 'Проверьте позиции и проведите документ — товар появится на складе.';
}
