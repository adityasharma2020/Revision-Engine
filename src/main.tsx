import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { ServicesProvider } from './context/ServicesContext';
import { StorageProvider } from './context/StorageContext';
import { ThemeProvider } from './context/ThemeContext';
import { UserDataProvider } from './context/UserDataContext';

import './styles/tokens.css';
import './styles/reset.css';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ServicesProvider>
        <AuthProvider>
          <StorageProvider>
            <ThemeProvider>
              <UserDataProvider>
                <App />
              </UserDataProvider>
            </ThemeProvider>
          </StorageProvider>
        </AuthProvider>
      </ServicesProvider>
    </BrowserRouter>
  </StrictMode>,
);
