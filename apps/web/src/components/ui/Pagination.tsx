import { useI18n } from '../../i18n';

type Props = {
  page: number;
  totalPages: number;
  total?: number;
  disabled?: boolean;
  onChange: (page: number) => void;
  className?: string;
};

/** 简洁分页条：上一页 / 页码 / 下一页 */
export function Pagination({
  page,
  totalPages,
  total,
  disabled,
  onChange,
  className = '',
}: Props) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const canPrev = safePage > 1 && !disabled;
  const canNext = safePage < totalPages && !disabled;

  // 显示当前附近页码，最多 5 个
  const windowSize = 5;
  let start = Math.max(1, safePage - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) pages.push(p);

  return (
    <nav
      className={['pg-bar', className].filter(Boolean).join(' ')}
      aria-label={t('common.pagination')}
    >
      <button
        type="button"
        className="pg-btn"
        disabled={!canPrev}
        onClick={() => onChange(safePage - 1)}
        aria-label={t('common.prevPage')}
      >
        {t('common.prevPage')}
      </button>

      <div className="pg-pages" role="list">
        {start > 1 ? (
          <>
            <button
              type="button"
              className="pg-num"
              disabled={disabled}
              onClick={() => onChange(1)}
            >
              1
            </button>
            {start > 2 ? <span className="pg-ellipsis">…</span> : null}
          </>
        ) : null}

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            role="listitem"
            className={['pg-num', p === safePage ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            disabled={disabled || p === safePage}
            aria-current={p === safePage ? 'page' : undefined}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}

        {end < totalPages ? (
          <>
            {end < totalPages - 1 ? <span className="pg-ellipsis">…</span> : null}
            <button
              type="button"
              className="pg-num"
              disabled={disabled}
              onClick={() => onChange(totalPages)}
            >
              {totalPages}
            </button>
          </>
        ) : null}
      </div>

      <button
        type="button"
        className="pg-btn"
        disabled={!canNext}
        onClick={() => onChange(safePage + 1)}
        aria-label={t('common.nextPage')}
      >
        {t('common.nextPage')}
      </button>

      {typeof total === 'number' ? (
        <span className="pg-meta">
          {t('common.pageMeta', {
            page: safePage,
            totalPages,
            total,
          })}
        </span>
      ) : null}
    </nav>
  );
}
