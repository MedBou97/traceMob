import Fastify from "fastify";
import cors from "@fastify/cors";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { dbPlugin } from "./plugins/db.js";
import { env } from "./config/env.js";


export function buildApp() {
  const corsOrigins = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const app = Fastify({  logger: {
    level: "warn",
  }, }).withTypeProvider<TypeBoxTypeProvider>();

  app.register(cors, {
    origin: corsOrigins,
    credentials: true
  });

  app.register(dbPlugin);


  return app;
}
