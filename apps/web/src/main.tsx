import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider, initLocale } from './i18n';
import { initTheme } from './lib/theme';
import { initSeoRuntime } from './lib/seo';
import { initDisablePageZoom } from './lib/disablePageZoom';
import './styles/index.css';

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
