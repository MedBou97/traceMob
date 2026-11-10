export const analyticsSql = {
  users: `SELECT
    user_id,
    count(*)::int AS total_points,
    min(recorded_at) AS first_seen,
    max(recorded_at) AS last_seen
  FROM raw_locations
  GROUP BY user_id
  ORDER BY last_seen DESC`,

  trips: `SELECT
    trip_day,
    start_time,
    end_time,
    ping_count::int AS ping_count,
    ROUND((length(trajectory(v.trajectory, true)::geography) / 1000)::numeric, 2)::float AS distance_km,
    ROUND((twavg(speed(v.trajectory)) * 3.6)::numeric, 1)::float AS avg_speed_kmh,
    ROUND((maxValue(speed(v.trajectory)) * 3.6)::numeric, 1)::float AS max_speed_kmh,
    ST_AsGeoJSON(trajectory(v.trajectory, true))::json AS geojson
  FROM v_user_trajectories AS v
  WHERE user_id = $1
  ORDER BY start_time DESC`,

  speedProfile: `WITH points AS (
    SELECT
      geom,
      recorded_at,
      LAG(geom) OVER w AS prev_geom,
      LAG(recorded_at) OVER w AS prev_time
    FROM (
      SELECT DISTINCT ON (recorded_at)
        geom,
        recorded_at
      FROM raw_locations
      WHERE user_id = $1
        AND recorded_at::date = COALESCE($2::date, CURRENT_DATE)
      ORDER BY recorded_at, accuracy, id
    ) AS locations
    WINDOW w AS (ORDER BY recorded_at)
  ),
  segments AS (
    SELECT
      ST_MakeLine(prev_geom, geom) AS segment_geom,
      prev_time AS segment_start,
      recorded_at AS segment_end,
      ROUND((
        ST_Distance(prev_geom::geography, geom::geography)
        / NULLIF(EXTRACT(EPOCH FROM (recorded_at - prev_time)), 0)
        * 3.6
      )::numeric, 2)::float AS speed_kmh
    FROM points
    WHERE prev_geom IS NOT NULL
      AND EXTRACT(EPOCH FROM (recorded_at - prev_time)) BETWEEN 1 AND 180
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
  FROM segments
  ORDER BY segment_start`,

  coPresence: `WITH user_positions AS (
    SELECT
      user_id,
      valueAtTimestamp(trajectory, $1::timestamptz) AS current_geom
    FROM v_user_trajectories
    WHERE startTimestamp(trajectory) <= $1::timestamptz
      AND endTimestamp(trajectory) >= $1::timestamptz
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
    AND ST_DWithin(a.current_geom::geography, b.current_geom::geography, $2)
  ORDER BY a.user_id, b.user_id`,

  playback: `WITH time_series AS (
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
        (valueAtTimestamp(speed(v.trajectory), ts.t) * 3.6)::numeric,
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
  ORDER BY timestamp ASC`,

  dwellPoints: `WITH stationary_points AS (
    SELECT geom, recorded_at
    FROM raw_locations
    WHERE user_id = $1
  ),
  clustered AS (
    SELECT
      geom,
      recorded_at,
      ST_ClusterDBSCAN(
        geom::geometry,
        eps := ($2::float / 111139.0),
        minpoints := 3
      ) OVER () AS cluster_id
    FROM stationary_points
  ),
  dwells AS (
    SELECT
      cluster_id,
      COUNT(*)::int AS point_count,
      MIN(recorded_at) AS arrived_at,
      MAX(recorded_at) AS departed_at,
      EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 60.0
        AS duration_minutes,
      ST_Centroid(ST_Collect(geom)) AS dwell_geom
    FROM clustered
    WHERE cluster_id IS NOT NULL
    GROUP BY cluster_id
    HAVING EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 60.0 >= $3
  )
  SELECT
    cluster_id,
    arrived_at,
    departed_at,
    ROUND(duration_minutes::numeric, 1)::float AS duration_minutes,
    point_count,
    ST_AsGeoJSON(dwell_geom)::json AS geojson
  FROM dwells
  ORDER BY arrived_at DESC`
} as const;