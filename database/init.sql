CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS mobilitydb;

-- Database default for new connections; analytics also use explicit Istanbul days.
ALTER DATABASE tracemob SET timezone TO 'Europe/Istanbul';

CREATE TABLE IF NOT EXISTS raw_locations (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy DOUBLE PRECISION NOT NULL CHECK (accuracy >= 0),
  recorded_at TIMESTAMPTZ NOT NULL,
  geom geometry(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS raw_locations_geom_idx
  ON raw_locations USING GIST (geom);

CREATE INDEX IF NOT EXISTS raw_locations_recorded_at_idx
  ON raw_locations (recorded_at);

CREATE INDEX IF NOT EXISTS raw_locations_user_time_idx
  ON raw_locations (user_id, recorded_at);

-- One trajectory per user per Istanbul calendar day.
-- One sample per timestamp: the lowest accuracy value wins (id breaks ties).
-- A daily sequence still interpolates over missing-data gaps.
CREATE OR REPLACE VIEW v_user_trajectories AS
WITH per_timestamp AS (
  SELECT
    user_id,
    date_trunc('day', recorded_at, 'Europe/Istanbul') AS trip_day,
    recorded_at,
    (array_agg(geom ORDER BY accuracy, id))[1] AS geom,
    COUNT(*) AS timestamp_ping_count
  FROM raw_locations
  GROUP BY user_id,
    date_trunc('day', recorded_at, 'Europe/Istanbul'),
    recorded_at
)
SELECT
  user_id,
  trip_day,
  tgeompointSeq(
    array_agg(tgeompoint(geom, recorded_at) ORDER BY recorded_at)
  ) AS trajectory,
  SUM(timestamp_ping_count)::bigint AS ping_count,
  MIN(recorded_at) AS start_time,
  MAX(recorded_at) AS end_time
FROM per_timestamp
GROUP BY user_id, trip_day
HAVING COUNT(*) > 1;