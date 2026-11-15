import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { env } from "../../config/env.js";
import {
  AuthErrorSchema,
  AuthSessionSchema,
  LoginRequestSchema,
  LogoutResponseSchema
} from "./schema.js";
import { authenticateUser, getSessionUsername } from "./services.js";

const COOKIE_NAME = "tracemob_session";
const SESSION_SECONDS = 12 * 60 * 60;

export const authRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    "/auth/login",
    {
      schema: {
        body: LoginRequestSchema,
        response: {
          200: AuthSessionSchema,
          401: AuthErrorSchema,
          503: AuthErrorSchema
        }
      }
    },
    async (request, reply) => {
      if (env.authUsers.length === 0) {
        app.log.error("Authentication is unavailable: AUTH_USERS_JSON is empty");
        return reply.status(503).send({ error: "Authentication is not configured" });
      }

      const user = await authenticateUser(request.body.username, request.body.password);
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
          200: AuthSessionSchema,
          401: AuthErrorSchema
        }
      }
    },
    async (request, reply) => {
      const username = await getSessionUsername(request);
      if (!username) {
        return reply.status(401).send({ error: "Authentication required" });
      }
      return { username };
    }
  );

  app.post(
    "/auth/logout",
    {
      schema: {
        response: {
          204: LogoutResponseSchema
        }
      }
    },
    async (_request, reply) => {
      reply.clearCookie(COOKIE_NAME, { path: "/api" });
      return reply.status(204).send(null);
    }
  );
};
