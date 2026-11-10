import Fastify from "fastify";
import cors from "@fastify/cors";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { mqttPlugin } from "./plugins/mqtt.js";
import {dbPlugin} from "./plugins/db.js";
import { env } from "./config/env.js";
import { locationRoutes } from "./modules/location/routes.js";
import { analyticsRoutes } from "./modules/analytics/routes.js";

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

  app.register(mqttPlugin);
  app.register(dbPlugin);
  app.register(locationRoutes, { prefix: "/api" });
  app.register(analyticsRoutes, { prefix: "/api" });

  return app;
}
