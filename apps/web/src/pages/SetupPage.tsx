import { useEffect, useMemo, useState } from 'react';
import {
  completeSetup,
  fetchSetupStatus,
  type ProviderOptionDto,
} from '../api/client';
import {
  fetchAiPlugins,
  type AiPluginDescriptor,
} from '../api/plugins';
import { TtsModePicker } from '../components/admin/TtsModePicker';
import { DEFAULT_GLOBAL_TTS, summarizeTts } from '../components/admin/GlobalTtsSettings';
import {
  PluginConfigFields,
  draftToConfigPatch,
  validatePluginConfigDraft,
} from '../components/admin/PluginConfigFields';
import { BrandMascot } from '../components/BrandMark';
import { PageLoader } from '../components/ui/PageLoader';
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
  defaultVoiceForProvider,
  resolveTtsVoiceProfile,
} from '../lib/ttsVoiceProfile';
import {
  buildDraft,
  fromAi,
} from '../features/settings/plugin-hub/pluginHubModel';

type Step = 1 | 2 | 3 | 4;

const DEFAULTS = {
  baseUrl: 'https://api.xiaomimimo.com/v1',
  chatModel: 'mimo-v2.5',
  asrModel: 'mimo-v2.5-asr',
  asrProvider: 'mimo',
  ttsModel: 'mimo-v2.5-tts',
  ttsProvider: 'mimo',
  voiceDesignModel: 'mimo-v2.5-tts-voicedesign',
  imageModel: '',
  defaultVoice: '冰糖',
};

const FALLBACK_ASR_PROVIDERS: ProviderOptionDto[] = [
  {
    id: 'mimo',
    name: 'MiMo ASR',
    description: '云端 ASR',
    available: true,
    suggestedModels: { asr: 'mimo-v2.5-asr' },
  },
  {
    id: 'openai',
    name: 'OpenAI 兼容 ASR',
    description: 'Whisper 兼容接口',
    available: true,
    suggestedModels: { asr: 'whisper-1' },
  },
  {
    id: 'local-whisper',
    name: '本地 Whisper',
    description: '本机 whisper 可执行文件',
    available: true,
    suggestedModels: { asr: 'base' },
  },
];

const FALLBACK_TTS_PROVIDERS: ProviderOptionDto[] = [
  {
    id: 'mimo',
    name: 'MiMo TTS',
    description: '云端 TTS',
    available: true,
    suggestedModels: {
      tts: 'mimo-v2.5-tts',
      voiceDesign: 'mimo-v2.5-tts-voicedesign',
      defaultVoice: '冰糖',
    },
  },
  {
    id: 'openai',
    name: 'OpenAI 兼容 TTS',
    description: 'OpenAI TTS 兼容接口',
    available: true,
    suggestedModels: { tts: 'tts-1', defaultVoice: 'alloy' },
  },
  {
    id: 'edge',
    name: 'Edge TTS（免费）',
    description: '微软 Edge 神经网络语音',
    available: true,
    suggestedModels: { tts: 'edge-neural', defaultVoice: 'zh-CN-XiaoxiaoNeural' },
  },
];

function providerFromList(
  list: ProviderOptionDto[] | undefined,
  id: string,
): ProviderOptionDto | undefined {
  const raw = String(id || '').trim();
  if (!list?.length || !raw) return undefined;
  return (
    list.find((p) => p.id === raw) ||
    list.find((p) => p.id.toLowerCase() === raw.toLowerCase())
  );
}

/** setup/status 里的 ttsProviders → 音色面板可用的插件描述符 */
function toTtsPluginDescriptor(
  p?: ProviderOptionDto | null,
): AiPluginDescriptor | null {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    version: '0.0.0',
    riskLevel: 'low',
    defaultEnabled: true,
    enabled: p.enabled !== false,
    available: p.available !== false,
    origin: 'builtin',
    voiceUi: (p.voiceUi as AiPluginDescriptor['voiceUi']) || undefined,
    voiceConfigKey: p.voiceConfigKey,
    voicePanel: p.voicePanel as AiPluginDescriptor['voicePanel'],
    supportsStyleTags: p.supportsStyleTags,
    supportsVoiceDesign: p.supportsVoiceDesign,
    voices: p.voices,
    suggestedModels: p.suggestedModels,
  };
}


