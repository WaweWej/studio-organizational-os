// Studio-kept file bytes. With an R2 bucket bound, bytes live there; without
// one — card-free deployments — small files live in the database and larger
// files belong in Google Drive. Both backends present the same four
// operations, and every record carries the upload fingerprint that makes
// retries answerable.
import { env } from 'cloudflare:workers';
import { AppError } from './validation';
import type { Context } from './store';

export type StoredObject = {
  body: BodyInit;
  customMetadata?: Record<string, string>;
};
export type StudioStore = {
  put(
    key: string,
    content: ArrayBuffer | Uint8Array,
    options: { customMetadata: { captureFingerprint: string } },
  ): Promise<void>;
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
};

// Database-kept files stay small; real documents belong in Google Drive.
export const DB_FILE_LIMIT = 1024 * 1024;

export function studioStore(c: Context): StudioStore {
  const bucket = (env as { ASSETS?: R2Bucket }).ASSETS;
  if (bucket) {
    return {
      async put(key, content, options) {
        await bucket.put(key, content, options);
      },
      async head(key) {
        const object = await bucket.head(key);
        return object
          ? { customMetadata: object.customMetadata ?? {} }
          : null;
      },
      async get(key) {
        const object = await bucket.get(key);
        return object
          ? {
              body: object.body,
              customMetadata: object.customMetadata ?? {},
            }
          : null;
      },
      async delete(key) {
        await bucket.delete(key);
      },
    };
  }
  return {
    async put(key, content, options) {
      const bytes =
        content instanceof Uint8Array ? content : new Uint8Array(content);
      if (bytes.byteLength > DB_FILE_LIMIT)
        throw new AppError(
          'Without R2 storage, Studio keeps files up to 1 MB. Connect Google Drive for larger files.',
          413,
        );
      await c.db
        .prepare(
          'INSERT OR REPLACE INTO fileBlobs (org,key,fingerprint,bytes,createdAt) VALUES (?,?,?,?,?)',
        )
        .bind(
          c.org,
          key,
          options.customMetadata.captureFingerprint,
          bytes,
          new Date().toISOString(),
        )
        .run();
    },
    async head(key) {
      const row = await c.db
        .prepare('SELECT fingerprint FROM fileBlobs WHERE org=? AND key=?')
        .bind(c.org, key)
        .first<{ fingerprint: string }>();
      return row
        ? { customMetadata: { captureFingerprint: row.fingerprint } }
        : null;
    },
    async get(key) {
      const row = await c.db
        .prepare(
          'SELECT fingerprint,bytes FROM fileBlobs WHERE org=? AND key=?',
        )
        .bind(c.org, key)
        .first<{ fingerprint: string; bytes: ArrayBuffer }>();
      return row
        ? {
            body: new Uint8Array(row.bytes) as unknown as BodyInit,
            customMetadata: { captureFingerprint: row.fingerprint },
          }
        : null;
    },
    async delete(key) {
      await c.db
        .prepare('DELETE FROM fileBlobs WHERE org=? AND key=?')
        .bind(c.org, key)
        .run();
    },
  };
}
