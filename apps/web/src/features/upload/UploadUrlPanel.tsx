import type { SourcePluginDescriptor } from '../../api/client';
import { IconUpload } from '../../components/icons';
import { useI18n } from '../../i18n';

type Props = {
  uploading: boolean;
  sourceUrl: string;
  sourcePluginId: string;
  sourcePlugins: SourcePluginDescriptor[];
  sourcePluginsLoading: boolean;
  onUrlChange: (url: string) => void;
  onPluginChange: (id: string) => void;
  onSubmit: () => void;
};

export function UploadUrlPanel({
  uploading,
  sourceUrl,
  sourcePluginId,
  sourcePlugins,
  sourcePluginsLoading,
  onUrlChange,
  onPluginChange,
  onSubmit,
}: Props) {
  const { t } = useI18n();
  return (
    <div className={['upload-url-panel', uploading ? 'is-uploading' : ''].join(' ')}>
      <label className="upload-url-field">
        <span className="label">{t('upload.contentUrl')}</span>
        <input
          type="text"
          inputMode="url"
          className="nl-input"
          placeholder={t('upload.urlPlaceholder')}
          value={sourceUrl}
          disabled={uploading}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </label>

      <label className="upload-url-field">
        <span className="label">{t('upload.sourcePlugin')}</span>
        <select
          className="nl-input upload-source-plugin-select"
          value={sourcePluginId}
          disabled={uploading || sourcePluginsLoading}
          onChange={(e) => onPluginChange(e.target.value)}
          aria-label={t('upload.sourcePlugin')}
        >
          <option value="">{t('upload.sourcePluginAuto')}</option>
          {sourcePlugins.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.origin === 'builtin' ? ' · builtin' : ''}
              {p.riskLevel === 'high' ? ' · high' : ''}
            </option>
          ))}
        </select>
      </label>

      <p className="upload-url-hint">
        {sourcePluginsLoading
          ? t('upload.sourcePluginLoading')
          : sourcePlugins.length === 0
            ? t('upload.sourcePluginUnavailable')
            : t('upload.sourcePluginHint')}
        {!sourcePluginId ? ` ${t('upload.urlHint')}` : ''}
      </p>

      <button
        type="button"
        className="nl-btn nl-btn-primary upload-dropzone-cta"
        disabled={uploading || !sourceUrl.trim()}
        onClick={onSubmit}
      >
        <IconUpload size={15} />
        {uploading ? t('upload.submitting') : t('upload.start')}
      </button>
    </div>
  );
}
