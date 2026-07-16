import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  changePassword,
  fetchAiSettings,
  fetchMe,
  logout,
  saveAiSettings,
  type PublicAiConfig,
} from '../api/client';
import { GlobalScriptPromptSettings } from '../components/admin/GlobalScriptPromptSettings';
import { GlobalTtsSettings } from '../components/admin/GlobalTtsSettings';
import {
  IconCheck,
  IconLink,
  IconMic,
  IconRefresh,
  IconSpark,
} from '../components/icons';
import { clearAuthSession } from '../lib/auth';
import { navigate, type Route } from '../lib/router';
import { AppShell } from '../layouts/AppShell';

type SettingsTab = 'voice' | 'persona' | 'ai' | 'account';

const TABS: Array<{
  id: SettingsTab;
  label: string;
  short: string;
  desc: string;
  icon: (props: { size?: number }) => ReactNode;
}> = [
  {
    id: 'voice',
    label: '全局音色',
    short: '音色',
    desc: '制作时选择「使用全局」会套用这里的播音音色',
    icon: IconMic,
  },
  {
    id: 'persona',
    label: '口播人设',
    short: '人设',
    desc: '主播身份、节目风格与开场收尾偏好',
    icon: IconSpark,
  },
  {
    id: 'ai',
    label: 'AI 服务',
    short: 'AI',
    desc: '接口密钥、地址与生成模型',
    icon: IconLink,
  },
  {
    id: 'account',
    label: '账号安全',
    short: '账号',
    desc: '登录身份、密码与退出',
    icon: IconCheck,
  },
];

export function SettingsPage({ route }: { route: Route }) {
  const [tab, setTab] = useState<SettingsTab>('voice');
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
        <header className="settings-hero">
          <div className="settings-hero-copy">
            <div className="page-kicker">Settings</div>
            <h1 className="page-title">系统设置</h1>
            <p className="page-subtitle">
              一次只看一块配置，改完再切下一项
              {username ? (
                <>
                  {' · '}
                  <strong>{username}</strong>
                </>
              ) : null}
            </p>
          </div>
          <div className="settings-hero-actions">
            <button
              type="button"
              className="nl-btn nl-btn-ghost studio-icon-btn"
              onClick={() => void load()}
              aria-label="刷新"
              title="刷新"
            >
              <IconRefresh size={15} />
            </button>
          </div>
        </header>

        <div className="settings-shell">
          <nav className="settings-nav" aria-label="设置分类">
            <div className="settings-nav-track" role="tablist">
              {TABS.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`settings-tab-${item.id}`}
                    aria-selected={active}
                    aria-controls={`settings-panel-${item.id}`}
                    className={['settings-nav-item', active ? 'is-active' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setTab(item.id)}
                  >
                    <span className="settings-nav-icon" aria-hidden>
                      <Icon size={15} />
                    </span>
                    <span className="settings-nav-copy">
                      <span className="settings-nav-label">{item.label}</span>
                      <span className="settings-nav-desc">{item.desc}</span>
                    </span>
                    <span className="settings-nav-short">{item.short}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="settings-main">
            <div className="settings-panel-intro">
              <h2>{activeTab.label}</h2>
              <p>{activeTab.desc}</p>
            </div>

            {loading ? (
              <div className="auth-loading">加载设置…</div>
            ) : (
              <div className="settings-tab-panels">
                {tab === 'voice' && (
                  <div
                    className="settings-tab-panel"
                    role="tabpanel"
                    id="settings-panel-voice"
                    aria-labelledby="settings-tab-voice"
                  >
                    <GlobalTtsSettings />
                  </div>
                )}

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
                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>连接</h3>
                          <p>
                            API Key 留空表示不修改
                            {ai?.apiKeySet ? ' · 已配置' : ' · 未配置'}
                          </p>
                        </div>
                        <div className="settings-fields">
                          <label className="auth-field">
                            <span>API Key</span>
                            <input
                              type="password"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              placeholder={
                                ai?.apiKeySet ? '已配置，输入新值以覆盖' : 'sk-...'
                              }
                              autoComplete="off"
                            />
                          </label>
                          <label className="auth-field">
                            <span>Base URL</span>
                            <input
                              value={baseUrl}
                              onChange={(e) => setBaseUrl(e.target.value)}
                              placeholder="https://api.example.com/v1"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>模型</h3>
                          <p>各环节使用的模型 ID，按需修改</p>
                        </div>
                        <div className="settings-fields settings-fields-2">
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
                              onChange={(e) =>
                                setVoiceDesignModel(e.target.value)
                              }
                            />
                          </label>
                        </div>
                        <label className="auth-field settings-field-span">
                          <span>默认音色 ID</span>
                          <input
                            value={defaultVoice}
                            onChange={(e) => setDefaultVoice(e.target.value)}
                            placeholder="服务端回落音色，可与全局音色配合"
                          />
                        </label>
                      </div>

                      <div className="settings-card-actions">
                        <span className="settings-card-hint">
                          仅管理员可修改
                        </span>
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
                      <div className="settings-profile">
                        <div className="settings-profile-avatar" aria-hidden>
                          {(username || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="settings-profile-meta">
                          <div className="settings-profile-name">
                            {username || '…'}
                          </div>
                          <div className="settings-profile-sub">
                            本地管理员账号
                          </div>
                        </div>
                        <button
                          type="button"
                          className="nl-btn nl-btn-ghost"
                          onClick={() => void onLogout()}
                        >
                          退出登录
                        </button>
                      </div>

                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>修改密码</h3>
                          <p>更新后会自动退出，请使用新密码重新登录</p>
                        </div>
                        <div className="settings-fields">
                          <label className="auth-field">
                            <span>当前密码</span>
                            <input
                              type="password"
                              value={currentPassword}
                              onChange={(e) =>
                                setCurrentPassword(e.target.value)
                              }
                              autoComplete="current-password"
                            />
                          </label>
                          <div className="settings-fields-2">
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
                                onChange={(e) =>
                                  setConfirmPassword(e.target.value)
                                }
                                autoComplete="new-password"
                              />
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="settings-card-actions">
                        <span />
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
          </div>
        </div>

        {msg && <div className="settings-toast is-ok">{msg}</div>}
        {error && <div className="settings-toast is-err">{error}</div>}
      </div>
    </AppShell>
  );
}
