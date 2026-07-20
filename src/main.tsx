import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { I18nProvider } from './i18n.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installCrashGuard } from './lib/crashGuard';

// R2: capture errors/rejections that escape React before anything else runs.
installCrashGuard();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* R1: a render error shows a recoverable panel instead of a blank screen. */}
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
