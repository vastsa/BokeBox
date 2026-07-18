import { coverImageUrl } from '../../api/client';
import { CoverArt } from '../../components/ui/CoverArt';
import { IconPause, IconPlay } from '../../components/icons';
import { useI18n } from '../../i18n';
import type { LibraryItem } from '../../types/job';
import {
  itemMinutes,
  itemPct,
  itemSummary,
  itemTitle,
} from './libraryModel';

export function CoverCard({
  item,
  index,
  size,
  active,
  playing,
  onPlay,
  onOpen,
  onManage,
}: {
  item: LibraryItem;
  index: number;
  size: 's' | 'm' | 't';
  active: boolean;
  playing: boolean;
  onPlay: () => void;
  onOpen: () => void;
  onManage: () => void;
}) {
  const { t } = useI18n();
  const title = itemTitle(item);
  const summary = itemSummary(item, t);
  const pct = itemPct(item);
  const mins = itemMinutes(item, t);
  const badge = item.listen?.completed
    ? t('home.finished')
    : pct > 0
      ? `${Math.round(pct)}%`
      : mins;

  return (
    <article
      role="listitem"
      className={['lh-card', active ? 'is-active' : '', `is-${size}`].join(' ')}
      style={{ ['--stagger' as string]: `${index * 28}ms` }}
    >
      <div className={['lh-card-face', `is-${size}`].join(' ')}>
        <CoverArt
          seed={item.job.id}
          preferred={item.job.podcast?.coverGradient}
          imageUrl={
            item.job.podcast?.hasCoverImage
              ? coverImageUrl(item.job.id, item.job.updatedAt)
              : undefined
          }
          title={title}
          monogram={false}
          className="lh-card-cover"
          aria-hidden
        />

        <button
          type="button"
          className="lh-card-overlay"
          onClick={onOpen}
          aria-label={t('home.openTitle', { title })}
        >
          <div className="lh-card-top">
            <span className="lh-card-badge">{badge}</span>
            <h2 className="lh-card-title">{title}</h2>
          </div>
          <p className="lh-card-desc">{summary}</p>
        </button>

        <button
          type="button"
          className="lh-card-play"
          onClick={onPlay}
          aria-label={playing ? t('common.pause') : t('home.playTitle', { title })}
        >
          {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
        </button>

        <button
          type="button"
          className="lh-card-manage"
          onClick={onManage}
          aria-label={t('home.manageTitle', { title })}
          title={t('common.manage')}
        >
          ···
        </button>

        {pct > 0 && !item.listen?.completed && (
          <span className="lh-card-bar" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
    </article>
  );
}
