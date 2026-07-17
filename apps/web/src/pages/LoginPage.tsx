import { useEffect, useState } from 'react';
import { fetchSetupStatus, login } from '../api/client';
import { BrandMascot } from '../components/BrandMark';
import { PageLoader } from '../components/ui/PageLoader';
import { OpenSourceMark } from '../components/OpenSourceMark';
import { useI18n } from '../i18n';
import { getStoredUsername, setAuthSession } from '../lib/auth';
import {
  formatSiteTitle,
  getCachedSiteName,
  setCachedSiteName,
} from '../lib/site';
import { navigate } from '../lib/router';

export function LoginPage({
  onGuestBrowse,
}: {
  onGuestBrowse?: () => void;
} = {}) {
  const { t } = useI18n();
  const [username, setUsername] = useState(getStoredUsername() || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [guestHomePublic, setGuestHomePublic] = useState(false);
  const [siteTitle, setSiteTitle] = useState(() => formatSiteTitle(getCachedSiteName()));

  useEffect(() => {
    void (async () => {
      try {
        const status = await fetchSetupStatus();
        if (!status.initialized) {
          navigate({ name: 'setup' });
          return;
        }
        setGuestHomePublic(Boolean(status.guestHomePublic));
        const name = status.siteName || '';
        setCachedSiteName(name);
        setSiteTitle(status.siteTitle || formatSiteTitle(name));
      } catch {
        // ignore
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
    return <PageLoader label={t('auth.loading')} variant="screen" />;
  }

  return (
    <div className="auth-screen">
      <form className="auth-card nl-enter" onSubmit={(e) => void onSubmit(e)}>
        <div className="auth-brand auth-brand-stack">
          <BrandMascot size={96} className="auth-brand-mascot" />
          <div className="auth-brand-copy">
            <div className="auth-brand-title">{siteTitle}</div>
            <div className="auth-brand-sub">{t('auth.brandSub')}</div>
          </div>
        </div>

        <h1 className="auth-title">{t('auth.welcomeBack')}</h1>
        <p className="auth-desc">{t('auth.desc')}</p>

        <div className="auth-form">
          <label className="auth-field">
            <span>{t('auth.username')}</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="auth-field">
            <span>{t('auth.password')}</span>
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
            {loading ? t('auth.loggingIn') : t('auth.login')}
          </button>
        </div>

        {guestHomePublic && (
          <button
            type="button"
            className="nl-btn nl-btn-secondary auth-guest-btn"
            onClick={() => onGuestBrowse?.()}
          >
            {t('auth.browseAsGuest')}
          </button>
        )}

        <OpenSourceMark className="auth-open-source" />
      </form>
    </div>
  );
}
