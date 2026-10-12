import { config as loadEnv } from "dotenv";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

loadEnv();

const EnvSchema = Type.Object({
  NODE_ENV: Type.Union([
    Type.Literal("development"),
    Type.Literal("test"),
    Type.Literal("production")
  ]),
  PORT: Type.String({ minLength: 1 }),
  HOST: Type.String({ minLength: 1 }),
  CORS_ORIGIN: Type.String({ minLength: 1 }),
  DATABASE_URL: Type.String()
});

type Env = Static<typeof EnvSchema>;

function readEnv(): Env {
  const raw = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    PORT: process.env.PORT ?? "3000",
    HOST: process.env.HOST ?? "0.0.0.0",
    CORS_ORIGIN:
      process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173",
    DATABASE_URL: process.env.DATABASE_URL ?? ""
  };

  if (!Value.Check(EnvSchema, raw)) {
    throw new Error("Invalid environment configuration");
  }

  return raw;
}

export const env = readEnv();
