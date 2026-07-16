import { useEffect, useMemo, useState } from 'react';
import {
  completeSetup,
  fetchSetupStatus,
  type SetupStatus,
} from '../api/client';
import { TtsModePicker } from '../components/admin/TtsModePicker';
import { DEFAULT_GLOBAL_TTS, summarizeTts } from '../components/admin/GlobalTtsSettings';
import { IconCheck, IconHeadphones, IconMic, IconSpark } from '../components/icons';
import { setAuthSession } from '../lib/auth';
import { navigate } from '../lib/router';
import type { TtsOptions } from '../types/job';

type Step = 1 | 2 | 3 | 4;

const DEFAULTS = {
  baseUrl: 'https://api.oj.ink/v1',
  chatModel: 'mimo-v2.5',
  asrModel: 'mimo-v2.5-asr',
  ttsModel: 'mimo-v2.5-tts',
  voiceDesignModel: 'mimo-v2.5-tts-voicedesign',
  imageModel: '',
  defaultVoice: '冰糖',
};

export function SetupPage() {
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
  const [ttsModel, setTtsModel] = useState(DEFAULTS.ttsModel);
  const [voiceDesignModel, setVoiceDesignModel] = useState(
    DEFAULTS.voiceDesignModel,
  );
  const [imageModel, setImageModel] = useState(DEFAULTS.imageModel);
  const [tts, setTts] = useState<TtsOptions>({
    ...DEFAULT_GLOBAL_TTS,
    voice: DEFAULTS.defaultVoice,
  });

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
          setTtsModel(s.ttsModel || DEFAULTS.ttsModel);
          setVoiceDesignModel(s.voiceDesignModel || DEFAULTS.voiceDesignModel);
          setImageModel(s.imageModel || DEFAULTS.imageModel);
          const voice = s.defaultVoice || DEFAULTS.defaultVoice;
          setTts((prev) => ({
            ...prev,
            mode: 'default',
            voice,
          }));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stepHint = useMemo(() => {
    if (step === 1) return '创建登录账号，保护你的私人播客库';
    if (step === 2) return '配置模型服务，用于转写、写稿、合成与封面';
    if (step === 3) return '填写各环节模型，含可选的图片封面模型';
    return '设置全局默认音色，制作时会默认使用';
  }, [step]);

  const ttsSummary = useMemo(() => summarizeTts(tts), [tts]);

  const goNext = () => {
    setError(null);
    if (step === 1) {
      if (username.trim().length < 2) {
        setError('用户名至少 2 个字符');
        return;
      }
      if (password.length < 6) {
        setError('密码至少 6 位');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次密码不一致');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!apiKey.trim()) {
        setError('请填写 API Key');
        return;
      }
      if (!baseUrl.trim()) {
        setError('请填写 API Base URL');
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!chatModel.trim() || !asrModel.trim() || !ttsModel.trim()) {
        setError('请完整填写模型名称');
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
        ttsModel: ttsModel.trim(),
        voiceDesignModel: voiceDesignModel.trim(),
        imageModel: imageModel.trim(),
        defaultVoice,
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
          <div className="auth-loading">正在检查系统状态…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card-wide nl-enter">
        <div className="auth-brand">
          <span className="brand-mark">
            <IconHeadphones size={16} />
          </span>
          <div>
            <div className="auth-brand-title">BokeBox</div>
            <div className="auth-brand-sub">首次使用 · 系统初始化</div>
          </div>
        </div>

        <h1 className="auth-title">欢迎使用</h1>
        <p className="auth-desc">{stepHint}</p>

        <div className="setup-steps" aria-label="初始化步骤">
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
                  ? '账号'
                  : n === 2
                    ? '服务'
                    : n === 3
                      ? '模型'
                      : '音色'}
              </span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="auth-form">
            <label className="auth-field">
              <span>用户名</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin"
              />
            </label>
            <label className="auth-field">
              <span>密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="至少 6 位"
              />
            </label>
            <label className="auth-field">
              <span>确认密码</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="再输入一次"
              />
            </label>
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
                placeholder="sk-..."
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
              <span>兼容 OpenAI 协议的网关即可（含 /v1/images/generations 图片接口），后续可在设置中修改。</span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="auth-form">
            <div className="auth-grid-2">
              <label className="auth-field">
                <span>对话模型</span>
                <input
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="auth-field">
                <span>转写模型</span>
                <input
                  value={asrModel}
                  onChange={(e) => setAsrModel(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="auth-field">
                <span>TTS 模型</span>
                <input
                  value={ttsModel}
                  onChange={(e) => setTtsModel(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="auth-field">
                <span>音色设计模型</span>
                <input
                  value={voiceDesignModel}
                  onChange={(e) => setVoiceDesignModel(e.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="setup-image-model">
              <label className="auth-field">
                <span>图片模型</span>
                <input
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  placeholder="例如 dall-e-3 / flux… 留空则用渐变封面"
                  spellCheck={false}
                />
              </label>
              <div className="auth-tip">
                <IconSpark size={14} />
                <span>
                  初始化时即可配置。填写后生成播客会调用
                  <code> /v1/images/generations </code>
                  自动出封面；留空可之后在设置里补。
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
                <div className="setup-tts-title">全局默认音色</div>
                <div className="setup-tts-desc">
                  当前：<strong>{ttsSummary}</strong>
                  。制作时默认使用，也可在设置中修改。
                </div>
              </div>
            </div>
            <TtsModePicker value={tts} onChange={setTts} />
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
              上一步
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
              下一步
            </button>
          ) : (
            <button
              type="button"
              className="nl-btn nl-btn-primary"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? '初始化中…' : '完成并进入'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
