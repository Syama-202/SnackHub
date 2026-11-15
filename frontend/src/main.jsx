import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion } from 'motion/react';
import './styles/index.css';
import App from './App.jsx';
import { watchErrors } from './services/errors';

// crashes the app does not catch go to the error log (admin console, Errors)
watchErrors('web');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* the animation engine arrives after the first paint; m.* components wait for it */}
    <LazyMotion features={() => import('./utils/motionFeatures').then((f) => f.default)} strict>
      <App />
    </LazyMotion>
  </StrictMode>,
);
