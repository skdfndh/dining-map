import { importEventJson, MAX_EVENT_FILE_BYTES } from './data';
import type { DiningEvent } from '../domain/types';

export const ENCRYPTED_EVENT_FILENAME = 'event.enc.json';
export const ENCRYPTION_ITERATIONS = 310_000;
export const MIN_PUBLICATION_PASSWORD_LENGTH = 12;
export const MAX_ENCRYPTED_EVENT_BYTES = 8 * 1024 * 1024;

export interface EncryptedEventEnvelope {
  version: 1;
  algorithm: 'AES-GCM-256';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string, label: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error(`${label} 编码无效`);
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new Error(`${label} 编码无效`);
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function parseEncryptedEnvelope(text: string): EncryptedEventEnvelope {
  if (new Blob([text]).size > MAX_ENCRYPTED_EVENT_BYTES) throw new Error('加密活动文件过大');
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    throw new Error('加密活动文件不是有效 JSON');
  }
  if (!candidate || typeof candidate !== 'object') throw new Error('加密活动文件结构无效');
  const value = candidate as Record<string, unknown>;
  if (
    value.version !== 1 ||
    value.algorithm !== 'AES-GCM-256' ||
    value.kdf !== 'PBKDF2-SHA-256' ||
    !Number.isInteger(value.iterations) ||
    (value.iterations as number) < 100_000 ||
    (value.iterations as number) > 1_000_000 ||
    typeof value.salt !== 'string' ||
    typeof value.iv !== 'string' ||
    typeof value.ciphertext !== 'string'
  )
    throw new Error('加密活动文件版本或参数不受支持');

  const salt = base64ToBytes(value.salt, '盐值');
  const iv = base64ToBytes(value.iv, '随机向量');
  const ciphertext = base64ToBytes(value.ciphertext, '密文');
  if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 17)
    throw new Error('加密活动文件参数无效');
  return value as unknown as EncryptedEventEnvelope;
}

export async function encryptEventJson(
  plaintext: string,
  password: string,
): Promise<EncryptedEventEnvelope> {
  if (new Blob([plaintext]).size > MAX_EVENT_FILE_BYTES) throw new Error('活动内容超过 5 MB');
  if (password.length < MIN_PUBLICATION_PASSWORD_LENGTH)
    throw new Error(`查看密码至少需要 ${MIN_PUBLICATION_PASSWORD_LENGTH} 个字符`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ENCRYPTION_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    version: 1,
    algorithm: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA-256',
    iterations: ENCRYPTION_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptEventJson(
  envelopeOrText: EncryptedEventEnvelope | string,
  password: string,
): Promise<DiningEvent> {
  const envelope =
    typeof envelopeOrText === 'string'
      ? parseEncryptedEnvelope(envelopeOrText)
      : parseEncryptedEnvelope(JSON.stringify(envelopeOrText));
  try {
    const salt = base64ToBytes(envelope.salt, '盐值');
    const iv = base64ToBytes(envelope.iv, '随机向量');
    const ciphertext = base64ToBytes(envelope.ciphertext, '密文');
    const key = await deriveKey(password, salt, envelope.iterations);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return importEventJson(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } catch {
    throw new Error('密码不正确，或活动文件已经损坏');
  }
}
