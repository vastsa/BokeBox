import {
  IconMic,
  IconSpark,
  IconText,
  IconVideo,
  IconWave,
} from '../../components/icons';
import { useI18n } from '../../i18n';
import type { Job } from '../../types/job';
import { AssetRow } from './AssetRow';

export function JobAssetsPanel({ job }: { job: Job }) {
  const { t } = useI18n();
  return (
            <section className="jd-panel">
              <h2 className="jd-side-title">{t('job.assetsTitle')}</h2>
              <div className="jd-assets">
                <AssetRow
                  icon={<IconVideo size={14} />}
                  label={t('job.originalVideo')}
                  ready={Boolean(job.hasVideo)}
                />
                <AssetRow
                  icon={<IconWave size={14} />}
                  label={t('job.extractedAudio')}
                  ready={Boolean(job.hasSourceAudio)}
                />
                <AssetRow
                  icon={<IconText size={14} />}
                  label={t('job.stepTranscribe')}
                  ready={Boolean(job.hasTranscript || job.transcript)}
                />
                <AssetRow
                  icon={<IconMic size={14} />}
                  label={t('job.podcastAudio')}
                  ready={Boolean(job.hasPodcastAudio)}
                />
                <AssetRow
                  icon={<IconSpark size={14} />}
                  label={t('job.scriptNotes')}
                  ready={Boolean(job.podcast?.script || job.podcast?.showNotes)}
                />
                <AssetRow
                  icon={<IconSpark size={14} />}
                  label={t('job.knowledgeCards')}
                  ready={Boolean(job.podcast?.flashcards?.length)}
                />

              </div>
            </section>

  );
}
