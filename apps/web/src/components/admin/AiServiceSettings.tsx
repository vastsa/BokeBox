import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  fetchAiSettings,
  saveAiSettings,
  saveTtsSettings,
  type PublicAiConfig,
} from '../../api/client';
import {
  EDGE_VOICE_OPTIONS,
  WHISPER_LANG_OPTIONS,
  WHISPER_MODEL_OPTIONS,
} from '../../lib/providerOptions';
import { useI18n } from '../../i18n';
import { PageLoader } from '../ui/PageLoader';

type ServiceKeyForm = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const emptyService = (): ServiceKeyForm => ({
  baseUrl: '',
  apiKey: '',
  model: '',
});

type ProviderOpt = {
  id: string;
  name: string;
  description: string;
  available?: boolean;
  suggestedModels?: Record<string, string>;
};

function ServiceCard({
  badge,
  title,
  desc,
  children,
}: {
  badge?: string;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-card settings-card-wide">
      <div className="settings-block">
        <div className="settings-block-head">
          {badge ? (
            <div className="ai-service-card-badge" aria-hidden>
              {badge}
            </div>
          ) : null}
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

/**
 * AI 服务设置：按 LLM / ASR / TTS / 图片分卡片配置
 * 各服务可独立端点与密钥；留空则继承「默认连接」
 */
export function AiServiceSettings({
  onMessage,
  onError,
}: {
  onMessage?: (msg: string | null) => void;
  onError?: (msg: string | null) => void;
}) {
  const { t } = useI18n();
  const [ai, setAi] = useState<PublicAiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [globalBaseUrl, setGlobalBaseUrl] = useState('');
  const [globalApiKey, setGlobalApiKey] = useState('');

  const [llm, setLlm] = useState<ServiceKeyForm>(emptyService());
  const [asr, setAsr] = useState<ServiceKeyForm>(emptyService());
  const [tts, setTts] = useState<ServiceKeyForm>(emptyService());
  const [image, setImage] = useState<ServiceKeyForm>(emptyService());

  const [asrProvider, setAsrProvider] = useState('mimo');
  const [ttsProvider, setTtsProvider] = useState('mimo');
  const [whisperBin, setWhisperBin] = useState('');
  const [whisperLang, setWhisperLang] = useState('');
  const [voiceDesignModel, setVoiceDesignModel] = useState('');
  const [defaultVoice, setDefaultVoice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    onError?.(null);
    try {
      const cfg = await fetchAiSettings();
      setAi(cfg);
      setGlobalBaseUrl(cfg.baseUrl || '');
      setGlobalApiKey('');
      setLlm({
        baseUrl: cfg.llm?.baseUrl || '',
        apiKey: '',
        model: cfg.llm?.model || cfg.chatModel || '',
      });
      setAsr({
        baseUrl: cfg.asr?.baseUrl || '',
        apiKey: '',
        model: cfg.asr?.model || cfg.asrModel || '',
      });
      setTts({
        baseUrl: cfg.tts?.baseUrl || '',
        apiKey: '',
        model: cfg.tts?.model || cfg.ttsModel || '',
      });
      setImage({
        baseUrl: cfg.image?.baseUrl || '',
        apiKey: '',
        model: cfg.image?.model || cfg.imageModel || '',
      });
      setAsrProvider(cfg.asr?.provider || cfg.asrProvider || 'mimo');
      setTtsProvider(cfg.tts?.provider || cfg.ttsProvider || 'mimo');
      setWhisperBin(cfg.asr?.whisperBin || cfg.whisperBin || '');
      setWhisperLang(cfg.asr?.whisperLang || cfg.whisperLang || '');
      setVoiceDesignModel(
        cfg.tts?.voiceDesignModel || cfg.voiceDesignModel || '',
      );
      setDefaultVoice(cfg.tts?.defaultVoice || cfg.defaultVoice || '');
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    setSaving(true);
    onMessage?.(null);
    onError?.(null);
    try {
      const next = await saveAiSettings({
        apiKey: globalApiKey.trim() || undefined,
        baseUrl: globalBaseUrl.trim(),
        chatModel: llm.model.trim(),
        asrModel: asr.model.trim(),
        ttsModel: tts.model.trim(),
        imageModel: image.model.trim(),
        voiceDesignModel: voiceDesignModel.trim(),
        defaultVoice: defaultVoice.trim(),
        asrProvider: asrProvider.trim() || 'mimo',
        ttsProvider: ttsProvider.trim() || 'mimo',
        whisperBin: whisperBin.trim(),
        whisperLang: whisperLang.trim(),
        llmBaseUrl: llm.baseUrl.trim(),
        llmApiKey: llm.apiKey.trim(),
        asrBaseUrl: asr.baseUrl.trim(),
        asrApiKey: asr.apiKey.trim(),
        ttsBaseUrl: tts.baseUrl.trim(),
        ttsApiKey: tts.apiKey.trim(),
        imageBaseUrl: image.baseUrl.trim(),
        imageApiKey: image.apiKey.trim(),
      });
      setAi(next);
      setGlobalApiKey('');
      setLlm((s) => ({ ...s, apiKey: '' }));
      setAsr((s) => ({ ...s, apiKey: '' }));
      setTts((s) => ({ ...s, apiKey: '' }));
      setImage((s) => ({ ...s, apiKey: '' }));
      try {
        const voice = defaultVoice.trim();
        if (voice) {
          await saveTtsSettings({ mode: 'default', voice });
        }
      } catch {
        // ignore
      }
      onMessage?.(t('settings.aiSaved'));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="settings-card settings-card-wide">
        <div className="settings-block">
          <PageLoader label={t('settings.loading')} variant="block" />
        </div>
      </section>
    );
  }

  const asrProviders: ProviderOpt[] = ai?.asrProviders?.length
    ? ai.asrProviders
    : [
        { id: 'mimo', name: 'MiMo ASR', description: '' },
        { id: 'openai', name: 'OpenAI 兼容 ASR', description: '' },
        { id: 'local-whisper', name: '本地 Whisper', description: '' },
      ];
  const ttsProviders: ProviderOpt[] = ai?.ttsProviders?.length
    ? ai.ttsProviders
    : [
        { id: 'mimo', name: 'MiMo TTS', description: '' },
        { id: 'openai', name: 'OpenAI 兼容 TTS', description: '' },
        { id: 'edge', name: 'Edge TTS', description: '' },
      ];

  const inheritHint = t('settings.endpointInheritHint');
  const keyPlaceholder = (set?: boolean) =>
    set ? t('settings.apiKeyOverride') : inheritHint;

  return (
    <div className="ai-service-settings">
      <ServiceCard
        title={t('settings.svcDefaults')}
        desc={t('settings.svcDefaultsDesc')}
      >
        <div className="settings-fields settings-fields-2">
          <label className="auth-field">
            <span>Base URL</span>
            <input
              value={globalBaseUrl}
              onChange={(e) => setGlobalBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="auth-field">
            <span>API Key</span>
            <input
              value={globalApiKey}
              onChange={(e) => setGlobalApiKey(e.target.value)}
              placeholder={
                ai?.apiKeySet
                  ? t('settings.apiKeyOverride')
                  : t('settings.apiKeyOptionalPlaceholder')
              }
              autoComplete="off"
            />
          </label>
        </div>
        <p className="settings-field-tip">
          {ai?.apiKeySet
            ? `${t('settings.apiKeySet')} · ${ai.apiKeyHint}`
            : t('settings.apiKeyUnset')}
        </p>
      </ServiceCard>

      <ServiceCard
        badge="LLM"
        title={t('settings.svcLlm')}
        desc={t('settings.svcLlmDesc')}
      >
        <div className="settings-fields settings-fields-2">
          <label className="auth-field">
            <span>{t('settings.svcEndpoint')}</span>
            <input
              value={llm.baseUrl}
              onChange={(e) => setLlm((s) => ({ ...s, baseUrl: e.target.value }))}
              placeholder={inheritHint}
              spellCheck={false}
            />
          </label>
          <label className="auth-field">
            <span>{t('settings.svcApiKey')}</span>
            <input
              value={llm.apiKey}
              onChange={(e) => setLlm((s) => ({ ...s, apiKey: e.target.value }))}
              placeholder={keyPlaceholder(ai?.llm?.apiKeySet)}
              autoComplete="off"
            />
          </label>
          <label className="auth-field auth-field-span2">
            <span>{t('settings.chatModel')}</span>
            <input
              value={llm.model}
              onChange={(e) => setLlm((s) => ({ ...s, model: e.target.value }))}
              placeholder="mimo-v2.5 / gpt-4o-mini"
              spellCheck={false}
            />
          </label>
        </div>
      </ServiceCard>

      <ServiceCard
        badge="ASR"
        title={t('settings.svcAsr')}
        desc={t('settings.svcAsrDesc')}
      >
        <div className="settings-fields settings-fields-2">
          <label className="auth-field">
            <span>{t('settings.asrProvider')}</span>
            <select
              value={asrProvider}
              onChange={(e) => {
                const id = e.target.value;
                setAsrProvider(id);
                const meta = asrProviders.find((p) => p.id === id);
                const suggested = meta?.suggestedModels?.asr;
                if (suggested) setAsr((s) => ({ ...s, model: suggested }));
                else if (id === 'local-whisper')
                  setAsr((s) => ({ ...s, model: 'base' }));
                else if (id === 'openai')
                  setAsr((s) => ({ ...s, model: 'whisper-1' }));
                else if (id === 'mimo')
                  setAsr((s) => ({ ...s, model: 'mimo-v2.5-asr' }));
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
            <span>{t('settings.asrModel')}</span>
            <input
              value={asr.model}
              onChange={(e) => setAsr((s) => ({ ...s, model: e.target.value }))}
              list={
                asrProvider === 'local-whisper'
                  ? 'ai-svc-whisper-models'
                  : undefined
              }
              placeholder={
                asrProvider === 'local-whisper'
                  ? 'base / small / ggml 路径'
                  : 'mimo-v2.5-asr / whisper-1'
              }
              spellCheck={false}
            />
            {asrProvider === 'local-whisper' ? (
              <datalist id="ai-svc-whisper-models">
                {WHISPER_MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            ) : null}
          </label>

          {asrProvider !== 'local-whisper' ? (
            <>
              <label className="auth-field">
                <span>{t('settings.svcEndpoint')}</span>
                <input
                  value={asr.baseUrl}
                  onChange={(e) =>
                    setAsr((s) => ({ ...s, baseUrl: e.target.value }))
                  }
                  placeholder={inheritHint}
                  spellCheck={false}
                />
              </label>
              <label className="auth-field">
                <span>{t('settings.svcApiKey')}</span>
                <input
                  value={asr.apiKey}
                  onChange={(e) =>
                    setAsr((s) => ({ ...s, apiKey: e.target.value }))
                  }
                  placeholder={keyPlaceholder(ai?.asr?.apiKeySet)}
                  autoComplete="off"
                />
              </label>
            </>
          ) : (
            <>
              <label className="auth-field auth-field-span2">
                <span>{t('settings.whisperBin')}</span>
                <input
                  value={whisperBin}
                  onChange={(e) => setWhisperBin(e.target.value)}
                  placeholder={t('settings.whisperBinPlaceholder')}
                  spellCheck={false}
                />
              </label>
              <label className="auth-field">
                <span>{t('settings.whisperLang')}</span>
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
              <p className="settings-field-tip auth-field-span2">
                {t('settings.whisperHint')}
              </p>
            </>
          )}
        </div>
      </ServiceCard>

      <ServiceCard
        badge="TTS"
        title={t('settings.svcTts')}
        desc={t('settings.svcTtsDesc')}
      >
        <div className="settings-fields settings-fields-2">
          <label className="auth-field">
            <span>{t('settings.ttsProvider')}</span>
            <select
              value={ttsProvider}
              onChange={(e) => {
                const id = e.target.value;
                setTtsProvider(id);
                const meta = ttsProviders.find((p) => p.id === id);
                const suggested = meta?.suggestedModels?.tts;
                if (suggested) setTts((s) => ({ ...s, model: suggested }));
                else if (id === 'edge')
                  setTts((s) => ({ ...s, model: 'edge-neural' }));
                else if (id === 'openai')
                  setTts((s) => ({ ...s, model: 'tts-1' }));
                else if (id === 'mimo')
                  setTts((s) => ({ ...s, model: 'mimo-v2.5-tts' }));
                const voice = meta?.suggestedModels?.defaultVoice;
                if (voice) setDefaultVoice(voice);
                else if (id === 'edge') setDefaultVoice('zh-CN-XiaoxiaoNeural');
                else if (id === 'openai') setDefaultVoice('alloy');
                else if (id === 'mimo') setDefaultVoice('冰糖');
                const vd = meta?.suggestedModels?.voiceDesign;
                if (vd) setVoiceDesignModel(vd);
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
            <span>{t('settings.ttsModel')}</span>
            <input
              value={tts.model}
              onChange={(e) => setTts((s) => ({ ...s, model: e.target.value }))}
              placeholder="mimo-v2.5-tts / tts-1 / edge-neural"
              spellCheck={false}
              disabled={ttsProvider === 'edge'}
            />
          </label>

          {ttsProvider !== 'edge' ? (
            <>
              <label className="auth-field">
                <span>{t('settings.svcEndpoint')}</span>
                <input
                  value={tts.baseUrl}
                  onChange={(e) =>
                    setTts((s) => ({ ...s, baseUrl: e.target.value }))
                  }
                  placeholder={inheritHint}
                  spellCheck={false}
                />
              </label>
              <label className="auth-field">
                <span>{t('settings.svcApiKey')}</span>
                <input
                  value={tts.apiKey}
                  onChange={(e) =>
                    setTts((s) => ({ ...s, apiKey: e.target.value }))
                  }
                  placeholder={keyPlaceholder(ai?.tts?.apiKeySet)}
                  autoComplete="off"
                />
              </label>
            </>
          ) : null}

          {ttsProvider === 'mimo' ? (
            <label className="auth-field">
              <span>{t('settings.voiceDesignModel')}</span>
              <input
                value={voiceDesignModel}
                onChange={(e) => setVoiceDesignModel(e.target.value)}
                spellCheck={false}
              />
            </label>
          ) : null}

          <label className="auth-field">
            <span>
              {ttsProvider === 'edge'
                ? t('settings.edgeVoice')
                : t('settings.defaultVoiceId')}
            </span>
            {ttsProvider === 'edge' ? (
              <select
                value={defaultVoice}
                onChange={(e) => setDefaultVoice(e.target.value)}
              >
                {EDGE_VOICE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.language}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={defaultVoice}
                onChange={(e) => setDefaultVoice(e.target.value)}
                placeholder={t('settings.defaultVoicePlaceholder')}
                spellCheck={false}
              />
            )}
          </label>

          {ttsProvider === 'edge' ? (
            <p className="settings-field-tip auth-field-span2">
              {t('settings.edgeHint')}
            </p>
          ) : null}
        </div>
      </ServiceCard>

      <ServiceCard
        badge="IMG"
        title={t('settings.svcImage')}
        desc={t('settings.svcImageDesc')}
      >
        <div className="settings-fields settings-fields-2">
          <label className="auth-field">
            <span>{t('settings.svcEndpoint')}</span>
            <input
              value={image.baseUrl}
              onChange={(e) =>
                setImage((s) => ({ ...s, baseUrl: e.target.value }))
              }
              placeholder={inheritHint}
              spellCheck={false}
            />
          </label>
          <label className="auth-field">
            <span>{t('settings.svcApiKey')}</span>
            <input
              value={image.apiKey}
              onChange={(e) =>
                setImage((s) => ({ ...s, apiKey: e.target.value }))
              }
              placeholder={keyPlaceholder(ai?.image?.apiKeySet)}
              autoComplete="off"
            />
          </label>
          <label className="auth-field auth-field-span2">
            <span>{t('settings.imageModel')}</span>
            <input
              value={image.model}
              onChange={(e) =>
                setImage((s) => ({ ...s, model: e.target.value }))
              }
              placeholder={t('settings.imagePlaceholder')}
              spellCheck={false}
            />
          </label>
        </div>
        <p className="settings-field-tip">
          {t('settings.imageHintPrefix')}
          <code>/images/generations</code> {t('settings.imageHintSuffix')}
        </p>
      </ServiceCard>

      <section className="settings-card settings-card-wide">
        <div className="settings-card-actions">
          <span className="settings-card-hint">{t('settings.adminOnly')}</span>
          <button
            type="button"
            className="nl-btn nl-btn-primary"
            onClick={() => void onSave()}
            disabled={saving}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </section>
    </div>
  );
}
