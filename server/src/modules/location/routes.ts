import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  IngestionErrorSchema,
  LocationAcceptedSchema,
  OwnTracksLocationSchema,
} from "./schema.js";
import { enqueueOwnTracksLocation } from "./services.js";

export const locationRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    "/location",
    {
      schema: {
        body: OwnTracksLocationSchema,
        response: {
          200: LocationAcceptedSchema,
          400: IngestionErrorSchema,
          503: IngestionErrorSchema
        },
      },
    },
    async (request, reply) => {
      try {
        await enqueueOwnTracksLocation(app.mqtt, request.body);
      } catch (error) {
        app.log.error(error);
        return reply.status(503).send({ error: "Location queue is unavailable" });
      }

      // OwnTracks expects an empty array as a response for valid ingestion
      return reply.status(200).send([]);
    },
  );
};
