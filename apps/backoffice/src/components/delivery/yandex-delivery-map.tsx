'use client';

import { useEffect, useRef } from 'react';
import type { MapPoint } from '@/components/delivery/map-placeholder';

declare global {
  interface Window {
    ymaps?: {
      ready: (callback: () => void) => void;
      Map: new (
        element: HTMLElement,
        state: { center: number[]; zoom: number; controls?: string[] },
        options?: { suppressMapOpenBlock?: boolean },
      ) => {
        geoObjects: {
          add: (object: unknown) => void;
          removeAll: () => void;
        };
        setCenter: (center: number[], zoom?: number) => void;
        destroy: () => void;
      };
      Placemark: new (
        coords: number[],
        properties?: { balloonContent?: string; hintContent?: string },
        options?: { preset?: string },
      ) => unknown;
    };
  }
}

type YandexDeliveryMapProps = {
  apiKey: string;
  points: MapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  defaultCenter?: { latitude: string; longitude: string };
  height?: number;
};

function loadYandexMaps(apiKey: string): Promise<NonNullable<Window['ymaps']>> {
  return new Promise((resolve, reject) => {
    if (window.ymaps) {
      window.ymaps.ready(() => resolve(window.ymaps!));
      return;
    }
    const existing = document.querySelector('script[data-yandex-maps="true"]');
    if (existing) {
      existing.addEventListener('load', () => {
        window.ymaps?.ready(() => resolve(window.ymaps!));
      });
      return;
    }
    const script = document.createElement('script');
    script.dataset.yandexMaps = 'true';
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.async = true;
    script.onload = () => window.ymaps?.ready(() => resolve(window.ymaps!));
    script.onerror = () => reject(new Error('Не удалось загрузить Яндекс.Карты'));
    document.head.appendChild(script);
  });
}

export function YandexDeliveryMap({
  apiKey,
  points,
  selectedId,
  onSelect,
  defaultCenter,
  height = 420,
}: YandexDeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ destroy: () => void; geoObjects: { add: (o: unknown) => void } } | null>(
    null,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !apiKey) return;

    let cancelled = false;

    void loadYandexMaps(apiKey)
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return;

        const withCoords = points.filter((point) => point.latitude && point.longitude);
        const selected = withCoords.find((point) => point.id === selectedId) ?? withCoords[0];
        const center = selected
          ? [Number(selected.longitude), Number(selected.latitude)]
          : defaultCenter
            ? [Number(defaultCenter.longitude), Number(defaultCenter.latitude)]
            : [27.558972, 53.900601];

        if (mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
        }

        const map = new ymaps.Map(
          containerRef.current,
          { center, zoom: selected || withCoords.length === 1 ? 15 : 11, controls: ['zoomControl'] },
          { suppressMapOpenBlock: true },
        );
        mapRef.current = map;

        for (const point of withCoords) {
          const placemark = new ymaps.Placemark(
            [Number(point.longitude), Number(point.latitude)],
            {
              hintContent: point.label,
              balloonContent: point.meta ? `${point.label}<br/>${point.meta}` : point.label,
            },
            {
              preset:
                point.id === selectedId ? 'islands#redDotIcon' : 'islands#blueDotIcon',
            },
          );
          map.geoObjects.add(placemark);
        }
      })
      .catch(() => {
        /* fallback handled by parent */
      });

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [apiKey, points, selectedId, onSelect, defaultCenter]);

  return (
    <div
      ref={containerRef}
      className="delivery-yandex-map"
      style={{ width: '100%', height }}
      aria-label="Карта доставок"
    />
  );
}
