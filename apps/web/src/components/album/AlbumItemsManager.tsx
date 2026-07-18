import { useEffect, useMemo, useState } from 'react';
import { coverImageUrl } from '../../api/client';
import { IconCheck, IconClose, IconTrash } from '../icons';
import { CoverArt } from '../ui/CoverArt';
import { useI18n, type Translator } from '../../i18n';
import type { Job } from '../../types/job';

type FilterKey = 'available' | 'all';

const PAGE_SIZE = 40;

function jobTitle(job: Job): string {
  return job.podcast?.title || job.title;
}

function jobMeta(job: Job, t: Translator): string {
  const parts: string[] = [];
  if (job.podcast?.estimatedMinutes) {
    parts.push(t('common.minutes', { n: job.podcast.estimatedMinutes }));
  }
  const tags = (job.podcast?.tags || []).slice(0, 2);
  if (tags.length) parts.push(tags.join(' · '));
  return parts.join(' · ') || t('app.podcast');
}

function matchQuery(job: Job, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    jobTitle(job),
    job.podcast?.summary || '',
    job.originalFilename || '',
    ...(job.podcast?.tags || []),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function AlbumItemsManager({
  jobs,
  selectedIds,
  loading,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  jobs: Job[];
  selectedIds: string[];
  loading?: boolean;
  busy?: boolean;
  onChange: (ids: string[]) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('available');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, filter]);

  // 打开时锁滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const jobMap = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const selectedJobs = useMemo(() => {
    return selectedIds
      .map((id) => jobMap.get(id))
      .filter(Boolean) as Job[];
  }, [selectedIds, jobMap]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const catalog = useMemo(() => {
    const list = jobs.filter((j) => matchQuery(j, query));
    if (filter === 'available') {
      return list.filter((j) => !selectedSet.has(j.id));
    }
    return list;
  }, [jobs, query, filter, selectedSet]);

  const visibleCatalog = catalog.slice(0, visibleCount);
  const hasMore = catalog.length > visibleCount;

  const addJob = (id: string) => {
    if (selectedSet.has(id)) return;
    onChange([...selectedIds, id]);
  };

  const removeJob = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  const moveJob = (id: string, dir: -1 | 1) => {
    const idx = selectedIds.indexOf(id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= selectedIds.length) return;
    const next = [...selectedIds];
    const [row] = next.splice(idx, 1);
    next.splice(target, 0, row);
    onChange(next);
  };

  const clearSelected = () => onChange([]);

  return (
    <div
      className="al-modal-mask"
      role="dialog"
      aria-modal="true"
      aria-label={t('album.manageItems')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="al-modal al-modal-wide">
        <div className="al-modal-head">
          <div className="al-modal-head-copy">
            <h3>{t('album.manageItems')}</h3>
            <p className="al-modal-sub">
              {t('album.managerSub', { n: selectedIds.length })}
            </p>
          </div>
          <button
            type="button"
            className="al-icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label={t('common.close')}
          >
            <IconClose size={16} />
          </button>
        </div>

        <div className="al-manager">
          {/* 左：专辑内顺序 */}
          <section className="al-manager-pane">
            <div className="al-manager-pane-head">
              <h4>{t('album.inAlbum')}</h4>
              <span className="al-manager-count">{selectedIds.length}</span>
              {selectedIds.length > 0 ? (
                <button
                  type="button"
                  className="al-manager-link"
                  onClick={clearSelected}
                  disabled={busy}
                >
                  {t('album.clearSelected')}
                </button>
              ) : null}
            </div>
            <div className="al-manager-pane-body">
              {!selectedJobs.length ? (
                <div className="al-picker-empty">{t('album.inAlbumEmpty')}</div>
              ) : (
                <ol className="al-manager-selected">
                  {selectedJobs.map((job, index) => {
                    const title = jobTitle(job);
                    return (
                      <li key={job.id} className="al-manager-selected-item">
                        <span className="al-manager-idx">{index + 1}</span>
                        <CoverArt
                          seed={job.id}
                          preferred={job.podcast?.coverGradient}
                          title={title}
                          imageUrl={
                            job.podcast?.hasCoverImage
                              ? coverImageUrl(job.id, job.updatedAt)
                              : null
                          }
                          className="al-manager-cover"
                        />
                        <div className="al-manager-copy">
                          <div className="al-manager-title" title={title}>
                            {title}
                          </div>
                          <div className="al-manager-meta">{jobMeta(job, t)}</div>
                        </div>
                        <div className="al-manager-item-actions">
                          <button
                            type="button"
                            className="al-icon-btn"
                            disabled={index === 0 || busy}
                            onClick={() => moveJob(job.id, -1)}
                            title={t('album.moveUp')}
                            aria-label={t('album.moveUp')}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="al-icon-btn"
                            disabled={
                              index === selectedJobs.length - 1 || busy
                            }
                            onClick={() => moveJob(job.id, 1)}
                            title={t('album.moveDown')}
                            aria-label={t('album.moveDown')}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="al-icon-btn is-danger"
                            disabled={busy}
                            onClick={() => removeJob(job.id)}
                            title={t('album.removeItem')}
                            aria-label={t('album.removeItem')}
                          >
                            <IconTrash size={14} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>

          {/* 右：可添加曲库 */}
          <section className="al-manager-pane">
            <div className="al-manager-pane-head">
              <h4>{t('album.addFromLibrary')}</h4>
              <span className="al-manager-count">{catalog.length}</span>
            </div>

            <div className="al-manager-tools">
              <label className="al-manager-search">
                <span className="sr-only">{t('album.searchEpisodes')}</span>
                <input
                  className="nl-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('album.searchPlaceholder')}
                  autoFocus
                />
                {query ? (
                  <button
                    type="button"
                    className="al-manager-search-clear"
                    onClick={() => setQuery('')}
                    aria-label={t('common.clear')}
                  >
                    <IconClose size={14} />
                  </button>
                ) : null}
              </label>
              <div
                className="al-manager-filters"
                role="tablist"
                aria-label={t('album.filterAria')}
              >
                {(
                  [
                    ['available', 'album.filterAvailable'],
                    ['all', 'album.filterAll'],
                  ] as const
                ).map(([key, labelKey]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filter === key}
                    className={[
                      'al-manager-filter',
                      filter === key ? 'is-active' : '',
                    ].join(' ')}
                    onClick={() => setFilter(key)}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className="al-manager-pane-body">
              {loading ? (
                <div className="al-picker-empty">{t('common.loading')}</div>
              ) : !visibleCatalog.length ? (
                <div className="al-picker-empty">
                  {query.trim()
                    ? t('album.searchNoMatch')
                    : filter === 'available' && selectedIds.length
                      ? t('album.allAdded')
                      : t('album.pickerEmpty')}
                </div>
              ) : (
                <>
                  <ul className="al-manager-catalog">
                    {visibleCatalog.map((job) => {
                      const title = jobTitle(job);
                      const inAlbum = selectedSet.has(job.id);
                      return (
                        <li key={job.id}>
                          <button
                            type="button"
                            className={[
                              'al-manager-catalog-item',
                              inAlbum ? 'is-in' : '',
                            ].join(' ')}
                            disabled={busy}
                            onClick={() =>
                              inAlbum ? removeJob(job.id) : addJob(job.id)
                            }
                          >
                            <CoverArt
                              seed={job.id}
                              preferred={job.podcast?.coverGradient}
                              title={title}
                              imageUrl={
                                job.podcast?.hasCoverImage
                                  ? coverImageUrl(job.id, job.updatedAt)
                                  : null
                              }
                              className="al-manager-cover"
                            />
                            <span className="al-manager-copy">
                              <span className="al-manager-title" title={title}>
                                {title}
                              </span>
                              <span className="al-manager-meta">
                                {jobMeta(job, t)}
                              </span>
                            </span>
                            <span
                              className={[
                                'al-manager-badge',
                                inAlbum ? 'is-in' : '',
                              ].join(' ')}
                            >
                              {inAlbum ? (
                                <>
                                  <IconCheck size={12} />
                                  {t('album.alreadyIn')}
                                </>
                              ) : (
                                t('album.addItem')
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {hasMore ? (
                    <button
                      type="button"
                      className="al-manager-more"
                      onClick={() =>
                        setVisibleCount((n) => n + PAGE_SIZE)
                      }
                    >
                      {t('album.showMore', {
                        n: Math.min(PAGE_SIZE, catalog.length - visibleCount),
                        total: catalog.length - visibleCount,
                      })}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>

        <div className="al-modal-actions">
          <span className="al-manager-footer-meta">
            {t('album.selectedCount', { n: selectedIds.length })}
          </span>
          <div className="al-modal-actions-btns">
            <button
              type="button"
              className="nl-btn"
              onClick={onClose}
              disabled={busy}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-primary"
              disabled={busy}
              onClick={onSave}
            >
              {busy ? t('common.saving') : t('album.saveOrder')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
