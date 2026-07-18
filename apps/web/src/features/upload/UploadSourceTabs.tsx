import { useI18n } from '../../i18n';
import type { SourceMode } from './constants';

type Props = {
  sourceMode: SourceMode;
  uploading: boolean;
  onChange: (mode: SourceMode) => void;
};

export function UploadSourceTabs({ sourceMode, uploading, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="upload-source-tabs" role="tablist" aria-label={t('upload.sourceAria')}>
      <button
        type="button"
        role="tab"
        aria-selected={sourceMode === 'file'}
        className={['upload-source-tab', sourceMode === 'file' ? 'is-active' : ''].join(' ')}
        disabled={uploading}
        onClick={() => onChange('file')}
      >
        {t('upload.localFile')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={sourceMode === 'url'}
        className={['upload-source-tab', sourceMode === 'url' ? 'is-active' : ''].join(' ')}
        disabled={uploading}
        onClick={() => onChange('url')}
      >
        {t('upload.urlImport')}
      </button>
    </div>
  );
}
