import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from 'crypto';

/**
 * Genera un string aleatorio para usar como token o ID
 */
export function generateRandomString(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Genera un código de verificación numérico
 */
export function generateVerificationCode(length: number = 6): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

/**
 * Genera un hash SHA-256 de un string
 */
export function sha256Hash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Genera un hash MD5 de un string
 */
export function md5Hash(data: string): string {
  return createHash('md5').update(data).digest('hex');
}

/**
 * Encripta datos con AES-256-GCM
 */
export function encryptData(
  data: string,
  key: string,
): { encrypted: string; iv: string; tag: string } {
  const salt = randomBytes(16);
  const iv = randomBytes(16);
  const derivedKey = scryptSync(key, salt, 32);

  const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Desencripta datos con AES-256-GCM
 */
export function decryptData(
  encryptedHex: string,
  key: string,
  ivHex: string,
  tagHex: string,
): string {
  const salt = randomBytes(16);
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const derivedKey = scryptSync(key, salt, 32);

  const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Valida si un token tiene el formato esperado
 */
export function isValidToken(token: string): boolean {
  if (!token) return false;
  // Tokens JWT tienen 3 partes separadas por punto
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}
