import type { Pool } from "pg";
import type { OwnTracksLocation } from "./schema.js";

export type IngestionResult =
	| { status: "stored" }
	| { status: "database-unavailable" }
	| { status: "database-error"; error: unknown };

export async function ingestOwnTracksLocation(
	db: Pool | null,
	location: OwnTracksLocation,
): Promise<IngestionResult> {
	if (!db) {
		return { status: "database-unavailable" };
	}

	// Convert the OwnTracks Unix timestamp (in seconds) to a JavaScript Date object
	const recordedAt = new Date(location.tst * 1000);

	try {
		await db.query(
			`INSERT INTO raw_locations (user_id, latitude, longitude, accuracy, recorded_at, geom)
			 VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($3, $2), 4326))`,
			[location.tid || "unknown", location.lat, location.lon, location.acc, recordedAt],
		);

		return { status: "stored" };
	} catch (error) {
		return { status: "database-error", error };
	}
}
