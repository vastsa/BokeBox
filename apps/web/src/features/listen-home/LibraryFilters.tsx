import { useI18n } from '../../i18n';
import type { LibraryListFacets } from '../../types/pagination';
import {
  FILTER_KEYS,
  FILTER_LABEL_KEY,
  type FilterKey,
} from './libraryModel';

type Props = {
  filter: FilterKey;
  counts: LibraryListFacets;
  onChange: (key: FilterKey) => void;
};

export function LibraryFilters({ filter, counts, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="lh-filters" role="tablist" aria-label={t('home.filtersAria')}>
      {FILTER_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={filter === key}
          className={['lh-filter', filter === key ? 'is-active' : ''].join(' ')}
          onClick={() => onChange(key)}
        >
          <span>{t(FILTER_LABEL_KEY[key])}</span>
          <em>{counts[key]}</em>
        </button>
      ))}
    </div>
  );
}
