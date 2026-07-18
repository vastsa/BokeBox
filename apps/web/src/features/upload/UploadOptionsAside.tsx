import type { AlbumSummary } from '../../types/album';
import type {
  ScriptPromptMode,
  ScriptPromptOptions,
  TtsOptions,
  TtsSourceMode,
} from '../../types/job';
import { IconMic, IconSpark } from '../../components/icons';
import { ContentLocaleSelect } from '../../components/admin/ContentLocaleSelect';
import { ScriptPromptPicker } from '../../components/admin/ScriptPromptPicker';
import { TtsPicker } from '../../components/admin/TtsPicker';
import { useI18n, type Locale } from '../../i18n';
import type { OptionPanel } from './constants';

type LocaleOption = { code: string; nativeLabel: string; label: string; short?: string };

export type UploadOptionsAsideProps = {
  uploading: boolean;
  optionsOpen: boolean;
  setOptionsOpen: (fn: (v: boolean) => boolean) => void;
  published: boolean;
  updatePublished: (v: boolean) => void;
  albumId: string;
  setAlbumId: (id: string) => void;
  albums: AlbumSummary[];
  albumsLoading: boolean;
  contentLocale: Locale;
  contentLocaleOptions: LocaleOption[];
  contentLocaleReady: boolean;
  contentLocaleHint: string;
  contentLocaleDisplay: string;
  updateContentLocale: (v: Locale) => void;
  openPanel: OptionPanel;
  setOpenPanel: (p: OptionPanel) => void;
  togglePanel: (p: Exclude<OptionPanel, 'none'>) => void;
  ttsModeLabel: string;
  ttsSummary: string;
  ttsSourceMode: TtsSourceMode;
  tts: TtsOptions;
  globalTts: TtsOptions;
  ttsReady: boolean;
  updateTtsSourceMode: (m: TtsSourceMode) => void;
  updateTts: (v: TtsOptions) => void;
  promptModeLabel: string;
  promptSummary: string;
  scriptPromptMode: ScriptPromptMode;
  scriptPrompt: ScriptPromptOptions;
  globalScriptPrompt: ScriptPromptOptions;
  scriptPromptReady: boolean;
  updateScriptPromptMode: (m: ScriptPromptMode) => void;
  updateScriptPrompt: (v: ScriptPromptOptions) => void;
};

