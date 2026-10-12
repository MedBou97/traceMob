import type { Pool } from "pg";

/*
 this file is used to declare additional types for Fastify instance, so that we can use app.db,
 app.roomManager, app.io in our codebase with proper type checking
 and autocompletion support.
*/
declare module "fastify" {
  interface FastifyInstance {
    db: Pool | null;
  }
}
