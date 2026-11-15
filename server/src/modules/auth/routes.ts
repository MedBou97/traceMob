import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Type } from "@sinclair/typebox";
import { env, type AuthUser } from "../../config/env.js";

const LoginSchema = Type.Object({
  username: Type.String({ minLength: 1, maxLength: 128 }),
  password: Type.String({ minLength: 1, maxLength: 1024 })
});

const LoginResponseSchema = Type.Object({
  username: Type.String()
});

const ErrorSchema = Type.Object({
  error: Type.String()
});

const COOKIE_NAME = "tracemob_session";
const SESSION_SECONDS = 12 * 60 * 60;

function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [, saltHex, keyHex] = passwordHash.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");

  return new Promise((resolve, reject) => {
    scrypt(password, salt, expectedKey.length, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(timingSafeEqual(expectedKey, derivedKey));
    });
  });
}

async function authenticateUser(
  username: string,
  password: string,
  users: AuthUser[]
): Promise<AuthUser | undefined> {
  const user = users.find((candidate) => candidate.username === username);
  if (!user) {
    const salt = randomBytes(16);
    await new Promise<void>((resolve, reject) => {
      scrypt(password, salt, 64, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    return undefined;
  }

  return (await verifyPassword(password, user.passwordHash)) ? user : undefined;
}

export const authRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    "/auth/login",
    {
      schema: {
        body: LoginSchema,
        response: {
          200: LoginResponseSchema,
          401: ErrorSchema,
          503: ErrorSchema
        }
      }
    },
    async (request, reply) => {
      if (env.authUsers.length === 0) {
        app.log.error("Authentication is unavailable: AUTH_USERS_JSON is empty");
        return reply.status(503).send({ error: "Authentication is not configured" });
      }

      const user = await authenticateUser(
        request.body.username,
        request.body.password,
        env.authUsers
      );
      if (!user) {
        return reply.status(401).send({ error: "Invalid username or password" });
      }

      const token = await reply.jwtSign(
        { sub: user.username },
        { expiresIn: SESSION_SECONDS }
      );
      reply.setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api",
        maxAge: SESSION_SECONDS
      });
      return { username: user.username };
    }
  );

  app.get(
    "/auth/me",
    {
      schema: {
        response: {
          200: LoginResponseSchema,
          401: ErrorSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const payload = await request.jwtVerify<{ sub: string }>({
          onlyCookie: true
        });
        return { username: payload.sub };
      } catch {
        return reply.status(401).send({ error: "Authentication required" });
      }
    }
  );

  app.post(
    "/auth/logout",
    {
      schema: {
        response: {
          204: Type.Null()
        }
      }
    },
    async (_request, reply) => {
      reply.clearCookie(COOKIE_NAME, { path: "/api" });
      return reply.status(204).send(null);
    }
  );
};

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify({ onlyCookie: true });
  } catch {
    reply.status(401).send({ error: "Authentication required" });
  }
}
