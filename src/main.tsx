import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { ServicesProvider } from './context/ServicesContext';
import { StorageProvider } from './context/StorageContext';
import { ThemeProvider } from './context/ThemeContext';
import { UserDataProvider } from './context/UserDataContext';
import { AppSettingsProvider } from './context/AppSettingsContext';
import './services/pwa/InstallService';

import './styles/tokens.css';
import './styles/reset.css';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// An installed production worker on localhost can otherwise keep serving an
// obsolete UI while developing. Production uses auto-update + skipWaiting.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  const staleWorkerReloadKey = 'revision-engine:dev-worker-cleared';
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    if (registrations.length === 0) {
      sessionStorage.removeItem(staleWorkerReloadKey);
      return;
    }
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if (navigator.serviceWorker.controller && !sessionStorage.getItem(staleWorkerReloadKey)) {
      sessionStorage.setItem(staleWorkerReloadKey, 'true');
      window.location.reload();
    }
  });
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ServicesProvider>
        <AuthProvider>
          <StorageProvider>
            <ThemeProvider>
              <AppSettingsProvider>
                <UserDataProvider>
                  <App />
                </UserDataProvider>
              </AppSettingsProvider>
            </ThemeProvider>
          </StorageProvider>
        </AuthProvider>
      </ServicesProvider>
    </BrowserRouter>
  </StrictMode>,
);
