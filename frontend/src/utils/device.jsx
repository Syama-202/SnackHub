// A random id for this browser, so the backend keeps one sign-in session per device
// (doc 16.1). Not a secret and not tied to the person.
const KEY = 'snackhub.device';

export function deviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // storage blocked: a new id each visit, which only means a new session per visit
    return crypto.randomUUID();
  }
}
