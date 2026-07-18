import { ProgressBar } from '../../components/ProgressBar';
import { IconCheck, IconVideo } from '../../components/icons';
import { formatSize, formatSourceLabel } from '../../lib/format';
import { useI18n } from '../../i18n';
import type { SourceMode } from './constants';

type Props = {
  uploading: boolean;
  progress: number;
  fileName: string | null;
  fileSize: number | null;
  sourceMode: SourceMode;
  ttsSummary: string;
  contentLocaleDisplay: string;
  published: boolean;
};

export function UploadProgressCard({
  uploading,
  progress,
  fileName,
  fileSize,
  sourceMode,
  ttsSummary,
  contentLocaleDisplay,
  published,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="upload-progress-card">
      <div className="upload-file-row">
        <div className="upload-file-icon">
          <IconVideo size={18} />
        </div>
        <div className="upload-file-meta">
          <div className="upload-file-name" title={fileName || undefined}>
            {formatSourceLabel(fileName, 64)}
          </div>
          <div className="upload-file-sub">
            {fileSize != null
              ? formatSize(fileSize)
              : sourceMode === 'url'
                ? t('upload.urlImport')
                : '—'}
            <span className="dot">·</span>
            {ttsSummary}
            <span className="dot">·</span>
            {contentLocaleDisplay}
            <span className="dot">·</span>
            {published ? t('upload.publishOn') : t('upload.publishOff')}
          </div>
        </div>
        <div className="upload-file-status">
          {uploading ? (
            <span className="pct">{progress}%</span>
          ) : (
            <span className="done">
              <IconCheck size={14} />
              {t('upload.submitted')}
            </span>
          )}
        </div>
      </div>
      <ProgressBar value={uploading ? progress : 100} />
      <div className="upload-progress-hint">
        {uploading
          ? sourceMode === 'url'
            ? t('upload.submittedUrl')
            : t('upload.submittedUpload')
          : t('upload.submittedRedirect')}
      </div>
    </div>
  );
}
