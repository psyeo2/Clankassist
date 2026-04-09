import dotenv from "dotenv";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

dotenv.config();

const readRequired = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set in .env`);
  }

  return value;
};

const readPort = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`${name} must be a valid number`);
  }

  return value;
};

const host = readRequired("PG_HOST");
const user = readRequired("PG_USER");
const password = readRequired("PG_PASSWORD");
const database = readRequired("PG_DB");
const port = readPort("PG_PORT", 5432);

if (!host || !user || !password) {
  throw new Error("PG_HOST, PG_USER, and PG_PASSWORD must be set in .env");
}

export const pool = new Pool({
  host,
  user,
  password,
  database,
  port,
});

pool.on("connect", (client) => {

});

export const query = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<QueryResult<T>> =>
  pool.query<T>(text, (Array.isArray(params) ? [...params] : params) as unknown[]);

export const closePool = async (): Promise<void> => {
  await pool.end();
};
