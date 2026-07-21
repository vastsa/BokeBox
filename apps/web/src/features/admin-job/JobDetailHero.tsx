import {
  IconMic,
  IconRefresh,
} from '../../components/icons';
import { CoverArt } from '../../components/ui/CoverArt';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusBadge } from '../../components/StatusBadge';
import { formatSize, formatSourceLabel, formatTime } from '../../lib/format';
import { navigate } from '../../lib/router';
import { useI18n } from '../../i18n';
import type { Job } from '../../types/job';
import { PIPELINE } from './pipelineSteps';
import { coverImageUrl, updateJob } from '../../api/client';

type ActionKind = 'publish' | 'retry' | 'delete' | 'flashcards';

type Props = {
  job: Job;
  title: string;
  canListen: boolean;
  busy: ActionKind | null;
  active: boolean;
  showPipeline: boolean;
  stepIdx: number;
  actionError: string | null;
  onRefresh: () => void;
  runAction: (kind: ActionKind, fn: () => Promise<unknown>) => Promise<void>;
};

export function JobDetailHero({
  job,
  title,
  canListen,
  busy,
  active,
  showPipeline,
  stepIdx,
  actionError,
  onRefresh,
  runAction,
}: Props) {
  const { t } = useI18n();

  return (
    <header
      className={[
        'jd-hero',
        job.status === 'failed' ? 'is-failed' : '',
        active ? 'is-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="jd-hero-top">
        <CoverArt
          seed={job.id}
          preferred={job.podcast?.coverGradient}
          imageUrl={
            job.podcast?.hasCoverImage
              ? coverImageUrl(job.id, job.updatedAt, 'md')
              : undefined
          }
          title={title}
          className="jd-cover"
          aria-hidden
        >
          <IconMic size={28} />
        </CoverArt>

        <div className="jd-hero-main">
          <div className="jd-badges">
            <StatusBadge status={job.status} />
            <span
              className={[
                'nl-tag',
                job.published ? 'nl-tag-success' : '',
              ].join(' ')}
            >
              {job.published ? t('admin.published') : t('admin.draft')}
            </span>
          </div>

          <h1 className="jd-title">{title}</h1>

          <p className="jd-sub">
            <span>{job.message || t('job.waiting')}</span>
          </p>

          <div className="jd-meta">
            <span
              className="jd-source-label"
              title={job.sourceUrl || job.originalFilename}
            >
              {formatSourceLabel(job.sourceUrl || job.originalFilename)}
            </span>
            <span className="jd-meta-sep" aria-hidden>
              ·
            </span>
            <span>{formatSize(job.size)}</span>
            <span className="jd-meta-sep" aria-hidden>
              ·
            </span>
            <span>{formatTime(job.createdAt)}</span>
          </div>
        </div>

        <div className="jd-hero-actions">
          {canListen && (
            <button
              type="button"
              className="nl-btn nl-btn-primary"
              onClick={() => navigate({ name: 'player', id: job.id })}
            >
              {t('job.openPlayer')}
            </button>
          )}
          <button
            type="button"
            className={[
              'nl-btn',
              job.published ? 'nl-btn-secondary' : 'nl-btn-primary',
            ].join(' ')}
            disabled={busy === 'publish'}
            onClick={() =>
              void runAction('publish', () =>
                updateJob(job.id, { published: !job.published }),
              )
            }
          >
            {busy === 'publish'
              ? t('job.updating')
              : job.published
                ? t('admin.unpublishAction')
                : t('admin.publishAction')}
          </button>
          <button
            type="button"
            className="nl-btn nl-btn-ghost jd-icon-btn"
            onClick={() => onRefresh()}
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
          >
            <IconRefresh size={15} />
          </button>
        </div>
      </div>

      {(showPipeline || job.progress < 100 || job.status === 'failed') && (
        <div className="jd-progress">
          <div className="jd-progress-row">
            <span>
              {active
                ? t('job.processing')
                : job.status === 'failed'
                  ? t('job.failedState')
                  : t('job.progress')}
            </span>
            <span className="jd-progress-pct">{Math.round(job.progress)}%</span>
          </div>
          <ProgressBar
            value={job.progress}
            tone={job.status === 'failed' ? 'danger' : 'brand'}
          />
          {showPipeline && (
            <div className="jd-steps">
              {PIPELINE.map((step, i) => {
                const failed = job.status === 'failed';
                const done =
                  !failed &&
                  (job.status === 'done' || (stepIdx >= 0 && i < stepIdx));
                const current =
                  !failed &&
                  stepIdx >= 0 &&
                  i === stepIdx &&
                  job.status !== 'done';
                return (
                  <div
                    key={step.key}
                    className={[
                      'jd-step',
                      done ? 'is-done' : '',
                      current ? 'is-current' : '',
                      failed ? 'is-muted' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <i />
                    <span>{t(step.labelKey)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(job.error || actionError) && (
        <div className="jd-alert jd-break" role="alert">
          <strong>
            {job.error ? t('job.processFailed') : t('job.actionFailed')}
          </strong>
          <p>{job.error || actionError}</p>
        </div>
      )}
    </header>
  );
}
