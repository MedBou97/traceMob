import { config as loadEnv } from "dotenv";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { randomBytes } from "node:crypto";

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
  JWT_SECRET: Type.Optional(Type.String({ minLength: 32 })),
  AUTH_USERS_JSON: Type.Optional(Type.String({ minLength: 2 })),
  DATABASE_URL: Type.Optional(Type.String({ minLength: 1 })),
  MQTT_URL: Type.String({ minLength: 1 })
});

type Env = Static<typeof EnvSchema>;

const AuthUsersSchema = Type.Array(
  Type.Object({
    username: Type.String({ minLength: 1, maxLength: 128 }),
    passwordHash: Type.String({
      pattern: "^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$"
    })
  }),
  { minItems: 1, maxItems: 2 }
);

export type AuthUser = Static<typeof AuthUsersSchema>[number];

function parseAuthUsers(value?: string): AuthUser[] {
  if (!value) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("AUTH_USERS_JSON must be valid JSON");
  }

  const users = Array.isArray(parsed) ? parsed : [parsed];
  if (!Value.Check(AuthUsersSchema, users)) {
    throw new Error("AUTH_USERS_JSON must contain one or two valid users");
  }
  if (new Set(users.map((user) => user.username)).size !== users.length) {
    throw new Error("AUTH_USERS_JSON usernames must be unique");
  }

  return users;
}

function readEnv(): Env & { authUsers: AuthUser[] } {
  const raw = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    PORT: process.env.PORT ?? "3000",
    HOST: process.env.HOST ?? "0.0.0.0",
    CORS_ORIGIN:
      process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173",
    JWT_SECRET: process.env.JWT_SECRET,
    AUTH_USERS_JSON: process.env.AUTH_USERS_JSON,
    DATABASE_URL: process.env.DATABASE_URL,
    MQTT_URL: process.env.MQTT_URL ?? "mqtt://localhost:1883"
  };

  if (!Value.Check(EnvSchema, raw)) {
    throw new Error("Invalid environment configuration");
  }

  const authUsers = parseAuthUsers(raw.AUTH_USERS_JSON);
  return { ...raw, authUsers };
}

export const env = readEnv();

export function getAuthConfig(): { jwtSecret: string } {
  if (env.NODE_ENV === "production" && !env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be set in production");
  }
  if (env.NODE_ENV === "production" && env.authUsers.length === 0) {
    throw new Error("AUTH_USERS_JSON must be set in production");
  }

  return {
    jwtSecret: env.JWT_SECRET ?? randomBytes(32).toString("hex")
  };
}
