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
import { GlobalTtsSettings } from '../components/admin/GlobalTtsSettings';
import { IconRefresh } from '../components/icons';
import { clearAuthSession } from '../lib/auth';
import { navigate, type Route } from '../lib/router';
import { AppShell } from '../layouts/AppShell';

type SettingsTab = 'voice' | 'persona' | 'ai' | 'account';

const TABS: Array<{
  id: SettingsTab;
  label: string;
  desc: string;
}> = [
  {
    id: 'voice',
    label: '全局音色',
    desc: '制作任务默认采用的 TTS 配置',
  },
  {
    id: 'persona',
    label: '口播人设',
    desc: '脚本生成时使用的主播与节目设定',
  },
  {
    id: 'ai',
    label: 'AI 服务',
    desc: '接口凭证、服务地址与模型参数',
  },
  {
    id: 'account',
    label: '账号与安全',
    desc: '管理员身份、密码与会话',
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
            <div className="page-kicker">Administration</div>
            <h1 className="page-title">系统设置</h1>
            <p className="page-subtitle">
              管理全局默认配置与管理员账户
              {username ? ` · ${username}` : ''}
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
            <div className="settings-nav-label">配置项</div>
            <div className="settings-nav-track" role="tablist">
              {TABS.map((item) => {
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
                    <span className="settings-nav-item-label">{item.label}</span>
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
                          <h3>连接配置</h3>
                          <p>接口凭证与服务端点。API Key 留空表示保持不变。</p>
                        </div>
                        <div className="settings-fields">
                          <label className="auth-field">
                            <span>
                              API Key
                              <em className="settings-field-meta">
                                {ai?.apiKeySet ? '已配置' : '未配置'}
                              </em>
                            </span>
                            <input
                              type="password"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              placeholder={
                                ai?.apiKeySet
                                  ? '输入新密钥以覆盖'
                                  : '请输入 API Key'
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
                              spellCheck={false}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>模型参数</h3>
                          <p>各处理环节使用的模型标识。</p>
                        </div>
                        <div className="settings-fields settings-fields-2">
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
                              onChange={(e) =>
                                setVoiceDesignModel(e.target.value)
                              }
                              spellCheck={false}
                            />
                          </label>
                        </div>
                        <label className="auth-field settings-field-span">
                          <span>默认音色 ID</span>
                          <input
                            value={defaultVoice}
                            onChange={(e) => setDefaultVoice(e.target.value)}
                            placeholder="服务端回落音色"
                            spellCheck={false}
                          />
                        </label>
                      </div>

                      <div className="settings-card-actions">
                        <span className="settings-card-hint">仅管理员可修改</span>
                        <button
                          type="button"
                          className="nl-btn nl-btn-primary"
                          onClick={() => void onSaveAi()}
                          disabled={savingAi}
                        >
                          {savingAi ? '保存中…' : '保存'}
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
                        <div className="settings-profile-meta">
                          <div className="settings-profile-kicker">当前账户</div>
                          <div className="settings-profile-name">
                            {username || '—'}
                          </div>
                          <div className="settings-profile-sub">管理员</div>
                        </div>
                        <button
                          type="button"
                          className="nl-btn nl-btn-secondary"
                          onClick={() => void onLogout()}
                        >
                          退出登录
                        </button>
                      </div>

                      <div className="settings-block">
                        <div className="settings-block-head">
                          <h3>修改密码</h3>
                          <p>更新后当前会话将失效，需使用新密码重新登录。</p>
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
                          className="nl-btn nl-btn-primary"
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
