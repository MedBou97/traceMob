/**
 * TraceMob analytics queries.
 * raw_locations.geom: geometry(Point, 4326)
 * v_user_trajectories.trajectory: MobilityDB tgeompoint
 *
 * Geographic speeds/distances cast temporal geometry to tgeogpoint,
 * whose distance units are meters (rather than SRID 4326 degrees).
 */

export const listUsersSql = `
SELECT
  user_id,
  COUNT(*)::int AS total_points,
  MIN(recorded_at) AS first_seen,
  MAX(recorded_at) AS last_seen
FROM raw_locations
GROUP BY user_id
ORDER BY last_seen DESC;
`;

/** One row per user/day, as defined by v_user_trajectories. */
export const listUserTripsSql = `
SELECT
  trip_day,
  start_time,
  end_time,
  ping_count::int AS ping_count,
  ROUND((length(v.trajectory::tgeogpoint) / 1000)::numeric, 2)::float AS distance_km,
  ROUND((twavg(speed(v.trajectory::tgeogpoint)) * 3.6)::numeric, 1)::float AS avg_speed_kmh,
  ROUND((maxValue(speed(v.trajectory::tgeogpoint)) * 3.6)::numeric, 1)::float AS max_speed_kmh,
  ST_AsGeoJSON(trajectory(v.trajectory))::json AS geojson
FROM v_user_trajectories AS v
WHERE user_id = $1
ORDER BY start_time DESC;
`;

/**
 * Select one sample per timestamp (lowest accuracy value wins), then
 * calculate speed for consecutive samples at most 180 seconds apart.
 * The API's date is interpreted in the Europe/Istanbul calendar.
 */
export const speedProfileSql = `
WITH selected_points AS (
  SELECT DISTINCT ON (recorded_at)
    geom,
    recorded_at
  FROM raw_locations
  WHERE user_id = $1
    AND recorded_at >= (
      COALESCE($2::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date)
      ::timestamp AT TIME ZONE 'Europe/Istanbul'
    )
    AND recorded_at < (
      (COALESCE($2::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date) + 1)
      ::timestamp AT TIME ZONE 'Europe/Istanbul'
    )
  ORDER BY recorded_at, accuracy, id
),
ordered_points AS (
  SELECT
    geom,
    recorded_at,
    LAG(geom) OVER w AS prev_geom,
    LAG(recorded_at) OVER w AS prev_time
  FROM selected_points
  WINDOW w AS (ORDER BY recorded_at)
),
valid_segments AS (
  SELECT *
  FROM ordered_points
  WHERE prev_geom IS NOT NULL
    AND recorded_at - prev_time
        BETWEEN INTERVAL '1 second' AND INTERVAL '180 seconds'
),
temporal_segments AS (
  SELECT
    prev_geom,
    geom,
    prev_time AS segment_start,
    recorded_at AS segment_end,
    tgeogpointSeq(ARRAY[
      tgeogpoint(prev_geom::geography, prev_time),
      tgeogpoint(geom::geography, recorded_at)
    ]) AS segment_trajectory
  FROM valid_segments
),
calculated AS (
  SELECT
    segment_start,
    segment_end,
    ST_MakeLine(prev_geom, geom) AS segment_geom,
    ROUND((minValue(speed(segment_trajectory)) * 3.6)::numeric, 2)::float AS speed_kmh
  FROM temporal_segments
)
SELECT
  speed_kmh,
  segment_start,
  segment_end,
  CASE
    WHEN speed_kmh < 1.0 THEN 'stationary'
    WHEN speed_kmh < 6.0 THEN 'walking'
    WHEN speed_kmh < 25.0 THEN 'cycling'
    ELSE 'vehicular'
  END AS transport_mode,
  ST_AsGeoJSON(segment_geom)::json AS geojson
FROM calculated
ORDER BY segment_start;
`;

