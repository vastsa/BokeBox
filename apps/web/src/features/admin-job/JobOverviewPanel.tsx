import { podcastAudioUrl, coverImageUrl } from '../../api/client';
import { ScriptPromptSummary } from '../../components/admin/ScriptPromptSummary';
import { TtsSummary } from '../../components/admin/TtsSummary';
import { MiniPlayer } from '../../components/listen/MiniPlayer';
import { IconDownload, IconWave } from '../../components/icons';
import { coverGradientFor } from '../../lib/format';
import { navigate } from '../../lib/router';
import { useI18n } from '../../i18n';
import type { Job } from '../../types/job';
import { JobAssetsPanel } from './JobAssetsPanel';

export type OverviewTab = 'result' | 'assets' | 'config';

export const OVERVIEW_TABS: Array<{ key: OverviewTab; labelKey: string }> = [
  { key: 'result', labelKey: 'job.resultTitle' },
  { key: 'assets', labelKey: 'job.assetsTitle' },
  { key: 'config', labelKey: 'job.configTitle' },
];

type Props = {
  job: Job;
  tab: OverviewTab;
  active: boolean;
  seekRequest: number | null;
  onTabChange: (tab: OverviewTab) => void;
  onStateChange: (state: {
    current: number;
    duration: number;
    playing: boolean;
  }) => void;
};

export function JobOverviewPanel({
  job,
  tab,
  active,
  seekRequest,
  onTabChange,
  onStateChange,
}: Props) {
  const { t } = useI18n();
  const title = job.podcast?.title || job.title;
  const cover = coverGradientFor(job.id, job.podcast?.coverGradient);
  const canListen = job.status === 'done' && Boolean(job.hasPodcastAudio);

  const readyAssets = [
    Boolean(job.hasVideo),
    Boolean(job.hasSourceAudio),
    Boolean(job.hasTranscript || job.transcript),
    Boolean(job.hasPodcastAudio),
    Boolean(job.podcast?.script || job.podcast?.showNotes),
    Boolean(job.podcast?.flashcards?.length),
  ].filter(Boolean).length;

  return (
    <section className="jd-panel jd-overview">
      <div className="jd-tabs jd-overview-tabs" role="tablist" aria-label={t('job.overviewTabs')}>
        {OVERVIEW_TABS.map((item) => {
          const badge =
            item.key === 'assets' ? `${readyAssets}/6` : null;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={['jd-tab', tab === item.key ? 'is-active' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onTabChange(item.key)}
            >
              {t(item.labelKey)}
              {badge ? <span className="jd-tab-badge">{badge}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="jd-tab-body jd-overview-body">
        {tab === 'result' && (
          <div className="jd-result-body">
            {(job.podcast?.estimatedMinutes ||
              job.hasPodcastAudio ||
              canListen) && (
              <div className="jd-panel-head jd-overview-head">
                <div className="jd-panel-head-copy">
                  {job.podcast?.estimatedMinutes ? (
                    <p className="jd-panel-sub">
                      {t('common.minutes', {
                        n: job.podcast.estimatedMinutes,
                      })}
                    </p>
                  ) : (
                    <span className="jd-panel-sub">{t('job.resultTitle')}</span>
                  )}
                </div>
                <div className="jd-panel-actions">
                  {job.hasPodcastAudio && (
                    <a
                      href={podcastAudioUrl(job.id, true)}
                      className="nl-btn nl-btn-secondary"
                    >
                      <IconDownload size={14} />
                      {t('common.download')}
                    </a>
                  )}
                  {canListen && (
                    <button
                      type="button"
                      className="nl-btn nl-btn-ghost"
                      onClick={() =>
                        navigate({ name: 'player', id: job.id })
                      }
                    >
                      {t('job.immersive')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {job.hasPodcastAudio ? (
              <MiniPlayer
                key={job.updatedAt}
                trackId={job.id}
                src={podcastAudioUrl(job.id, false, String(job.updatedAt))}
                title={title}
                downloadUrl={podcastAudioUrl(job.id, true)}
                coverClassName={cover}
                coverImageUrl={
                  job.podcast?.hasCoverImage
                    ? coverImageUrl(job.id, job.updatedAt, 'md')
                    : undefined
                }
                summary={job.podcast?.summary}
                seekRequest={seekRequest}
                onStateChange={onStateChange}
              />
            ) : (
              <div className="jd-placeholder">
                <IconWave size={18} />
                <span>
                  {active ? t('job.audioGenerating') : t('job.audioMissing')}
                </span>
              </div>
            )}

            {(job.podcast?.summary ||
              !!job.podcast?.tags?.length ||
              !!job.podcast?.outline?.length) && (
              <div className="jd-result-meta">
                {job.podcast?.summary && (
                  <p className="jd-summary">{job.podcast.summary}</p>
                )}

                {!!job.podcast?.tags?.length && (
                  <div className="jd-tags">
                    {job.podcast.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}

                {!!job.podcast?.outline?.length && (
                  <div className="jd-outline">
                    <div className="jd-outline-h">{t('job.outline')}</div>
                    <ol>
                      {job.podcast.outline.map((seg, i) => (
                        <li key={`${seg.title}-${i}`}>
                          <em>{String(i + 1).padStart(2, '0')}</em>
                          <div>
                            <strong>{seg.title}</strong>
                            {seg.summary && <p>{seg.summary}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'assets' && (
          <div className="jd-overview-assets">
            <JobAssetsPanel job={job} embedded />
          </div>
        )}

        {tab === 'config' && (
          <div className="jd-config-stack jd-overview-config">
            <div className="jd-config-block">
              <div className="jd-config-label">{t('job.ttsConfig')}</div>
              <TtsSummary value={job.tts} />
            </div>
            <div className="jd-config-block">
              <div className="jd-config-label">{t('job.persona')}</div>
              <ScriptPromptSummary value={job.scriptPrompt} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
