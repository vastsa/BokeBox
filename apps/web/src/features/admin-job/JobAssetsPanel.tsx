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

export function JobAssetsPanel({
  job,
  embedded = false,
}: {
  job: Job;
  /** 嵌在概览 Tab 内时去掉外层 panel 壳 */
  embedded?: boolean;
}) {
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

  const body = (
    <>
      {!embedded && (
        <div className="jd-side-head">
          <h2 className="jd-side-title">{t('job.assetsTitle')}</h2>
          <span className="jd-side-count">
            {readyCount}/{items.length}
          </span>
        </div>
      )}
      <div className={embedded ? 'jd-assets jd-assets-grid' : 'jd-assets'}>
        {items.map((item) => (
          <AssetRow
            key={item.key}
            icon={item.icon}
            label={item.label}
            ready={item.ready}
          />
        ))}
      </div>
    </>
  );

  if (embedded) return body;

  return <section className="jd-panel jd-panel-assets">{body}</section>;
}
