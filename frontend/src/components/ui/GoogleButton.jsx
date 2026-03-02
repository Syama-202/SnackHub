import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID } from '../../constants/auth';

/**
 * Google's own "Continue with Google" button (Google Identity Services, doc 16.1). Google
 * draws and runs it; on success it hands back an ID token, which goes to our backend.
 * The script loads only on screens that show this button.
 */
let loading = null;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve(window.google);
      s.onerror = () => {
        loading = null;
        reject(new Error('Google sign-in could not load'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export default function GoogleButton({ onCredential, disabled = false }) {
  const box = useRef(null);
  const handler = useRef(onCredential);
  handler.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGoogle()
      .then((google) => {
        if (!alive || !box.current) return;
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (res) => res.credential && handler.current(res.credential),
          ux_mode: 'popup',
          context: 'signin',
          itp_support: true,
        });
        google.accounts.id.renderButton(box.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'left', width: Math.min(box.current.clientWidth || 320, 400) });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return <p className="rounded-xl bg-red/10 p-3 text-sm text-red-text">Google sign-in could not load. Check your connection, or turn off a blocker for accounts.google.com, then reload.</p>;
  return <div ref={box} className={disabled ? 'pointer-events-none flex min-h-11 justify-center opacity-60' : 'flex min-h-11 justify-center'} aria-busy={disabled} />;
}
