import type { Pool } from "pg";
import type {
  CoPresence,
  DateQuery,
  DwellPoint,
  PlaybackPoint,
  SpeedSegment,
  TripSummary,
  UserSummary
} from "./schema.js";
import { analyticsSql } from "./sql.js";

export async function listUsers(db: Pool): Promise<UserSummary[]> {
  const { rows } = await db.query<UserSummary>(analyticsSql.users);
  return rows;
}

export async function listUserTrips(
  db: Pool,
  userId: string
): Promise<TripSummary[]> {
  const { rows } = await db.query<TripSummary>(analyticsSql.trips, [userId]);
  return rows;
}

export async function getSpeedProfile(
  db: Pool,
  userId: string,
  query: DateQuery
): Promise<SpeedSegment[]> {
  const { rows } = await db.query<SpeedSegment>(analyticsSql.speedProfile, [
    userId,
    query.date ?? null
  ]);
  return rows;
}

export async function getCoPresence(
  db: Pool,
  timestamp: string,
  radius: number
): Promise<CoPresence[]> {
  const { rows } = await db.query<CoPresence>(analyticsSql.coPresence, [
    timestamp,
    radius
  ]);
  return rows;
}

export async function getPlayback(
  db: Pool,
  userId: string,
  start: string,
  end: string,
  step: number
): Promise<PlaybackPoint[]> {
  const { rows } = await db.query<PlaybackPoint>(analyticsSql.playback, [
    userId,
    start,
    end,
    step
  ]);
  return rows;
}

export async function getDwellPoints(
  db: Pool,
  userId: string,
  eps: number,
  minMinutes: number
): Promise<DwellPoint[]> {
  const { rows } = await db.query<DwellPoint>(analyticsSql.dwellPoints, [
    userId,
    eps,
    minMinutes
  ]);
  return rows;
}