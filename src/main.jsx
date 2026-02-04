import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

async function boot() {
  // Phase 1: every /api/v1 call is served by the in-browser mock (MSW)
  if (import.meta.env.VITE_USE_MOCKS !== 'false') {
    const { startMocks } = await import('./mocks/browser');
    await startMocks();
  }
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();
