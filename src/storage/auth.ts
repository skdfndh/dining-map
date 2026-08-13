export interface PasswordConfig {
  salt: string;
  iterations: number;
  digestHex: string;
}
const SESSION_KEY = 'dining-map:editor-session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function derivePasswordDigest(
  password: string,
  salt: string,
  iterations = 120_000,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function verifyPassword(password: string, config: PasswordConfig): Promise<boolean> {
  return (
    (await derivePasswordDigest(password, config.salt, config.iterations)) === config.digestHex
  );
}

export function grantEditorSession(now = Date.now()): void {
  localStorage.setItem(SESSION_KEY, String(now + SESSION_MS));
}
export function hasEditorSession(now = Date.now()): boolean {
  return Number(localStorage.getItem(SESSION_KEY) ?? 0) > now;
}
export function clearEditorSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
