import { Type } from "@sinclair/typebox";
import type { QueryResultRow } from "pg";

export interface UserParams {
  userId: string;
}

export interface DateQuery {
  date?: string;
}

export interface CoPresenceQuery {
  timestamp: string;
  radius?: number;
}

export interface PlaybackQuery {
  start: string;
  end: string;
  step?: number;
}

export interface DwellQuery {
  minMinutes?: number;
  eps?: number;
}

export type GeoJsonGeometry =
  | { type: "Point"; coordinates: number[] }
  | { type: "LineString"; coordinates: number[][] }
  | { type: "MultiLineString"; coordinates: number[][][] };

export interface UserSummary extends QueryResultRow {
  user_id: string;
  total_points: number;
  first_seen: Date;
  last_seen: Date;
}

export interface TripSummary extends QueryResultRow {
  trip_day: Date;
  start_time: Date;
  end_time: Date;
  ping_count: number;
  distance_km: number;
  avg_speed_kmh: number;
  max_speed_kmh: number;
  geojson: GeoJsonGeometry;
}

export interface SpeedSegment extends QueryResultRow {
  speed_kmh: number;
  segment_start: Date;
  segment_end: Date;
  transport_mode: "stationary" | "walking" | "cycling" | "vehicular";
  geojson: GeoJsonGeometry;
}

export interface CoPresence extends QueryResultRow {
  user_a: string;
  pos_a: GeoJsonGeometry;
  user_b: string | null;
  pos_b: GeoJsonGeometry | null;
  distance_meters: number | null;
}

export interface PlaybackPoint extends QueryResultRow {
  timestamp: Date;
  current_speed_kmh: number | null;
  point_geojson: GeoJsonGeometry;
}

export interface DwellPoint extends QueryResultRow {
  cluster_id: number;
  arrived_at: Date;
  departed_at: Date;
  duration_minutes: number;
  point_count: number;
  geojson: GeoJsonGeometry;
}

export const UserParamsSchema = Type.Object({
  userId: Type.String({ minLength: 1, maxLength: 256 })
});

export const DateQuerySchema = Type.Object({
  date: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }))
});

export const CoPresenceQuerySchema = Type.Object({
  timestamp: Type.String({ minLength: 1, maxLength: 64 }),
  radius: Type.Optional(Type.Number({ exclusiveMinimum: 0 }))
});

export const PlaybackQuerySchema = Type.Object({
  start: Type.String({ minLength: 1, maxLength: 64 }),
  end: Type.String({ minLength: 1, maxLength: 64 }),
  step: Type.Optional(Type.Integer({ minimum: 1, maximum: 3600 }))
});

export const DwellQuerySchema = Type.Object({
  minMinutes: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  eps: Type.Optional(Type.Number({ exclusiveMinimum: 0 }))
});

export const ErrorSchema = Type.Object({
  error: Type.String()
});

export const AnalyticsArrayResponseSchema = Type.Array(Type.Any());

export const isValidDate = (date: string): boolean => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
};

export const isValidIsoTimestamp = (timestamp: string): boolean => {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.exec(
      timestamp
    );
  return (
    match !== null &&
    isValidDate(match[1]) &&
    Number.isFinite(Date.parse(timestamp))
  );
};