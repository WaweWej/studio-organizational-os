export type Sealed = { version: 1; iv: string; ciphertext: string };
export type VaultConfig = {
  id: string;
  salt: string;
  iterations: number;
  version: 1;
  verifier: Sealed;
};
export type Credential = {
  username: string;
  password: string;
  url: string;
  notes: string;
};
const encoder = new TextEncoder();
export function toBase64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}
export function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export async function deriveVaultKey(password: string, salt: string) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(salt),
      iterations: 600000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function seal(
  key: CryptoKey,
  vaultId: string,
  recordId: string,
  value: unknown,
): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    cipher = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: encoder.encode(
          `studio:vault:v1:${vaultId}:${recordId}`,
        ),
        tagLength: 128,
      },
      key,
      encoder.encode(JSON.stringify(value)),
    );
  return {
    version: 1,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(cipher)),
  };
}
export async function unseal<T>(
  key: CryptoKey,
  vaultId: string,
  recordId: string,
  value: Sealed,
): Promise<T> {
  if (value.version !== 1) throw new Error('Unsupported vault format.');
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(value.iv),
      additionalData: encoder.encode(`studio:vault:v1:${vaultId}:${recordId}`),
      tagLength: 128,
    },
    key,
    fromBase64(value.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
export async function createVault(password: string) {
  if (password.length < 16)
    throw new Error('Use a master passphrase of at least 16 characters.');
  const id = crypto.randomUUID(),
    salt = toBase64(crypto.getRandomValues(new Uint8Array(16))),
    key = await deriveVaultKey(password, salt),
    verifier = await seal(key, id, 'verifier', 'Studio vault unlocked');
  return {
    key,
    config: { id, salt, iterations: 600000, version: 1 as const, verifier },
  };
}
export async function unlockVault(password: string, config: VaultConfig) {
  if (config.version !== 1 || config.iterations !== 600000)
    throw new Error('Unsupported vault configuration.');
  const key = await deriveVaultKey(password, config.salt);
  if (
    (await unseal(key, config.id, 'verifier', config.verifier)) !==
    'Studio vault unlocked'
  )
    throw new Error('Could not unlock vault.');
  return key;
}
export function generatePassword() {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-=?';
  let result = '';
  while (result.length < 24) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    for (const byte of bytes) {
      if (byte < 256 - (256 % alphabet.length))
        result += alphabet[byte % alphabet.length];
      if (result.length === 24) break;
    }
  }
  return result;
}
