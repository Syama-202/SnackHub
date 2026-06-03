import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion } from 'motion/react';
import './styles/index.css';
import App from './App.jsx';
import { setApiReady } from './services/api';
import { watchErrors } from './services/errors';

// crashes the app does not catch go to the error log (admin console, Errors)
watchErrors('web');

// Phase 1: every /api/v1 call is served by the in-browser mock (MSW). It starts in
// parallel with the first render; API calls wait for it, the first paint does not.
if (import.meta.env.VITE_USE_MOCKS !== 'false') {
  setApiReady(import('./mocks/browser').then((m) => m.startMocks()));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* the animation engine arrives after the first paint; m.* components wait for it */}
    <LazyMotion features={() => import('./utils/motionFeatures').then((f) => f.default)} strict>
      <App />
    </LazyMotion>
  </StrictMode>,
);
