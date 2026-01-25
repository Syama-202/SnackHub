import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import '../styles/index.css';
import { makeStore } from '../store/index';
import { configureApi } from '../lib/api';
import AdminApp from './AdminApp';

export const { store, actions } = makeStore('admin');

// Every admin request carries the admin host marker; the public host answers 404 (doc 16.3)
configureApi({ tokenGetter: () => store.getState().auth.token, host: 'admin', unauthorized: () => store.dispatch(actions.signedOut()) });

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

async function boot() {
  if (import.meta.env.VITE_USE_MOCKS !== 'false') {
    const { startMocks } = await import('../mocks/browser');
    await startMocks();
  }
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename={window.location.pathname.startsWith('/admin.html') ? '/admin.html' : '/'}>
            <AdminApp actions={actions} />
          </BrowserRouter>
        </QueryClientProvider>
      </Provider>
    </StrictMode>,
  );
}

boot();
