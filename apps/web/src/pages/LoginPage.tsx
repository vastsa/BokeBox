import { useEffect, useState } from 'react';
import { fetchSetupStatus, login } from '../api/client';
import { IconHeadphones } from '../components/icons';
import { getStoredUsername, setAuthSession } from '../lib/auth';
import { navigate } from '../lib/router';

export function LoginPage() {
  const [username, setUsername] = useState(getStoredUsername() || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const status = await fetchSetupStatus();
        if (!status.initialized) {
          navigate({ name: 'setup' });
          return;
        }
      } catch {
        // 忽略，允许尝试登录
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login({
        username: username.trim(),
        password,
      });
      setAuthSession(res.token, res.username);
      window.location.hash = '/home';
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-loading">加载中…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card nl-enter" onSubmit={(e) => void onSubmit(e)}>
        <div className="auth-brand">
          <span className="brand-mark">
            <IconHeadphones size={16} />
          </span>
          <div>
            <div className="auth-brand-title">BokeBox</div>
            <div className="auth-brand-sub">登录你的私人播客</div>
          </div>
        </div>

        <h1 className="auth-title">欢迎回来</h1>
        <p className="auth-desc">输入初始化时设置的账号密码</p>

        <div className="auth-form">
          <label className="auth-field">
            <span>用户名</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="auth-field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-actions">
          <span />
          <button
            type="submit"
            className="nl-btn nl-btn-primary"
            disabled={loading}
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </div>
      </form>
    </div>
  );
}
