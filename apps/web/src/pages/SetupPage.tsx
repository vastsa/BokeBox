import { useEffect, useMemo, useState } from 'react';
import {
  completeSetup,
  fetchSetupStatus,
  type SetupStatus,
} from '../api/client';
import { TtsModePicker } from '../components/admin/TtsModePicker';
import { DEFAULT_GLOBAL_TTS, summarizeTts } from '../components/admin/GlobalTtsSettings';
import { BrandMascot } from '../components/BrandMark';
import { IconCheck, IconMic, IconSpark } from '../components/icons';
import { OpenSourceMark } from '../components/OpenSourceMark';
import { setAuthSession } from '../lib/auth';
import { navigate } from '../lib/router';
import { ContentLocaleSelect } from '../components/admin/ContentLocaleSelect';
import {
  isUiLocale,
  resolveContentLocale,
  useI18n,
  type Locale,
} from '../i18n';
import type { TtsOptions } from '../types/job';
import {
  EDGE_VOICE_OPTIONS,
  WHISPER_LANG_OPTIONS,
  WHISPER_MODEL_OPTIONS,
} from '../lib/providerOptions';

type Step = 1 | 2 | 3 | 4;

const DEFAULTS = {
  baseUrl: 'https://api.oj.ink/v1',
  chatModel: 'mimo-v2.5',
  asrModel: 'mimo-v2.5-asr',
  asrProvider: 'mimo',
  ttsModel: 'mimo-v2.5-tts',
  ttsProvider: 'mimo',
  whisperBin: '',
  whisperLang: '',
  voiceDesignModel: 'mimo-v2.5-tts-voicedesign',
  imageModel: '',
  defaultVoice: '冰糖',
};

