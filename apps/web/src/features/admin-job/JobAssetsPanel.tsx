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

  const items = [
    {
      key: 'video',
      icon: <IconVideo size={14} />,
      label: t('job.originalVideo'),
      ready: Boolean(job.hasVideo),
    },
    {
      key: 'audio',
      icon: <IconWave size={14} />,
      label: t('job.extractedAudio'),
      ready: Boolean(job.hasSourceAudio),
    },
    {
      key: 'transcript',
      icon: <IconText size={14} />,
      label: t('job.stepTranscribe'),
      ready: Boolean(job.hasTranscript || job.transcript),
    },
    {
      key: 'podcast',
      icon: <IconMic size={14} />,
      label: t('job.podcastAudio'),
      ready: Boolean(job.hasPodcastAudio),
    },
    {
      key: 'script',
      icon: <IconSpark size={14} />,
      label: t('job.scriptNotes'),
      ready: Boolean(job.podcast?.script || job.podcast?.showNotes),
    },
    {
      key: 'cards',
      icon: <IconSpark size={14} />,
      label: t('job.knowledgeCards'),
      ready: Boolean(job.podcast?.flashcards?.length),
    },
  ] as const;

  const readyCount = items.filter((item) => item.ready).length;

  return (
    <section className="jd-panel jd-panel-assets">
      <div className="jd-side-head">
        <h2 className="jd-side-title">{t('job.assetsTitle')}</h2>
        <span className="jd-side-count">
          {readyCount}/{items.length}
        </span>
      </div>
      <div className="jd-assets">
        {items.map((item) => (
          <AssetRow
            key={item.key}
            icon={item.icon}
            label={item.label}
            ready={item.ready}
          />
        ))}
      </div>
    </section>
  );
}
