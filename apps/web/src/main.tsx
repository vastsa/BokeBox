import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider, initLocale } from './i18n';
import { initTheme } from './lib/theme';
import { initSeoRuntime } from './lib/seo';
import { initDisablePageZoom } from './lib/disablePageZoom';
import './styles/index.css';

function dismissBootSplash() {
  const el = document.getElementById('boot-splash');
  if (!el) return;
  const remove = () => {
    el.remove();
  };
  // 等 React 首帧绘制完成后再淡出，与 PageLoader 接力
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add('is-leaving');
      window.setTimeout(remove, 380);
    });
  });
}

initTheme();
initLocale();
initSeoRuntime();
initDisablePageZoom();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);

// React 挂载后收起原生启动层
dismissBootSplash();