export function SetupPage() {
  const { t, setLocale } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEFAULTS.baseUrl);
  const [chatModel, setChatModel] = useState(DEFAULTS.chatModel);
  const [asrModel, setAsrModel] = useState(DEFAULTS.asrModel);
  const [asrProvider, setAsrProvider] = useState(DEFAULTS.asrProvider);
  const [ttsModel, setTtsModel] = useState(DEFAULTS.ttsModel);
  const [ttsProvider, setTtsProvider] = useState(DEFAULTS.ttsProvider);
  const [whisperBin, setWhisperBin] = useState(DEFAULTS.whisperBin);
  const [whisperLang, setWhisperLang] = useState(DEFAULTS.whisperLang);
  const [voiceDesignModel, setVoiceDesignModel] = useState(
    DEFAULTS.voiceDesignModel,
  );
  const [imageModel, setImageModel] = useState(DEFAULTS.imageModel);
  const [tts, setTts] = useState<TtsOptions>({
    ...DEFAULT_GLOBAL_TTS,
    voice: DEFAULTS.defaultVoice,
  });
  const [contentLocale, setContentLocale] = useState<Locale>('zh-CN');

  useEffect(() => {
    void (async () => {
      try {
        const status: SetupStatus = await fetchSetupStatus();
        if (status.initialized) {
          navigate({ name: 'login' });
          return;
        }
        const s = status.ai?.suggested;
        if (s) {
          setBaseUrl(s.baseUrl || DEFAULTS.baseUrl);
          setChatModel(s.chatModel || DEFAULTS.chatModel);
          setAsrModel(s.asrModel || DEFAULTS.asrModel);
          setAsrProvider(s.asrProvider || DEFAULTS.asrProvider);
          setTtsModel(s.ttsModel || DEFAULTS.ttsModel);
          setTtsProvider(s.ttsProvider || DEFAULTS.ttsProvider);
          setWhisperBin(s.whisperBin || DEFAULTS.whisperBin);
          setWhisperLang(s.whisperLang || DEFAULTS.whisperLang);
          setVoiceDesignModel(s.voiceDesignModel || DEFAULTS.voiceDesignModel);
          setImageModel(s.imageModel || DEFAULTS.imageModel);
          const voice = s.defaultVoice || DEFAULTS.defaultVoice;
          setTts((prev) => ({
            ...prev,
            mode: 'default',
            voice,
          }));
          setContentLocale(
            resolveContentLocale(s.contentLocale || status.ai?.contentLocale),
          );
        } else if (status.ai?.contentLocale) {
          setContentLocale(resolveContentLocale(status.ai.contentLocale));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stepHint = useMemo(() => {
    if (step === 1) return t('setup.step1Desc');
    if (step === 2) return t('setup.step2Desc');
    if (step === 3) return t('setup.step3Desc');
    return t('setup.step4Desc');
  }, [step, t]);

  const ttsSummary = useMemo(() => summarizeTts(tts), [tts]);

  const goNext = () => {
    setError(null);
    if (step === 1) {
      if (username.trim().length < 2) {
        setError(t('setup.errUsername'));
        return;
      }
      if (password.length < 6) {
        setError(t('setup.errPassword'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('setup.errPasswordMismatch'));
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      // API Key 可选：本地 Whisper + Edge 可不填；云端对话/封面仍建议配置
      if (!baseUrl.trim()) {
        setError(t('setup.errBaseUrl'));
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!chatModel.trim() || !asrModel.trim() || !ttsModel.trim()) {
        setError(t('setup.errModels'));
        return;
      }
      setStep(4);
    }
  };

  const goBack = () => {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const defaultVoice =
        tts.mode === 'default'
          ? String(tts.voice || DEFAULTS.defaultVoice)
          : DEFAULTS.defaultVoice;
      const res = await completeSetup({
        username: username.trim(),
        password,
        confirmPassword,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        chatModel: chatModel.trim(),
        asrModel: asrModel.trim(),
        asrProvider: asrProvider.trim() || 'mimo',
        ttsModel: ttsModel.trim(),
        ttsProvider: ttsProvider.trim() || 'mimo',
        whisperBin: whisperBin.trim(),
        whisperLang: whisperLang.trim(),
        voiceDesignModel: voiceDesignModel.trim(),
        imageModel: imageModel.trim(),
        defaultVoice,
        contentLocale,
        tts,
      });
      setAuthSession(res.token, res.username);
      window.location.hash = '/home';
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-loading">{t('setup.checking')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card-wide nl-enter">
        <div className="auth-brand auth-brand-stack">
          <BrandMascot size={88} className="auth-brand-mascot" />
          <div className="auth-brand-copy">
            <div className="auth-brand-title">BokeBox</div>
            <div className="auth-brand-sub">{t('setup.brandSub')}</div>
          </div>
        </div>

        <h1 className="auth-title">{t('setup.welcome')}</h1>
        <p className="auth-desc">{stepHint}</p>

        <div className="setup-steps" aria-label={t('setup.stepsAria')}>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={[
                'setup-step',
                step === n ? 'is-active' : '',
                step > n ? 'is-done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="setup-step-dot">
                {step > n ? <IconCheck size={12} /> : n}
              </span>
              <span className="setup-step-label">
                {n === 1
                  ? t('setup.stepAccount')
                  : n === 2
                    ? t('setup.stepService')
                    : n === 3
                      ? t('setup.stepModel')
                      : t('setup.stepVoice')}
              </span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="auth-form">
            <label className="auth-field">
              <span>{t('setup.username')}</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin"
              />
            </label>
            <label className="auth-field">
              <span>{t('setup.password')}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t('setup.passwordPlaceholder')}
              />
            </label>
            <label className="auth-field">
              <span>{t('setup.confirmPassword')}</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t('setup.confirmPlaceholder')}
              />
            </label>

            <div className="settings-block setup-content-locale">
              <div className="settings-block-head">
                <h3>{t('setup.contentLocale')}</h3>
                <p>{t('setup.contentLocaleDesc')}</p>
              </div>
              <ContentLocaleSelect
                className="settings-locale-select"
                value={contentLocale}
                aria-label={t('setup.contentLocaleAria')}
                onChange={(id) => {
                  setContentLocale(id);
                  // 仅当所选语言有 UI 包时同步界面语言
                  if (isUiLocale(id)) setLocale(id);
                }}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="auth-form">
            <label className="auth-field">
              <span>API Key</span>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                placeholder={t('setup.apiKeyOptionalPlaceholder')}
              />
            </label>
            <label className="auth-field">
              <span>API Base URL</span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                autoComplete="off"
                placeholder="https://api.oj.ink/v1"
              />
            </label>
            <div className="auth-tip">
              <IconSpark size={14} />
              <span>{t('setup.apiKeyOptionalHint')}</span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="auth-form">
            <div className="auth-grid-2">
              <label className="auth-field">
                <span>{t('setup.chatModel')}</span>
                <input
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="auth-field">
                <span>{t('setup.asrProvider')}</span>
                <select
                  value={asrProvider}
                  onChange={(e) => {
                    const id = e.target.value;
                    setAsrProvider(id);
                    if (id === 'openai') setAsrModel('whisper-1');
                    if (id === 'mimo') setAsrModel('mimo-v2.5-asr');
                    if (id === 'local-whisper') setAsrModel('base');
                  }}
                >
                  <option value="mimo">MiMo ASR</option>
                  <option value="openai">OpenAI 兼容 ASR</option>
                  <option value="local-whisper">本地 Whisper</option>
                </select>
              </label>
              <label className="auth-field">
                <span>{t('setup.ttsProvider')}</span>
                <select
                  value={ttsProvider}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTtsProvider(id);
                    if (id === 'openai') {
                      setTtsModel('tts-1');
                      setTts((prev) => ({
                        ...prev,
                        mode: 'default',
                        voice: 'alloy',
                        styleTags: undefined,
                        voiceDesign: undefined,
                      }));
                    }
                    if (id === 'mimo') {
                      setTtsModel('mimo-v2.5-tts');
                      setVoiceDesignModel('mimo-v2.5-tts-voicedesign');
                      setTts((prev) => ({
                        ...prev,
                        mode: 'default',
                        voice: '冰糖',
                      }));
                    }
                    if (id === 'edge') {
                      setTtsModel('edge-neural');
                      setTts((prev) => ({
                        ...prev,
                        mode: 'default',
                        voice: 'zh-CN-XiaoxiaoNeural',
                        styleTags: undefined,
                        voiceDesign: undefined,
                      }));
                    }
                  }}
                >
                  <option value="mimo">MiMo TTS</option>
                  <option value="openai">OpenAI 兼容 TTS</option>
                  <option value="edge">Edge TTS（免费）</option>
                </select>
              </label>
              <label className="auth-field">
                <span>{t('setup.asrModel')}</span>
                <input
                  value={asrModel}
                  onChange={(e) => setAsrModel(e.target.value)}
                  list={
                    asrProvider === 'local-whisper'
                      ? 'setup-whisper-model-options'
                      : undefined
                  }
                  placeholder={
                    asrProvider === 'local-whisper'
                      ? 'base / small / ggml 模型路径'
                      : undefined
                  }
                  spellCheck={false}
                />
                {asrProvider === 'local-whisper' && (
                  <datalist id="setup-whisper-model-options">
                    {WHISPER_MODEL_OPTIONS.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )}
              </label>
              <label className="auth-field">
                <span>{t('setup.ttsModel')}</span>
                <input
                  value={ttsModel}
                  onChange={(e) => setTtsModel(e.target.value)}
                  spellCheck={false}
                />
              </label>
              {asrProvider === 'local-whisper' && (
                <>
                  <label className="auth-field">
                    <span>{t('setup.whisperBin')}</span>
                    <input
                      value={whisperBin}
                      onChange={(e) => setWhisperBin(e.target.value)}
                      placeholder={t('setup.whisperBinPlaceholder')}
                      spellCheck={false}
                    />
                  </label>
                  <label className="auth-field">
                    <span>{t('setup.whisperLang')}</span>
                    <select
                      value={whisperLang}
                      onChange={(e) => setWhisperLang(e.target.value)}
                    >
                      {WHISPER_LANG_OPTIONS.map((opt) => (
                        <option key={opt.id || 'auto'} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="auth-tip auth-field-span2">
                    <span>{t('setup.whisperHint')}</span>
                  </div>
                </>
              )}
              {ttsProvider === 'edge' && (
                <>
                  <label className="auth-field">
                    <span>{t('setup.edgeVoice')}</span>
                    <select
                      value={String(tts.voice || 'zh-CN-XiaoxiaoNeural')}
                      onChange={(e) =>
                        setTts((prev) => ({
                          ...prev,
                          mode: 'default',
                          voice: e.target.value,
                        }))
                      }
                    >
                      {EDGE_VOICE_OPTIONS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {v.language}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="auth-tip auth-field-span2">
                    <span>{t('setup.edgeHint')}</span>
                  </div>
                </>
              )}
              {ttsProvider === 'mimo' && (
                <label className="auth-field">
                  <span>{t('setup.voiceDesignModel')}</span>
                  <input
                    value={voiceDesignModel}
                    onChange={(e) => setVoiceDesignModel(e.target.value)}
                    spellCheck={false}
                  />
                </label>
              )}
            </div>

            <div className="setup-image-model">
              <label className="auth-field">
                <span>{t('setup.imageModel')}</span>
                <input
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  placeholder={t('setup.imagePlaceholder')}
                  spellCheck={false}
                />
              </label>
              <div className="auth-tip">
                <IconSpark size={14} />
                <span>
                  {t('setup.imageHintPrefix')}
                  <code> /v1/images/generations </code>
                  {t('setup.imageHintSuffix')}
                </span>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="auth-form setup-tts-form">
            <div className="setup-tts-head">
              <IconMic size={15} />
              <div>
                <div className="setup-tts-title">{t('setup.defaultVoiceTitle')}</div>
                <div className="setup-tts-desc">
                  {t('setup.currentVoice')}<strong>{ttsSummary}</strong>
                  {t('setup.currentVoiceSuffix')}
                </div>
              </div>
            </div>
            <TtsModePicker value={tts} provider={ttsProvider} onChange={setTts} />
          </div>
        )}

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-actions">
          {step > 1 ? (
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={goBack}
              disabled={submitting}
            >
              {t('common.prev')}
            </button>
          ) : (
            <span />
          )}
          {step < 4 ? (
            <button
              type="button"
              className="nl-btn nl-btn-primary"
              onClick={goNext}
            >
              {t('common.next')}
            </button>
          ) : (
            <button
              type="button"
              className="nl-btn nl-btn-primary"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? t('setup.finishing') : t('setup.finish')}
            </button>
          )}
        </div>

        <OpenSourceMark className="auth-open-source" />
      </div>
    </div>
  );
}
