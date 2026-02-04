import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import '../index.css';
import store from './store';
import { setApiHost } from '../lib/api';
import AdminApp from './AdminApp';

// Every admin request carries the admin host marker; the public host answers 404 (doc 16.3)
setApiHost('admin');

async function boot() {
  if (import.meta.env.VITE_USE_MOCKS !== 'false') {
    const { startMocks } = await import('../mocks/browser');
    await startMocks();
  }
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <Provider store={store}>
        <BrowserRouter basename={window.location.pathname.startsWith('/admin.html') ? '/admin.html' : '/'}>
          <AdminApp />
        </BrowserRouter>
      </Provider>
    </StrictMode>,
  );
}

boot();
