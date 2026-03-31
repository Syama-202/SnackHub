import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion } from 'motion/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import '../styles/index.css';
import store from './store';
import { setApiHost, setApiReady } from '../services/api';
import AdminApp from './App';

// Every admin request carries the admin host marker; the public host answers 404 (doc 16.3)
setApiHost('admin');

if (import.meta.env.VITE_USE_MOCKS !== 'false') {
  setApiReady(import('../mocks/browser').then((m) => m.startMocks()));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* the animation engine arrives after the first paint; m.* components wait for it */}
    <LazyMotion features={() => import('../utils/motionFeatures').then((f) => f.default)} strict>
      <Provider store={store}>
        <BrowserRouter basename={window.location.pathname.startsWith('/admin.html') ? '/admin.html' : '/'}>
          <AdminApp />
        </BrowserRouter>
      </Provider>
    </LazyMotion>
  </StrictMode>,
);
