CREATE EXTENSION IF NOT EXISTS postgis;

ALTER DATABASE tracemob SET timezone TO 'Europe/Istanbul';

CREATE TABLE IF NOT EXISTS raw_locations (
    id BIGSERIAL PRIMARY KEY,
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