export function UploadOptionsAside(p: UploadOptionsAsideProps) {
  const { t } = useI18n();
  const {
    uploading,
    optionsOpen,
    setOptionsOpen,
    published,
    updatePublished,
    albumId,
    setAlbumId,
    albums,
    albumsLoading,
    contentLocale,
    contentLocaleOptions,
    contentLocaleReady,
    contentLocaleHint,
    contentLocaleDisplay,
    updateContentLocale,
    openPanel,
    setOpenPanel,
    togglePanel,
    ttsModeLabel,
    ttsSummary,
    ttsSourceMode,
    tts,
    globalTts,
    ttsReady,
    updateTtsSourceMode,
    updateTts,
    promptModeLabel,
    promptSummary,
    scriptPromptMode,
    scriptPrompt,
    globalScriptPrompt,
    scriptPromptReady,
    updateScriptPromptMode,
    updateScriptPrompt,
  } = p;

  return (
      <aside className="upload-options" aria-label={t('upload.optionsAria')}>
        <div className={['upload-options-card', optionsOpen ? 'is-open' : 'is-collapsed'].join(' ')}>
          <button
            type="button"
            className="upload-options-toggle"
            aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen((v) => !v)}
          >
            <span className="upload-options-toggle-copy">
              <strong>{t('upload.optionsAria')}</strong>
              <span>
                {published ? t('upload.publishOn') : t('upload.publishOff')}
                {' · '}
                {ttsModeLabel} · {contentLocaleDisplay}
              </span>
            </span>
            <em>{optionsOpen ? t('common.collapse') : t('common.adjust')}</em>
          </button>

          <div className="upload-options-body" hidden={!optionsOpen}>
          <label
            className={[
              'upload-switch-row upload-switch-row-compact',
              uploading ? 'is-locked' : '',
            ].join(' ')}
          >
            <div className="upload-switch-copy">
              <div className="title">{t('upload.autoPublish')}</div>
              <div className="desc">
                {published ? t('upload.publishOn') : t('upload.publishOff')}
              </div>
            </div>
            <span className={['upload-switch', published ? 'is-on' : ''].join(' ')}>
              <i />
              <input
                type="checkbox"
                className="upload-switch-input"
                checked={published}
                disabled={uploading}
                onChange={(e) => updatePublished(e.target.checked)}
                aria-label={t('upload.autoPublish')}
              />
            </span>
          </label>

          <div className="upload-basics-grid">
            <div className="upload-field">
              <div className="upload-field-head">
                <span className="title">{t('upload.album')}</span>
                <span className="desc">
                  {albumsLoading
                    ? t('upload.albumLoading')
                    : albums.length
                      ? t('upload.albumHint')
                      : t('upload.albumEmpty')}
                </span>
              </div>
              <select
                className="nl-input upload-locale-select"
                value={albumId}
                disabled={uploading || albumsLoading}
                onChange={(e) => setAlbumId(e.target.value)}
                aria-label={t('upload.album')}
              >
                <option value="">{t('upload.albumNone')}</option>
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                    {!a.published ? ` (${t('album.draft')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="upload-field">
              <div className="upload-field-head">
                <span className="title">{t('upload.contentLocale')}</span>
                <span className="desc">
                  {contentLocaleReady
                    ? contentLocaleHint
                    : t('upload.localeLoading')}
                </span>
              </div>
              <ContentLocaleSelect
                className="upload-locale-select"
                value={contentLocale}
                options={contentLocaleOptions}
                disabled={uploading || !contentLocaleReady}
                aria-label={t('upload.contentLocaleAria')}
                onChange={updateContentLocale}
              />
            </div>
          </div>

          <div className="upload-option-chips" role="group" aria-label={t('upload.advancedAria')}>
            <button
              type="button"
              className={[
                'upload-option-chip',
                openPanel === 'tts' ? 'is-open' : '',
              ].join(' ')}
              disabled={uploading || !ttsReady}
              aria-expanded={openPanel === 'tts'}
              onClick={() => togglePanel('tts')}
            >
              <IconMic size={13} />
              <span className="chip-label">{t('upload.voice')}</span>
              <span className="chip-value" title={`${ttsModeLabel} · ${ttsSummary}`}>
                {ttsModeLabel} · {ttsSummary}
              </span>
              <span className="chip-caret" aria-hidden>
                {openPanel === 'tts' ? t('common.collapse') : t('common.adjust')}
              </span>
            </button>

            <button
              type="button"
              className={[
                'upload-option-chip',
                openPanel === 'prompt' ? 'is-open' : '',
              ].join(' ')}
              disabled={uploading || !scriptPromptReady}
              aria-expanded={openPanel === 'prompt'}
              onClick={() => togglePanel('prompt')}
            >
              <IconSpark size={13} />
              <span className="chip-label">{t('upload.persona')}</span>
              <span className="chip-value" title={`${promptModeLabel} · ${promptSummary}`}>
                {promptModeLabel} · {promptSummary}
              </span>
              <span className="chip-caret" aria-hidden>
                {openPanel === 'prompt' ? t('common.collapse') : t('common.adjust')}
              </span>
            </button>
          </div>

          {openPanel === 'tts' && (
            <div className="upload-option-panel" onClick={(e) => e.stopPropagation()}>
              <div className="upload-option-panel-head">
                <div className="left">
                  <IconMic size={14} />
                  <span>{t('upload.voice')}</span>
                </div>
                <button
                  type="button"
                  className="upload-option-close"
                  onClick={() => setOpenPanel('none')}
                >
                  {t('common.done')}
                </button>
              </div>
              <TtsPicker
                mode={ttsSourceMode}
                value={tts}
                globalValue={globalTts}
                disabled={uploading || !ttsReady}
                compact
                onModeChange={updateTtsSourceMode}
                onChange={updateTts}
              />
            </div>
          )}

          {openPanel === 'prompt' && (
            <div className="upload-option-panel">
              <div className="upload-option-panel-head">
                <div className="left">
                  <IconSpark size={14} />
                  <span>{t('upload.scriptPersona')}</span>
                </div>
                <button
                  type="button"
                  className="upload-option-close"
                  onClick={() => setOpenPanel('none')}
                >
                  {t('common.done')}
                </button>
              </div>
              <ScriptPromptPicker
                mode={scriptPromptMode}
                value={scriptPrompt}
                globalValue={globalScriptPrompt}
                disabled={uploading || !scriptPromptReady}
                compact
                onModeChange={updateScriptPromptMode}
                onChange={updateScriptPrompt}
              />
            </div>
          )}
          </div>
        </div>
      </aside>
  );
}
