import { useI18n } from '../i18n';
import {
  PROJECT_GITHUB_URL,
  PROJECT_LICENSE_SPDX,
} from '../lib/project';

/** 开源标识：协议 + GitHub 链接 */
export function OpenSourceMark({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <p
      className={['open-source-mark', compact ? 'is-compact' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="open-source-mark-label">{t('app.openSource')}</span>
      <span className="open-source-mark-sep" aria-hidden>
        ·
      </span>
      <a
        href={PROJECT_GITHUB_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="open-source-mark-link"
      >
        GitHub
      </a>
      <span className="open-source-mark-sep" aria-hidden>
        ·
      </span>
      <span className="open-source-mark-license">{PROJECT_LICENSE_SPDX}</span>
    </p>
  );
}
