import fp from "fastify-plugin";
import { Pool } from "pg";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";

function requiresSsl(url: string): boolean {
  if (/sslmode=disable/i.test(url)) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
    return !isLocalHost;
  } catch {
    return /sslmode=require/i.test(url);
  }
}

export const dbPlugin: FastifyPluginAsync = fp(async (app) => {
  if (!env.DATABASE_URL) {
    app.log.warn("DATABASE_URL is not set. Running without database connection.");
    app.decorate("db", null);
    return;
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    ssl: requiresSsl(env.DATABASE_URL) ? { rejectUnauthorized: false } : false
  });

  app.decorate("db", pool);

  app.addHook("onClose", async () => {
    await pool.end();
  });
});
