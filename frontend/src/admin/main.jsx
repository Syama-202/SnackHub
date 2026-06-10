import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion } from 'motion/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import '../styles/index.css';
import store from './store';
import { setApiHost } from '../services/api';
import { startMocksAtBoot } from '../utils/demo';
import { watchErrors } from '../services/errors';
import AdminApp from './App';
import WakingNotice from '../components/layout/WakingNotice';

// Every admin request carries the admin host marker; the public host answers 404 (doc 16.3)
setApiHost('admin');
watchErrors('admin');

// the demo admin's in-browser mock API: always in development, in production only once chosen
startMocksAtBoot();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* the animation engine arrives after the first paint; m.* components wait for it */}
    <LazyMotion features={() => import('../utils/motionFeatures').then((f) => f.default)} strict>
      <Provider store={store}>
        <BrowserRouter basename={window.location.pathname.startsWith('/admin.html') ? '/admin.html' : '/'}>
          <AdminApp />
          <WakingNotice />
        </BrowserRouter>
      </Provider>
    </LazyMotion>
  </StrictMode>,
);