function seedDraftWithDefaults(
  plugin: AiPluginDescriptor | null,
  extra: Record<string, string> = {},
): Record<string, string> {
  if (!plugin) return { ...extra };
  const draft = buildDraft(fromAi(plugin));
  for (const field of plugin.configSchema || []) {
    if (draft[field.key]) continue;
    if (field.default === undefined || field.default === null) continue;
    draft[field.key] = String(field.default);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== '') draft[k] = v;
  }
  return draft;
}

function pickPlugin(
  plugins: AiPluginDescriptor[],
  id: string,
): AiPluginDescriptor | null {
  const raw = String(id || '').trim();
  if (!raw) return null;
  return (
    plugins.find((p) => p.id === raw) ||
    plugins.find((p) => p.id.toLowerCase() === raw.toLowerCase()) ||
    null
  );
}

function buildDefaultTtsForProvider(
  providerId: string,
  plugin: AiPluginDescriptor | null,
): TtsOptions {
  const profile = resolveTtsVoiceProfile(providerId, plugin);
  return {
    mode: 'default',
    voice: defaultVoiceForProvider(providerId, plugin),
    voiceDesign: profile.supportsVoiceDesign
      ? DEFAULT_GLOBAL_TTS.voiceDesign
      : undefined,
    styleTags: undefined,
  };
}

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
  const [voiceDesignModel, setVoiceDesignModel] = useState(
    DEFAULTS.voiceDesignModel,
  );
  const [imageModel, setImageModel] = useState(DEFAULTS.imageModel);
  const [tts, setTts] = useState<TtsOptions>({
    ...DEFAULT_GLOBAL_TTS,
    voice: DEFAULTS.defaultVoice,
  });
  const [contentLocale, setContentLocale] = useState<Locale>('zh-CN');
  const [asrProviders, setAsrProviders] = useState<ProviderOptionDto[]>(
    FALLBACK_ASR_PROVIDERS,
  );
  const [ttsProviders, setTtsProviders] = useState<ProviderOptionDto[]>(
    FALLBACK_TTS_PROVIDERS,
  );
  const [asrPlugin, setAsrPlugin] = useState<AiPluginDescriptor | null>(null);
  const [ttsPlugin, setTtsPlugin] = useState<AiPluginDescriptor | null>(null);
  const [asrConfigDraft, setAsrConfigDraft] = useState<Record<string, string>>(
    {},
  );
  const [ttsConfigDraft, setTtsConfigDraft] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    void (async () => {
      try {
        const [status, asrPluginsRes, ttsPluginsRes] = await Promise.all([
          fetchSetupStatus(),
          fetchAiPlugins('asr').catch(() => null),
          fetchAiPlugins('tts').catch(() => null),
        ]);
        if (status.initialized) {
          navigate({ name: 'login' });
          return;
        }

        const nextAsr =
          status.ai?.asrProviders?.filter((p) => p.id !== 'demo') ||
          FALLBACK_ASR_PROVIDERS;
        const nextTts =
          status.ai?.ttsProviders?.filter((p) => p.id !== 'demo') ||
          FALLBACK_TTS_PROVIDERS;
        setAsrProviders(nextAsr.length ? nextAsr : FALLBACK_ASR_PROVIDERS);
        setTtsProviders(nextTts.length ? nextTts : FALLBACK_TTS_PROVIDERS);

        const s = status.ai?.suggested;
        const nextAsrProvider = s?.asrProvider || DEFAULTS.asrProvider;
        const nextTtsProvider = s?.ttsProvider || DEFAULTS.ttsProvider;

        const asrList = asrPluginsRes?.plugins || [];
        const ttsList = ttsPluginsRes?.plugins || [];
        const asrHit = pickPlugin(asrList, nextAsrProvider);
        const ttsHit =
          pickPlugin(ttsList, nextTtsProvider) ||
          toTtsPluginDescriptor(providerFromList(nextTts, nextTtsProvider));

        setAsrPlugin(asrHit);
        setTtsPlugin(ttsHit);

        const globalBase = String(s?.baseUrl || DEFAULTS.baseUrl).trim();
        const asrModelHint = String(s?.asrModel || DEFAULTS.asrModel).trim();
        const ttsModelHint = String(s?.ttsModel || DEFAULTS.ttsModel).trim();
        setAsrConfigDraft(
          seedDraftWithDefaults(asrHit, {
            baseUrl: globalBase,
            model: asrModelHint,
          }),
        );
        setTtsConfigDraft(
          seedDraftWithDefaults(ttsHit, {
            baseUrl: globalBase,
            model: ttsModelHint,
          }),
        );

        if (s) {
          setBaseUrl(s.baseUrl || DEFAULTS.baseUrl);
          setChatModel(s.chatModel || DEFAULTS.chatModel);
          setAsrModel(s.asrModel || DEFAULTS.asrModel);
          setAsrProvider(nextAsrProvider);
          setTtsModel(s.ttsModel || DEFAULTS.ttsModel);
          setTtsProvider(nextTtsProvider);
          setVoiceDesignModel(s.voiceDesignModel || DEFAULTS.voiceDesignModel);
          setImageModel(s.imageModel || DEFAULTS.imageModel);
          const suggestedVoice = String(s.defaultVoice || '').trim();
          const profile = resolveTtsVoiceProfile(nextTtsProvider, ttsHit);
          const allowed = new Set(profile.voices.map((v) => v.id));
          const voice =
            (suggestedVoice &&
              (allowed.size === 0 || allowed.has(suggestedVoice))
              ? suggestedVoice
              : '') ||
            defaultVoiceForProvider(nextTtsProvider, ttsHit) ||
            DEFAULTS.defaultVoice;
          setTts({
            ...buildDefaultTtsForProvider(nextTtsProvider, ttsHit),
            voice,
          });
          setContentLocale(
            resolveContentLocale(s.contentLocale || status.ai?.contentLocale),
          );
        } else if (status.ai?.contentLocale) {
          setContentLocale(resolveContentLocale(status.ai.contentLocale));
          setTts(buildDefaultTtsForProvider(nextTtsProvider, ttsHit));
        } else {
          setTts(buildDefaultTtsForProvider(nextTtsProvider, ttsHit));
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

  const ttsSummary = useMemo(
    () => summarizeTts(tts, resolveTtsVoiceProfile(ttsProvider, ttsPlugin)),
    [tts, ttsProvider, ttsPlugin],
  );

  // 切换提供方后，尽量拉取完整插件描述（含 voicePanel / voices）
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void fetchAiPlugins('asr')
      .then((res) => {
        if (cancelled) return;
        const hit = pickPlugin(res.plugins, asrProvider);
        setAsrPlugin(hit);
        setAsrConfigDraft((prev) => {
          const seeded = seedDraftWithDefaults(hit, {
            baseUrl: baseUrl.trim() || DEFAULTS.baseUrl,
            model: asrModel.trim() || DEFAULTS.asrModel,
          });
          // 切换提供方时用新 schema 草稿；保留同 key 已填值
          const next = { ...seeded };
          for (const [k, v] of Object.entries(prev)) {
            if (v !== undefined && String(v).length > 0 && k in next) next[k] = v;
          }
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setAsrPlugin(null);
        setAsrConfigDraft({});
      });
    return () => {
      cancelled = true;
    };
  }, [asrProvider, loading]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void fetchAiPlugins('tts')
      .then((res) => {
        if (cancelled) return;
        const hit =
          pickPlugin(res.plugins, ttsProvider) ||
          toTtsPluginDescriptor(providerFromList(ttsProviders, ttsProvider));
        if (hit) {
          setTtsPlugin(hit);
          setTtsConfigDraft((prev) => {
            const seeded = seedDraftWithDefaults(hit, {
              baseUrl: baseUrl.trim() || DEFAULTS.baseUrl,
              model: ttsModel.trim() || DEFAULTS.ttsModel,
            });
            const next = { ...seeded };
            for (const [k, v] of Object.entries(prev)) {
              if (v !== undefined && String(v).length > 0 && k in next) next[k] = v;
            }
            return next;
          });
          setTts((prev) => {
            const profile = resolveTtsVoiceProfile(ttsProvider, hit);
            if (!profile.voices.length) return prev;
            const allowed = new Set(profile.voices.map((v) => v.id));
            const cur = String(prev.voice || '').trim();
            if (cur && allowed.has(cur)) return prev;
            return {
              ...prev,
              mode: 'default',
              voice: defaultVoiceForProvider(ttsProvider, hit),
              ...(profile.supportsVoiceDesign
                ? {}
                : { voiceDesign: undefined, styleTags: undefined }),
            };
          });
          return;
        }
        setTtsPlugin(null);
        setTtsConfigDraft({});
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = toTtsPluginDescriptor(
          providerFromList(ttsProviders, ttsProvider),
        );
        setTtsPlugin(fallback);
        setTtsConfigDraft(seedDraftWithDefaults(fallback));
      });
    return () => {
      cancelled = true;
    };
  }, [ttsProvider, ttsProviders, loading]);

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
      // API Key 可选：对话/封面用；ASR/TTS 密钥在下一步插件参数填写
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
      const asrMissing = validatePluginConfigDraft(
        asrPlugin?.configSchema,
        asrConfigDraft,
        asrPlugin?.configStatus,
      );
      if (asrMissing) {
        setError(t('setup.errPluginConfig', { field: asrMissing, kind: t('setup.asrProvider') }));
        return;
      }
      const ttsMissing = validatePluginConfigDraft(
        ttsPlugin?.configSchema,
        ttsConfigDraft,
        ttsPlugin?.configStatus,
      );
      if (ttsMissing) {
        setError(t('setup.errPluginConfig', { field: ttsMissing, kind: t('setup.ttsProvider') }));
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
          ? String(
              tts.voice ||
                defaultVoiceForProvider(ttsProvider, ttsPlugin) ||
                DEFAULTS.defaultVoice,
            )
          : defaultVoiceForProvider(ttsProvider, ttsPlugin) ||
            DEFAULTS.defaultVoice;
      const asrCfg = draftToConfigPatch(asrPlugin?.configSchema, asrConfigDraft);
      const ttsCfg = draftToConfigPatch(ttsPlugin?.configSchema, ttsConfigDraft);
      // model 字段与表单模型名对齐
      if (asrModel.trim()) asrCfg.model = asrModel.trim();
      if (ttsModel.trim()) ttsCfg.model = ttsModel.trim();
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
        voiceDesignModel: voiceDesignModel.trim(),
        imageModel: imageModel.trim(),
        defaultVoice,
        contentLocale,
        tts,
        asrPluginConfig: asrCfg,
        ttsPluginConfig: ttsCfg,
      });
      setAuthSession(res.token, res.username);
      navigate({ name: 'home' }, { replace: true });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const asrSetupSchema = (asrPlugin?.configSchema || []).filter(
    (f) => f.key !== 'model',
  );
  const ttsSetupSchema = (ttsPlugin?.configSchema || []).filter(
    (f) =>
      f.key !== 'model' &&
      f.key !== 'defaultVoice' &&
      f.key !== (ttsPlugin?.voiceConfigKey || ''),
  );

  if (loading) {
    return <PageLoader label={t('setup.checking')} variant="screen" />;
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
                placeholder="https://api.xiaomimimo.com/v1"
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
                    const meta = providerFromList(asrProviders, id);
                    const suggested = meta?.suggestedModels?.asr;
                    if (suggested) setAsrModel(suggested);
                    else if (id === 'openai') setAsrModel('whisper-1');
                    else if (id === 'mimo') setAsrModel('mimo-v2.5-asr');
                    else if (id === 'local-whisper') setAsrModel('base');
                  }}
                >
                  {asrProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="auth-field">
                <span>{t('setup.ttsProvider')}</span>
                <select
                  value={ttsProvider}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTtsProvider(id);
                    const meta = providerFromList(ttsProviders, id);
                    const plugin = toTtsPluginDescriptor(meta);
                    setTtsPlugin(plugin);

                    const suggestedModel = meta?.suggestedModels?.tts;
                    if (suggestedModel) setTtsModel(suggestedModel);
                    else if (id === 'edge') setTtsModel('edge-neural');
                    else if (id === 'openai') setTtsModel('tts-1');
                    else if (id === 'mimo') setTtsModel('mimo-v2.5-tts');

                    const vd = meta?.suggestedModels?.voiceDesign;
                    if (vd) setVoiceDesignModel(vd);
                    else if (id === 'mimo') {
                      setVoiceDesignModel(DEFAULTS.voiceDesignModel);
                    }

                    setTts(buildDefaultTtsForProvider(id, plugin));
                  }}
                >
                  {ttsProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="auth-field">
                <span>{t('setup.asrModel')}</span>
                <input
                  value={asrModel}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAsrModel(v);
                    setAsrConfigDraft((prev) => ({ ...prev, model: v }));
                  }}
                  spellCheck={false}
                />
              </label>
              <label className="auth-field">
                <span>{t('setup.ttsModel')}</span>
                <input
                  value={ttsModel}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTtsModel(v);
                    setTtsConfigDraft((prev) => ({ ...prev, model: v }));
                  }}
                  spellCheck={false}
                />
              </label>
              {/* edge 音色统一在 step4 插件面板选择，避免双入口不同步 */}
              {ttsProvider === 'edge' && (
                <div className="auth-tip auth-field-span2">
                  <span>{t('setup.edgeHint')}</span>
                </div>
              )}
              {Boolean(
                providerFromList(ttsProviders, ttsProvider)?.supportsVoiceDesign ||
                  ttsProvider === 'mimo',
              ) && (
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

            {(asrSetupSchema.length || ttsSetupSchema.length) ? (
              <div className="setup-plugin-config">
                {asrSetupSchema.length && asrPlugin ? (
                  <div className="source-plugin-config-panel plugin-config-panel setup-plugin-config-panel">
                    <div className="plugin-config-panel-head">
                      <strong>
                        {t('setup.pluginConfigAsrTitle', {
                          name: asrPlugin.name || asrProvider,
                        })}
                      </strong>
                      <span>{t('setup.pluginConfigHint')}</span>
                    </div>
                    <PluginConfigFields
                      schema={asrSetupSchema}
                      draft={asrConfigDraft}
                      status={asrPlugin.configStatus}
                      idPrefix={`setup-asr-${asrPlugin.id}`}
                      onChange={(key, value) => {
                        setAsrConfigDraft((prev) => {
                          const next = { ...prev, [key]: value };
                          if (key === 'model') setAsrModel(value);
                          return next;
                        });
                      }}
                    />
                  </div>
                ) : null}
                {ttsSetupSchema.length && ttsPlugin ? (
                  <div className="source-plugin-config-panel plugin-config-panel setup-plugin-config-panel">
                    <div className="plugin-config-panel-head">
                      <strong>
                        {t('setup.pluginConfigTtsTitle', {
                          name: ttsPlugin.name || ttsProvider,
                        })}
                      </strong>
                      <span>{t('setup.pluginConfigHint')}</span>
                    </div>
                    <PluginConfigFields
                      schema={ttsSetupSchema}
                      draft={ttsConfigDraft}
                      status={ttsPlugin.configStatus}
                      idPrefix={`setup-tts-${ttsPlugin.id}`}
                      onChange={(key, value) => {
                        setTtsConfigDraft((prev) => {
                          const next = { ...prev, [key]: value };
                          if (key === 'model') setTtsModel(value);
                          return next;
                        });
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

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
            <TtsModePicker
              value={tts}
              provider={ttsProvider}
              plugin={ttsPlugin}
              onChange={setTts}
            />
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
