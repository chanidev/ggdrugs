import { Map, MapMarker, useKakaoLoader } from 'react-kakao-maps-sdk';
import { useTranslation } from 'react-i18next';
import type { BffEventDetail } from '../../../lib/api';

export function MiniMapSection({ detail }: { detail: BffEventDetail }) {
  const { t } = useTranslation('navigation');
  const appkey = import.meta.env.VITE_KAKAO_MAP_JS_KEY as string | undefined;
  const [loading, error] = useKakaoLoader({ appkey: appkey ?? '', libraries: ['services'] });

  if (!appkey) return null;
  if (detail.latitude === null || detail.longitude === null) return null;
  if (error) return null;
  if (loading) {
    return (
      <div className="h-72 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-alt)" />
    );
  }
  const pos = { lat: detail.latitude, lng: detail.longitude };
  return (
    <section className="overflow-hidden rounded-(--radius-lg) border border-(--color-border)">
      <Map center={pos} level={4} style={{ width: '100%', height: '320px' }} aria-label={t('map.eventMapAriaLabel')}>
        <MapMarker position={pos} title={detail.title} />
      </Map>
    </section>
  );
}
