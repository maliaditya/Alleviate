import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_ALGO = 'scrypt-v1';

export type PasswordRecord = {
  passwordHash: string;
  passwordSalt: string;
  passwordAlgo: string;
};

export const hashPassword = (password: string): PasswordRecord => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return {
    passwordHash: hash,
    passwordSalt: salt,
    passwordAlgo: SCRYPT_ALGO,
  };
};

export const verifyPassword = (password: string, record: PasswordRecord): boolean => {
  if (!record.passwordHash || !record.passwordSalt) return false;
  const derived = scryptSync(password, record.passwordSalt, SCRYPT_KEY_LENGTH);
  const stored = Buffer.from(record.passwordHash, 'hex');
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
};
