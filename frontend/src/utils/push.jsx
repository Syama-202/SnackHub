// The browser side of push notifications: the service worker at /push/sw.js and this
// device's subscription. The server decides who gets what (shared/domain/push.js).
const SW_URL = '/push/sw.js';
const SCOPE = '/push/';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

// 'granted' | 'denied' | 'default', or 'unsupported'
export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported');

const registration = async () => (await navigator.serviceWorker.getRegistration(SCOPE)) ?? navigator.serviceWorker.register(SW_URL, { scope: SCOPE });

/** This device's current subscription, or null. */
export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  return reg ? reg.pushManager.getSubscription() : null;
}

const keyBytes = (b64url) => {
  const s = atob((b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Asks the browser for permission (once) and subscribes with the server's public key. */
export async function subscribeDevice(publicKey) {
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  // a subscription made with an older key cannot receive messages signed with the new one
  if (existing && existing.options?.applicationServerKey) {
    const old = new Uint8Array(existing.options.applicationServerKey);
    const now = keyBytes(publicKey);
    if (old.length === now.length && old.every((b, i) => b === now[i])) return existing.toJSON();
    await existing.unsubscribe();
  }
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  return sub.toJSON();
}

/** Ends this device's subscription in the browser; returns its endpoint for the server. */
export async function unsubscribeDevice() {
  const sub = await currentSubscription();
  if (!sub) return null;
  const { endpoint } = sub;
  await sub.unsubscribe();
  return endpoint;
}

/** A short label for the device list, e.g. "Chrome on Android"; never the full user agent. */
export function deviceLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'a device';
  return `${browser} on ${os}`;
}
