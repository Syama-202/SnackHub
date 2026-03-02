// Google sign-in settings (doc 16.1). Public values only: the client ID is not a secret.
// Until a real Web client ID is set in frontend/.env.local, the app keeps the demo sign-in.
const id = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const GOOGLE_CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/.test(id) && !id.startsWith('placeholder') ? id : null;
