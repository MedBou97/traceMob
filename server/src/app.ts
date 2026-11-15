import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { mqttPlugin } from "./plugins/mqtt.js";
import {dbPlugin} from "./plugins/db.js";
import { env } from "./config/env.js";
import { locationRoutes } from "./modules/location/routes.js";
import { analyticsRoutes } from "./modules/analytics/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { requireAuth } from "./modules/auth/services.js";

export function buildApp() {
  const corsOrigins = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const app = Fastify({
    logger: {
      level: "warn"
    }
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.register(cors, {
    origin: corsOrigins,
    credentials: true
  });

  app.register(cookie);
  app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: "tracemob_session",
      signed: false
    }
  });
  app.register(mqttPlugin);
  app.register(dbPlugin);
  app.register(locationRoutes, { prefix: "/api" });
  app.register(authRoutes, { prefix: "/api" });
  app.register(
    async (securedApi) => {
      securedApi.addHook("preHandler", requireAuth);
      securedApi.register(analyticsRoutes);
    },
    { prefix: "/api" }
  );

  return app;
}
