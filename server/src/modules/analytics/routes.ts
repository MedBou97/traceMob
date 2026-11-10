import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  AnalyticsArrayResponseSchema,
  CoPresenceQuery,
  CoPresenceQuerySchema,
  DateQuery,
  DateQuerySchema,
  DwellQuery,
  DwellQuerySchema,
  ErrorSchema,
  isValidDate,
  isValidIsoTimestamp,
  PlaybackQuery,
  PlaybackQuerySchema,
  UserParams,
  UserParamsSchema
} from "./schema.js";
import {
  getCoPresence,
  getDwellPoints,
  getPlayback,
  getSpeedProfile,
  listUserTrips,
  listUsers
} from "./services.js";

export const analyticsRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get(
    "/users",
    {
      schema: {
        response: {
          200: AnalyticsArrayResponseSchema,
          503: ErrorSchema
        }
      }
    },
    async (_request, reply) => {
      if (!app.db) {
        return reply.status(503).send({ error: "Database is unavailable" });
      }
      return listUsers(app.db);
    }
  );

  app.get<{ Params: UserParams }>(
    "/users/:userId/trips",
    {
      schema: {
        params: UserParamsSchema,
        response: {
          200: AnalyticsArrayResponseSchema,
          503: ErrorSchema
        }
      }
    },
    async (request, reply) => {
      if (!app.db) {
        return reply.status(503).send({ error: "Database is unavailable" });
      }
      return listUserTrips(app.db, request.params.userId);
    }
  );

  app.get<{ Params: UserParams; Querystring: DateQuery }>(
    "/users/:userId/speed-profile",
    {
      schema: {
        params: UserParamsSchema,
        querystring: DateQuerySchema,
        response: {
          200: AnalyticsArrayResponseSchema,
          400: ErrorSchema,
          503: ErrorSchema
        }
      }
    },
    async (request, reply) => {
      if (request.query.date && !isValidDate(request.query.date)) {
        return reply
          .status(400)
          .send({ error: "date must be a valid YYYY-MM-DD date" });
      }
      if (!app.db) {
        return reply.status(503).send({ error: "Database is unavailable" });
      }
      return getSpeedProfile(app.db, request.params.userId, request.query);
    }
  );

  app.get<{ Querystring: CoPresenceQuery }>(
    "/co-presence",
    {
      schema: {
        querystring: CoPresenceQuerySchema,
        response: {
          200: AnalyticsArrayResponseSchema,
          400: ErrorSchema,
          503: ErrorSchema
        }
      }
    },
    async (request, reply) => {
      if (!isValidIsoTimestamp(request.query.timestamp)) {
        return reply
          .status(400)
          .send({ error: "timestamp must be a valid ISO timestamp" });
      }
      if (!app.db) {
        return reply.status(503).send({ error: "Database is unavailable" });
      }
      return getCoPresence(
        app.db,
        request.query.timestamp,
        request.query.radius ?? 100
      );
    }
  );

  app.get<{ Params: UserParams; Querystring: PlaybackQuery }>(
    "/users/:userId/playback",
    {
      schema: {
        params: UserParamsSchema,
        querystring: PlaybackQuerySchema,
        response: {
          200: AnalyticsArrayResponseSchema,
          400: ErrorSchema,
          503: ErrorSchema
        }
      }
    },
    async (request, reply) => {
      if (
        !isValidIsoTimestamp(request.query.start) ||
        !isValidIsoTimestamp(request.query.end)
      ) {
        return reply
          .status(400)
          .send({ error: "start and end must be valid ISO timestamps" });
      }
      if (Date.parse(request.query.start) > Date.parse(request.query.end)) {
        return reply
          .status(400)
          .send({ error: "start must be before or equal to end" });
      }
      if (!app.db) {
        return reply.status(503).send({ error: "Database is unavailable" });
      }
      return getPlayback(
        app.db,
        request.params.userId,
        request.query.start,
        request.query.end,
        request.query.step ?? 5
      );
    }
  );

  app.get<{ Params: UserParams; Querystring: DwellQuery }>(
    "/users/:userId/dwell-points",
    {
      schema: {
        params: UserParamsSchema,
        querystring: DwellQuerySchema,
        response: {
          200: AnalyticsArrayResponseSchema,
          503: ErrorSchema
        }
      }
    },
    async (request, reply) => {
      if (!app.db) {
        return reply.status(503).send({ error: "Database is unavailable" });
      }
      return getDwellPoints(
        app.db,
        request.params.userId,
        request.query.eps ?? 30,
        request.query.minMinutes ?? 5
      );
    }
  );
};