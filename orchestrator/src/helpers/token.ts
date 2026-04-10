import crypto from "node:crypto";

const HASH_KEY_LENGTH = 64;

const hashValue = (value: string, salt: string): string =>
  crypto.scryptSync(value, salt, HASH_KEY_LENGTH).toString("hex");

export const generateOpaqueToken = (prefix = "sk_diak_"): {
  userToken: string;
  prefix: string;
  keyHash: string;
  salt: string;
} => {
  const reference = crypto.randomBytes(8).toString("hex");
  const fullPrefix = prefix + reference;
  const key = crypto.randomBytes(32).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const keyHash = hashValue(key, salt);

  return {
    userToken: `${fullPrefix}.${key}`,
    prefix: fullPrefix,
    keyHash,
    salt,
  };
};

export const verifyOpaqueToken = (
  plainKey: string,
  salt: string,
  storedHash: string,
): boolean => {
  const keyHash = hashValue(plainKey, salt);

  const left = Buffer.from(keyHash, "hex");
  const right = Buffer.from(storedHash, "hex");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
};

export const createPasswordHash = (
  password: string,
): { passwordHash: string; passwordSalt: string } => {
  const passwordSalt = crypto.randomBytes(16).toString("hex");

  return {
    passwordHash: hashValue(password, passwordSalt),
    passwordSalt,
  };
};

export const verifyPassword = (
  password: string,
  passwordSalt: string,
  storedHash: string,
): boolean => verifyOpaqueToken(password, passwordSalt, storedHash);
