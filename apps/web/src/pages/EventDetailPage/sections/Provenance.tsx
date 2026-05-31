import { useTranslation } from 'react-i18next';
import type { BffEventDetail } from '../../../lib/api';

export function Provenance({ detail }: { detail: BffEventDetail }) {
  const { t } = useTranslation('common');
  return (
    <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-alt) p-4 text-[11px] text-(--color-text-subtle)">
      <div className="font-semibold uppercase tracking-[0.08em]">{t('provenance.title')}</div>
      <div className="mt-1 font-mono">
        {detail.source.type} · {detail.source.crawlOrigin} · id {detail.source.externalId}
      </div>
      <div className="mt-0.5 tabular font-mono">
        {t('provenance.firstCollected')} {detail.createdAt.slice(0, 10)} · {t('provenance.lastUpdated')} {detail.updatedAt.slice(0, 10)}
      </div>
    </section>
  );
}
