import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App.jsx';
import { setApiReady } from './services/api';

// Phase 1: every /api/v1 call is served by the in-browser mock (MSW). It starts in
// parallel with the first render; API calls wait for it, the first paint does not.
if (import.meta.env.VITE_USE_MOCKS !== 'false') {
  setApiReady(import('./mocks/browser').then((m) => m.startMocks()));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
