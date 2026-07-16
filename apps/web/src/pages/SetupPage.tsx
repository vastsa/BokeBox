import { useEffect, useMemo, useState } from 'react';
import {
  completeSetup,
  fetchSetupStatus,
  type SetupStatus,
} from '../api/client';
import { IconCheck, IconHeadphones, IconSpark } from '../components/icons';
import { setAuthSession } from '../lib/auth';
import { navigate } from '../lib/router';

type Step = 1 | 2 | 3;

const DEFAULTS = {
  baseUrl: 'https://api.oj.ink/v1',
  chatModel: 'mimo-v2.5',
  asrModel: 'mimo-v2.5-asr',
  ttsModel: 'mimo-v2.5-tts',
  voiceDesignModel: 'mimo-v2.5-tts-voicedesign',
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
  const [defaultVoice, setDefaultVoice] = useState(DEFAULTS.defaultVoice);

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
          setDefaultVoice(s.defaultVoice || DEFAULTS.defaultVoice);
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
    if (step === 2) return '配置模型服务，用于转写、写稿与合成';
    return '确认模型参数，完成后即可开始使用';
  }, [step]);

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
    }
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
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
        defaultVoice: defaultVoice.trim(),
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
            <div className="auth-brand-title">Person Boke</div>
            <div className="auth-brand-sub">首次使用 · 系统初始化</div>
          </div>
        </div>

        <h1 className="auth-title">欢迎使用</h1>
        <p className="auth-desc">{stepHint}</p>

        <div className="setup-steps" aria-label="初始化步骤">
          {[1, 2, 3].map((n) => (
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
              <i>{step > n ? <IconCheck size={12} /> : n}</i>
              <span>
                {n === 1 ? '账号' : n === 2 ? 'API' : '模型'}
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
                placeholder="例如 admin"
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
              <span>兼容 OpenAI 协议的网关即可，后续可在设置中修改。</span>
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
                />
              </label>
              <label className="auth-field">
                <span>转写模型</span>
                <input
                  value={asrModel}
                  onChange={(e) => setAsrModel(e.target.value)}
                />
              </label>
              <label className="auth-field">
                <span>TTS 模型</span>
                <input
                  value={ttsModel}
                  onChange={(e) => setTtsModel(e.target.value)}
                />
              </label>
              <label className="auth-field">
                <span>音色设计模型</span>
                <input
                  value={voiceDesignModel}
                  onChange={(e) => setVoiceDesignModel(e.target.value)}
                />
              </label>
            </div>
            <label className="auth-field">
              <span>默认音色</span>
              <input
                value={defaultVoice}
                onChange={(e) => setDefaultVoice(e.target.value)}
                placeholder="冰糖"
              />
            </label>
          </div>
        )}

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-actions">
          {step > 1 ? (
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => {
                setError(null);
                setStep((s) => (s === 3 ? 2 : 1));
              }}
              disabled={submitting}
            >
              上一步
            </button>
          ) : (
            <span />
          )}
          {step < 3 ? (
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
