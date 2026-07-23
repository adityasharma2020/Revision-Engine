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
import { DeviceNotificationSettingsProvider } from './context/DeviceNotificationSettingsContext';
import { PdfWorkspaceProvider } from './context/PdfWorkspaceContext';
import { FocusTimerProvider } from './context/FocusTimerContext';
import './services/pwa/InstallService';

import './styles/tokens.css';
import './styles/reset.css';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// Desktop trackpads expose pinch as Ctrl/Command + wheel. Prevent Chrome from
// scaling the application; PDF zoom is available only through explicit controls.
window.addEventListener('wheel', (event) => {
  if (event.ctrlKey || event.metaKey) event.preventDefault();
}, { passive: false });

// Some Android WebViews and browsers ignore `user-scalable=no` when a pinch
// begins over nested canvas/SVG content. Cancel native multi-touch zoom while
// still allowing the PDF reader to use two-finger panning.
document.addEventListener('touchmove', (event) => {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false, capture: true });

// Safari exposes native page pinch through non-standard gesture events.
const preventPageGesture = (event: Event) => event.preventDefault();
document.addEventListener('gesturestart', preventPageGesture, { passive: false });
document.addEventListener('gesturechange', preventPageGesture, { passive: false });

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
                <DeviceNotificationSettingsProvider>
                  <PdfWorkspaceProvider>
                    <UserDataProvider>
                      <FocusTimerProvider>
                        <App />
                      </FocusTimerProvider>
                    </UserDataProvider>
                  </PdfWorkspaceProvider>
                </DeviceNotificationSettingsProvider>
              </AppSettingsProvider>
            </ThemeProvider>
          </StorageProvider>
        </AuthProvider>
      </ServicesProvider>
    </BrowserRouter>
  </StrictMode>,
);
