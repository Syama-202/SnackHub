// Private document storage, under a random 32-character key; the original file name is never
// used or kept. Nothing serves it directly: a file is read only through a signed, five-minute
// link that the API hands out after checking who is asking (utils/signedUrl.js,
// controllers/files.js). Two stores with the same methods (STORAGE_DRIVER):
//   disk  STORAGE_DIR, outside every public or static folder
//   s3    a private bucket at any S3-compatible service (Cloudflare R2, Backblaze B2, AWS S3);
//         the bucket stays private and the API reads each file itself, so no bucket link is
//         ever given out
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const KEY = /^[a-f0-9]{32}$/;
const checked = (key) => {
  if (!KEY.test(key)) throw new Error('Bad storage key');
  return key;
};
const newKey = () => randomBytes(16).toString('hex');

function diskStorage(env) {
  const root = path.resolve(env.STORAGE_DIR);
  const where = (key) => path.join(root, checked(key).slice(0, 2), key);
  const write = async (key, buffer) => {
    await mkdir(path.dirname(where(key)), { recursive: true });
    // wx: never overwrite, even in the impossible case of a repeated key
    await writeFile(where(key), buffer, { flag: 'wx', mode: 0o600 });
  };
  return {
    kind: 'disk',
    /** Stores bytes under a new random key; returns the key. */
    async put(buffer) {
      const key = newKey();
      await write(key, buffer);
      return key;
    },
    /** Stores bytes under a fixed key (the demo seed's placeholder files); replaces them. */
    write: async (key, buffer) => {
      await rm(where(key), { force: true });
      await write(key, buffer);
    },
    read: (key) => readFile(where(key)),
    remove: (key) => rm(where(key), { force: true }),
  };
}

function s3Storage(env) {
  // loaded only when used, so a laptop on disk storage never loads the SDK
  let client = null;
  const sdk = async () => {
    const s3 = await import('@aws-sdk/client-s3');
    client ??= new s3.S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      // R2 and B2 address buckets by path
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
    return s3;
  };
  const write = async (key, buffer) => {
    const s3 = await sdk();
    await client.send(new s3.PutObjectCommand({ Bucket: env.S3_BUCKET, Key: checked(key), Body: buffer, ContentType: 'application/octet-stream' }));
  };
  return {
    kind: 's3',
    async put(buffer) {
      const key = newKey();
      await write(key, buffer);
      return key;
    },
    write,
    async read(key) {
      const s3 = await sdk();
      const out = await client.send(new s3.GetObjectCommand({ Bucket: env.S3_BUCKET, Key: checked(key) }));
      return Buffer.from(await out.Body.transformToByteArray());
    },
    async remove(key) {
      const s3 = await sdk();
      await client.send(new s3.DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: checked(key) }));
    },
  };
}

export function createStorage(env) {
  return env.STORAGE_DRIVER === 's3' ? s3Storage(env) : diskStorage(env);
}
