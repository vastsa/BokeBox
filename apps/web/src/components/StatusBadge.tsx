import type { JobStatus } from '../types/job';
import { useI18n } from '../i18n';

const CLASS: Record<JobStatus, string> = {
  queued: 'nl-tag',
  extracting_audio: 'nl-tag nl-tag-brand',
  transcribing: 'nl-tag nl-tag-brand',
  generating_podcast: 'nl-tag nl-tag-brand',
  generating_cover: 'nl-tag nl-tag-brand',
  synthesizing_audio: 'nl-tag nl-tag-warning',
  done: 'nl-tag nl-tag-success',
  failed: 'nl-tag nl-tag-danger',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const { t } = useI18n();
  return <span className={CLASS[status]}>{t(`status.${status}`)}</span>;
}
