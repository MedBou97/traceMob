import type { Pool } from "pg";
import type {
  CoPresence,
  DateQuery,
  DwellPoint,
  LatestPosition,
  PlaybackPoint,
  SpeedSegment,
  TripSummary,
  UserSummary
} from "./schema.js";
import {
  coPresenceSql,
  dwellPointsSql,
  latestPositionsSql,
  listUserTripsSql,
  listUsersSql,
  playbackSql,
  speedProfileSql
} from "./sql.js";

export async function listUsers(db: Pool): Promise<UserSummary[]> {
  const { rows } = await db.query<UserSummary>(listUsersSql);
  return rows;
}

export async function listLatestPositions(db: Pool): Promise<LatestPosition[]> {
  const { rows } = await db.query<LatestPosition>(latestPositionsSql);
  return rows;
}

export async function listUserTrips(
  db: Pool,
  userId: string
): Promise<TripSummary[]> {
  const { rows } = await db.query<TripSummary>(listUserTripsSql, [userId]);
  return rows;
}

export async function getSpeedProfile(
  db: Pool,
  userId: string,
  query: DateQuery
): Promise<SpeedSegment[]> {
  const { rows } = await db.query<SpeedSegment>(speedProfileSql, [
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
  const { rows } = await db.query<CoPresence>(coPresenceSql, [
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
  const { rows } = await db.query<PlaybackPoint>(playbackSql, [
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
  const { rows } = await db.query<DwellPoint>(dwellPointsSql, [
    userId,
    eps,
    minMinutes
  ]);
  return rows;
}