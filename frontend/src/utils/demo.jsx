// The one-tap demo runs on an in-browser mock API (MSW, src/mocks). In development the mock
// starts with the page, as before (VITE_USE_MOCKS=false turns it off). In a production build
// it starts only when a visitor picks a demo account, and again on that browser's next visits
// until the demo session ends. So real visitors never download it, and never get its made-up
// answers when the API is slow or down. VITE_USE_MOCKS=true makes a production build start
// it on every page, for a site that is only a demo.
import { setApiReady } from '../services/api';

const KEY = 'snackhub.demo';
const flag = import.meta.env.VITE_USE_MOCKS;
const always = import.meta.env.DEV ? flag !== 'false' : flag === 'true';

const remembered = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
const remember = (on) => {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the demo lasts until the page reloads */
  }
};

let running = null;

/** Whether this page is answered by the mock (demo data) rather than only the real API. */
export const mocksRunning = () => Boolean(running);

function start() {
  if (!running) {
    running = import('../mocks/browser').then((m) => m.startMocks());
    // API calls wait for the mock; the first paint does not
    setApiReady(running);
  }
  return running;
}

/** At page load: start the mock when this build always has it, or this browser is in a demo. */
export function startMocksAtBoot() {
  if (always || remembered()) start();
}

/** Before a demo sign-in: the demo accounts live in the mock. */
export async function enterDemo() {
  remember(true);
  await start();
}

/** The demo session ended (signed out, or nothing to restore): real visits skip the mock again. */
export async function leaveDemo() {
  if (always) return;
  remember(false);
  if (!running) return;
  const m = await import('../mocks/browser');
  m.worker.stop();
  running = null;
  setApiReady(Promise.resolve());
}
