import { type RefObject } from 'react';
import { IconUpload } from '../../components/icons';
import { useI18n } from '../../i18n';
import { UPLOAD_ACCEPT } from './constants';

type Props = {
  uploading: boolean;
  dragOver: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onOpenPicker: () => void;
  onDragOver: (over: boolean) => void;
  onDropFile: (file?: File) => void;
  onPickFile: (file?: File) => void;
};

export function UploadFileDropzone({
  uploading,
  dragOver,
  inputRef,
  onOpenPicker,
  onDragOver,
  onDropFile,
  onPickFile,
}: Props) {
  const { t } = useI18n();
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t('upload.dropAria')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenPicker();
        }
      }}
      onClick={onOpenPicker}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(true);
      }}
      onDragLeave={() => onDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragOver(false);
        if (!uploading) onDropFile(e.dataTransfer.files?.[0]);
      }}
      className={[
        'upload-dropzone',
        dragOver ? 'is-dragover' : '',
        uploading ? 'is-uploading' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="upload-dropzone-glow" aria-hidden />
      <div className="upload-dropzone-inner">
        <div className="upload-dropzone-icon">
          <IconUpload size={24} />
        </div>
        <div className="upload-dropzone-copy">
          <h2>{uploading ? t('upload.dropping') : t('upload.dropTitle')}</h2>
          <p>{t('upload.dropHint')}</p>
        </div>
        {!uploading && (
          <button
            type="button"
            className="nl-btn nl-btn-primary upload-dropzone-cta"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPicker();
            }}
          >
            <IconUpload size={15} />
            {t('upload.chooseFile')}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        disabled={uploading}
        onChange={(e) => onPickFile(e.target.files?.[0] || undefined)}
      />
    </div>
  );
}
