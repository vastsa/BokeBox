import { useEffect, useMemo, useState } from 'react';
import {
  changePassword,
  fetchAiSettings,
  fetchMe,
  logout,
  saveAiSettings,
  type PublicAiConfig,
} from '../api/client';
import { GlobalScriptPromptSettings } from '../components/admin/GlobalScriptPromptSettings';
import {
  IconCheck,
  IconRefresh,
  IconSpark,
} from '../components/icons';
import { clearAuthSession } from '../lib/auth';
import { navigate, type Route } from '../lib/router';
import { AppShell } from '../layouts/AppShell';

type SettingsTab = 'persona' | 'ai' | 'account';

const TABS: Array<{ id: SettingsTab; label: string; desc: string }> = [
  { id: 'persona', label: '口播人设', desc: '全局主播风格与提示词' },
  { id: 'ai', label: 'AI 服务', desc: 'API Key 与模型参数' },
  { id: 'account', label: '账号', desc: '密码与登录状态' },
];

export function SettingsPage({ route }: { route: Route }) {
  const [tab, setTab] = useState<SettingsTab>('persona');
  const [username, setUsername] = useState('');
  const [ai, setAi] = useState<PublicAiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingAi, setSavingAi] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [asrModel, setAsrModel] = useState('');
  const [ttsModel, setTtsModel] = useState('');
  const [voiceDesignModel, setVoiceDesignModel] = useState('');
  const [defaultVoice, setDefaultVoice] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const activeTab = useMemo(
    () => TABS.find((t) => t.id === tab) || TABS[0],
    [tab],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, aiCfg] = await Promise.all([fetchMe(), fetchAiSettings()]);
      setUsername(me.username);
      setAi(aiCfg);
      setBaseUrl(aiCfg.baseUrl);
      setChatModel(aiCfg.chatModel);
      setAsrModel(aiCfg.asrModel);
      setTtsModel(aiCfg.ttsModel);
      setVoiceDesignModel(aiCfg.voiceDesignModel);
      setDefaultVoice(aiCfg.defaultVoice);
      setApiKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // 切换 tab 时清掉瞬时提示，避免串台
  useEffect(() => {
    setMsg(null);
    setError(null);
  }, [tab]);

  const onSaveAi = async () => {
    setSavingAi(true);
    setMsg(null);
    setError(null);
    try {
      const next = await saveAiSettings({
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim(),
        chatModel: chatModel.trim(),
        asrModel: asrModel.trim(),
        ttsModel: ttsModel.trim(),
        voiceDesignModel: voiceDesignModel.trim(),
        defaultVoice: defaultVoice.trim(),
      });
      setAi(next);
      setApiKey('');
      setMsg('AI 配置已保存');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAi(false);
    }
  };

  const onChangePassword = async () => {
    setSavingPw(true);
    setMsg(null);
    setError(null);
    try {
      const res = await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      clearAuthSession();
      setMsg(res.message || '密码已更新，请重新登录');
      window.setTimeout(() => navigate({ name: 'login' }), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPw(false);
    }
  };

  const onLogout = async () => {
    await logout();
    clearAuthSession();
    navigate({ name: 'login' });
  };

  return (
    <AppShell route={route}>
      <div className="admin-container nl-enter settings-page">
        <header className="studio-head">
          <div className="studio-head-copy">
            <div className="page-kicker">Settings</div>
            <h1 className="page-title">系统设置</h1>
            <p className="page-subtitle">
              {activeTab.desc}
              {username ? (
                <>
                  {' · '}
                  <strong>{username}</strong>
                </>
              ) : null}
            </p>
          </div>
          <div className="studio-head-actions">
            <button
              type="button"
              className="nl-btn nl-btn-ghost studio-icon-btn"
              onClick={() => void load()}
              aria-label="刷新"
              title="刷新"
            >
              <IconRefresh size={15} />
            </button>
            <button
              type="button"
              className="nl-btn nl-btn-secondary"
              onClick={() => void onLogout()}
            >
              退出登录
            </button>
          </div>
        </header>

        <div
          className="settings-tabs"
          role="tablist"
          aria-label="设置分类"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`settings-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`settings-panel-${item.id}`}
              className={[
                'settings-tab',
                tab === item.id ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="auth-loading">加载设置…</div>
        ) : (
          <div className="settings-tab-panels">
            {tab === 'persona' && (
              <div
                className="settings-tab-panel"
                role="tabpanel"
                id="settings-panel-persona"
                aria-labelledby="settings-tab-persona"
              >
                <GlobalScriptPromptSettings />
              </div>
            )}

            {tab === 'ai' && (
              <div
                className="settings-tab-panel"
                role="tabpanel"
                id="settings-panel-ai"
                aria-labelledby="settings-tab-ai"
              >
                <section className="settings-card settings-card-wide">
                  <div className="settings-card-head">
                    <IconSpark size={16} />
                    <div>
                      <h2>AI 服务</h2>
                      <p>
                        {ai?.apiKeySet
                          ? `已配置密钥 ${ai.apiKeyHint}`
                          : '尚未配置 API Key'}
                      </p>
                    </div>
                  </div>

                  <div className="auth-form">
                    <label className="auth-field">
                      <span>API Key（留空则不修改）</span>
                      <input
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={ai?.apiKeyHint || 'sk-...'}
                        autoComplete="off"
                      />
                    </label>
                    <label className="auth-field">
                      <span>API Base URL</span>
                      <input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                      />
                    </label>
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
                      />
                    </label>
                  </div>

                  <div className="settings-card-actions">
                    <span />
                    <button
                      type="button"
                      className="nl-btn nl-btn-primary"
                      onClick={() => void onSaveAi()}
                      disabled={savingAi}
                    >
                      {savingAi ? '保存中…' : '保存 AI 配置'}
                    </button>
                  </div>
                </section>
              </div>
            )}

            {tab === 'account' && (
              <div
                className="settings-tab-panel"
                role="tabpanel"
                id="settings-panel-account"
                aria-labelledby="settings-tab-account"
              >
                <section className="settings-card settings-card-wide">
                  <div className="settings-card-head">
                    <IconCheck size={16} />
                    <div>
                      <h2>账号安全</h2>
                      <p>
                        当前用户 <strong>{username || '…'}</strong>
                        ，修改密码后需要重新登录
                      </p>
                    </div>
                  </div>

                  <div className="auth-form">
                    <label className="auth-field">
                      <span>当前密码</span>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                    </label>
                    <label className="auth-field">
                      <span>新密码</span>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                    <label className="auth-field">
                      <span>确认新密码</span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                  </div>

                  <div className="settings-card-actions">
                    <button
                      type="button"
                      className="nl-btn nl-btn-ghost"
                      onClick={() => void onLogout()}
                    >
                      退出登录
                    </button>
                    <button
                      type="button"
                      className="nl-btn nl-btn-secondary"
                      onClick={() => void onChangePassword()}
                      disabled={savingPw}
                    >
                      {savingPw ? '更新中…' : '更新密码'}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        )}

        {msg && <div className="settings-toast is-ok">{msg}</div>}
        {error && <div className="settings-toast is-err">{error}</div>}
      </div>
    </AppShell>
  );
}