/** Only returns nearby user pairs, not unmatched users. */
export const coPresenceSql = `
WITH positions AS (
  SELECT
    user_id,
    valueAtTimestamp(trajectory, $1::timestamptz) AS current_geom
  FROM v_user_trajectories
  WHERE startTimestamp(trajectory) <= $1::timestamptz
    AND endTimestamp(trajectory) >= $1::timestamptz
),
user_positions AS (
  SELECT *
  FROM positions
  WHERE current_geom IS NOT NULL
)
SELECT
  a.user_id AS user_a,
  ST_AsGeoJSON(a.current_geom)::json AS pos_a,
  b.user_id AS user_b,
  ST_AsGeoJSON(b.current_geom)::json AS pos_b,
  ROUND(
    ST_Distance(a.current_geom::geography, b.current_geom::geography)::numeric,
    1
  )::float AS distance_meters
FROM user_positions AS a
LEFT JOIN user_positions AS b
  ON a.user_id < b.user_id
 AND ST_DWithin(
   a.current_geom::geography,
   b.current_geom::geography,
   $2::double precision
 )
ORDER BY a.user_id, b.user_id;
`;

/** Generate sampled positions/speeds; input step must be positive. */
export const playbackSql = `
WITH time_series AS (
  SELECT generate_series(
    $2::timestamptz,
    $3::timestamptz,
    ($4::text || ' seconds')::interval
  ) AS t
),
interpolated AS (
  SELECT
    ts.t AS timestamp,
    valueAtTimestamp(v.trajectory, ts.t) AS geom,
    ROUND(
      (valueAtTimestamp(speed(v.trajectory::tgeogpoint), ts.t) * 3.6)::numeric,
      1
    )::float AS current_speed_kmh
  FROM time_series AS ts
  CROSS JOIN v_user_trajectories AS v
  WHERE v.user_id = $1
    AND startTimestamp(v.trajectory) <= ts.t
    AND endTimestamp(v.trajectory) >= ts.t
)
SELECT
  timestamp,
  current_speed_kmh,
  ST_AsGeoJSON(geom)::json AS point_geojson
FROM interpolated
WHERE geom IS NOT NULL
ORDER BY timestamp ASC;
`;

/**
 * Continuous-stay heuristic: a point stays in the current candidate visit
 * when it is within $2 meters of the initial anchor AND within 180 seconds
 * of the previous sample. Keep visits lasting at least $3 minutes with 3+ samples.
 * These are candidate dwell events, not measured exact arrival/departure times.
 */
export const dwellPointsSql = `
WITH RECURSIVE
  deduplicated AS (
    SELECT DISTINCT ON (recorded_at)
      geom,
      recorded_at
    FROM raw_locations
    WHERE user_id = $1
    ORDER BY recorded_at, accuracy, id
  ),
  ordered_points AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY recorded_at) AS rn,
      geom,
      recorded_at
    FROM deduplicated
  ),
  visits AS (
    SELECT
      rn,
      geom,
      recorded_at,
      geom AS anchor_geom,
      recorded_at AS previous_time,
      1::bigint AS visit_id
    FROM ordered_points
    WHERE rn = 1

    UNION ALL

    SELECT
      p.rn,
      p.geom,
      p.recorded_at,
      CASE
        WHEN p.recorded_at - v.previous_time <= INTERVAL '180 seconds'
          AND ST_DWithin(
            p.geom::geography,
            v.anchor_geom::geography,
            $2::double precision
          )
        THEN v.anchor_geom
        ELSE p.geom
      END AS anchor_geom,
      p.recorded_at AS previous_time,
      CASE
        WHEN p.recorded_at - v.previous_time <= INTERVAL '180 seconds'
          AND ST_DWithin(
            p.geom::geography,
            v.anchor_geom::geography,
            $2::double precision
          )
        THEN v.visit_id
        ELSE v.visit_id + 1
      END AS visit_id
    FROM visits AS v
    JOIN ordered_points AS p ON p.rn = v.rn + 1
  ),
  dwells AS (
    SELECT
      visit_id - 1 AS cluster_id,
      COUNT(*)::int AS point_count,
      MIN(recorded_at) AS arrived_at,
      MAX(recorded_at) AS departed_at,
      EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 60.0
        AS duration_minutes,
      ST_Centroid(ST_Collect(geom)) AS dwell_geom
    FROM visits
    GROUP BY visit_id
    HAVING COUNT(*) >= 3
       AND EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 60.0 >= $3
  )
SELECT
  cluster_id,
  arrived_at,
  departed_at,
  ROUND(duration_minutes::numeric, 1)::float AS duration_minutes,
  point_count,
  ST_AsGeoJSON(dwell_geom)::json AS geojson
FROM dwells
ORDER BY arrived_at DESC;
`;
