import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';

export function AssetRow({
  icon,
  label,
  ready,
}: {
  icon: ReactNode;
  label: string;
  ready: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={['jd-asset', ready ? 'is-ready' : ''].join(' ')}>
      <span className="ic">{icon}</span>
      <span className="lb">{label}</span>
      <span className="st">{ready ? t('common.ready') : t('common.unreadied')}</span>
    </div>
  );
}
