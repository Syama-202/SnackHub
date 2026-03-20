// Private document storage. Files go to STORAGE_DIR (outside every public or static folder)
// under a random 32-character key; the original file name is never used or kept. Nothing
// serves this folder directly: a file is read only through a signed, five-minute link that
// the API hands out after checking who is asking (utils/signedUrl.js, controllers/files.js).
// An S3-compatible bucket with private ACLs and presigned URLs can replace this module.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const KEY = /^[a-f0-9]{32}$/;

export function createStorage(env) {
  const root = path.resolve(env.STORAGE_DIR);
  const where = (key) => {
    if (!KEY.test(key)) throw new Error('Bad storage key');
    return path.join(root, key.slice(0, 2), key);
  };
  return {
    /** Stores bytes under a new random key; returns the key. */
    async put(buffer) {
      const key = randomBytes(16).toString('hex');
      await mkdir(path.dirname(where(key)), { recursive: true });
      // wx: never overwrite, even in the impossible case of a repeated key
      await writeFile(where(key), buffer, { flag: 'wx', mode: 0o600 });
      return key;
    },
    read: (key) => readFile(where(key)),
    remove: (key) => rm(where(key), { force: true }),
  };
}
