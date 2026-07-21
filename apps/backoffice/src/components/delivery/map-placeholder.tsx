'use client';

import type { ReactNode } from 'react';

/**
 * Provider-neutral map contract for delivery UI.
 * List mode is the production-usable fallback — no Google Maps (or other) npm package.
 */
export type MapPoint = {
  id: string;
  latitude: string | null;
  longitude: string | null;
  label: string;
  meta?: string;
};

export type MapAdapter = {
  /** Render an interactive map when a provider is configured. */
  renderMap?(points: MapPoint[], selectedId: string | null): ReactNode;
  /** Always available fallback — used by MapPlaceholder. */
  renderList(points: MapPoint[], selectedId: string | null, onSelect: (id: string) => void): ReactNode;
};

type MapPlaceholderProps = {
  points: MapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyMessage?: string;
  title?: string;
};

export function MapPlaceholder({
  points,
  selectedId,
  onSelect,
  emptyMessage = 'Нет точек с координатами.',
  title = 'Карта (заглушка)',
}: MapPlaceholderProps) {
  return (
    <div className="delivery-map-placeholder" role="region" aria-label={title}>
      <div className="delivery-map-placeholder__canvas">
        <p className="delivery-map-placeholder__hint">
          {title}. Интеграция провайдера карты не подключена — используйте список точек.
        </p>
        {selectedId ? (
          <p className="delivery-map-placeholder__selected">
            Выбрано: {points.find((p) => p.id === selectedId)?.label ?? selectedId}
          </p>
        ) : (
          <p className="delivery-map-placeholder__selected">Точка не выбрана</p>
        )}
      </div>
      <ul className="delivery-map-placeholder__list list-stack">
        {points.length === 0 ? <li>{emptyMessage}</li> : null}
        {points.map((point) => (
          <li key={point.id}>
            <button
              type="button"
              className={
                point.id === selectedId
                  ? 'delivery-map-point delivery-map-point--selected'
                  : 'delivery-map-point'
              }
              onClick={() => onSelect(point.id)}
            >
              <strong>{point.label}</strong>
              {point.meta ? <span className="delivery-map-point__meta">{point.meta}</span> : null}
              {point.latitude && point.longitude ? (
                <span className="delivery-map-point__coords">
                  {point.latitude}, {point.longitude}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Default list-only adapter — production fallback. */
export const listMapAdapter: MapAdapter = {
  renderList(points, selectedId, onSelect) {
    return (
      <MapPlaceholder points={points} selectedId={selectedId} onSelect={onSelect} />
    );
  },
};
