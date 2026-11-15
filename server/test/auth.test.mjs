import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";

const salt = Buffer.alloc(16, 7);
const password = "test-password";
const passwordHash = `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "test-only-signing-secret-that-is-long-enough";
process.env.AUTH_USERS_JSON = JSON.stringify([{ username: "alice", passwordHash }]);

const [{ authRoutes, requireAuth }, { analyticsRoutes }] = await Promise.all([
  import("../dist/modules/auth/routes.js"),
  import("../dist/modules/analytics/routes.js"),
]);

test("JWT cookie login protects analytics routes", async (t) => {
  const app = Fastify();
  app.decorate("db", {
    query: async () => ({
      rows: [
        {
          user_id: "alice",
          latitude: 41.0082,
          longitude: 28.9784,
          recorded_at: "2026-11-15T09:00:00.000Z",
          accuracy: 10,
        },
      ],
    }),
  });
  app.register(cookie);
  app.register(jwt, {
    secret: process.env.JWT_SECRET,
    cookie: { cookieName: "tracemob_session", signed: false },
  });
  app.register(authRoutes, { prefix: "/api" });
  app.register(
    async (securedApi) => {
      securedApi.addHook("preHandler", requireAuth);
      securedApi.get("/private", async () => ({ protected: true }));
      securedApi.register(analyticsRoutes);
    },
    { prefix: "/api" },
  );
  await app.ready();
  t.after(() => app.close());

  const unauthenticated = await app.inject({ method: "GET", url: "/api/private" });
  assert.equal(unauthenticated.statusCode, 401);
  const unauthenticatedPositions = await app.inject({
    method: "GET",
    url: "/api/users/latest",
  });
  assert.equal(unauthenticatedPositions.statusCode, 401);

  const invalidLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "alice", password: "wrong" },
  });
  assert.equal(invalidLogin.statusCode, 401);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "alice", password },
  });
  assert.equal(login.statusCode, 200);
  const setCookie = login.headers["set-cookie"];
  assert.ok(setCookie);
  const cookieHeader = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];
  assert.match(String(setCookie), /HttpOnly/i);
  assert.match(String(setCookie), /SameSite=Strict/i);
  assert.match(String(setCookie), /Secure/i);

  const authenticated = await app.inject({
    method: "GET",
    url: "/api/private",
    headers: { cookie: cookieHeader },
  });
  assert.equal(authenticated.statusCode, 200);

  const positions = await app.inject({
    method: "GET",
    url: "/api/users/latest",
    headers: { cookie: cookieHeader },
  });
  assert.deepEqual(positions.json(), [
    {
      user_id: "alice",
      latitude: 41.0082,
      longitude: 28.9784,
      recorded_at: "2026-11-15T09:00:00.000Z",
      accuracy: 10,
    },
  ]);

  const session = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: cookieHeader },
  });
  assert.deepEqual(session.json(), { username: "alice" });
});
