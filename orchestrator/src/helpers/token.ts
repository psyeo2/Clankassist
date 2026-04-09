import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const getSecret = (): string => {
  const secret = process.env.SECRET?.trim();
  if (!secret) {
    throw new Error("SECRET must be set in .env");
  }

  return secret;
};

export const generateBearerToken = (): {
  userToken: string;
  fullPrefix: string;
  keyHash: string;
  salt: string;
} => {
  const prefix = "sk_diak_";
  const reference = crypto.randomBytes(8).toString("hex");
  const fullPrefix = prefix + reference;
  const key = crypto.randomBytes(32).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const saltedKey = `${salt}/${key}`;
  const keyHash = crypto
    .createHash("sha256")
    .update(saltedKey + getSecret())
    .digest("hex");

  return {
    userToken: `${fullPrefix}.${key}`,
    fullPrefix,
    keyHash,
    salt,
  };
};

export const verifyBearerToken = (
  plainKey: string,
  salt: string,
  storedHash: string,
): boolean => {
  const saltedKey = `${salt}/${plainKey}`;
  const keyHash = crypto
    .createHash("sha256")
    .update(saltedKey + getSecret())
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(keyHash, "hex"),
    Buffer.from(storedHash, "hex"),
  );
};
