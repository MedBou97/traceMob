CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS mobilitydb;

ALTER DATABASE tracemob SET timezone TO 'Europe/Istanbul';

CREATE TABLE IF NOT EXISTS raw_locations (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL
        CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL
        CHECK (longitude BETWEEN -180 AND 180),
    accuracy DOUBLE PRECISION NOT NULL
        CHECK (accuracy >= 0),
    recorded_at TIMESTAMPTZ NOT NULL,
    geom geometry(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS raw_locations_geom_idx
    ON raw_locations USING GIST (geom);

CREATE INDEX IF NOT EXISTS raw_locations_recorded_at_idx
    ON raw_locations (recorded_at);

CREATE OR REPLACE VIEW v_user_trajectories AS
SELECT
    user_id,
    date_trunc('day', recorded_at) AS trip_day,
    tgeompointseq(
        array_agg(tgeompoint(geom, recorded_at) ORDER BY recorded_at)
    ) AS trajectory,
    count(*) AS ping_count,
    min(recorded_at) AS start_time,
    max(recorded_at) AS end_time
FROM raw_locations
GROUP BY user_id, date_trunc('day', recorded_at)
HAVING count(*) > 1;
