import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  IngestionErrorSchema,
  LocationAcceptedSchema,
  OwnTracksLocationSchema,
} from "./schema.js";

import { ingestOwnTracksLocation } from "./services.js";


export const locationRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    "/location",
    {
      schema: {
        body: OwnTracksLocationSchema,
        response: {
          200: LocationAcceptedSchema,
          400: IngestionErrorSchema,
          500: IngestionErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await ingestOwnTracksLocation(app.db, request.body);

      if (result.status === "database-unavailable") {
        return reply.status(500).send({ error: "Database is unavailable" });
      }

      if (result.status === "database-error") {
        app.log.error(result.error);
        return reply.status(500).send({ error: "Database insert failed" });
      }
      
      // OwnTracks expects an empty array as a response for valid ingestion
      return reply.status(200).send([]);
    },
  );
};
