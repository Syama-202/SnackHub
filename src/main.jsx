import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import './styles/index.css';
import { store, actions } from './store/webStore';
import { configureApi } from './lib/api';
import App from './App';

configureApi({
  tokenGetter: () => store.getState().auth.token,
  unauthorized: () => store.dispatch(actions.signedOut()),
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (n, e) => n < 2 && (!e?.status || e.status >= 500), refetchOnWindowFocus: false } },
});

async function boot() {
  if (import.meta.env.VITE_USE_MOCKS !== 'false') {
    const { startMocks } = await import('./mocks/browser');
    await startMocks();
  }
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </Provider>
    </StrictMode>,
  );
}

boot();
