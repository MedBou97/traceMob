import { Static, Type } from "@sinclair/typebox";

// this is the schema coming from Owntrack mobile app
export const OwnTracksLocationSchema = Type.Object({
	_type: Type.Literal("location"),
	lat: Type.Number({ minimum: -90, maximum: 90 }),
	lon: Type.Number({ minimum: -180, maximum: 180 }),
	tst: Type.Integer({ minimum: 0 }),
	acc: Type.Number({ minimum: 0 }),
	tid: Type.String({ minLength: 1, maxLength: 2 })
});

export type OwnTracksLocation = Static<typeof OwnTracksLocationSchema>;

// valid response schema of OwnTracks location endpoint, which is an empty array
export const LocationAcceptedSchema = Type.Array(Type.Any(), { minItems: 0, maxItems: 0 });

export const IngestionErrorSchema = Type.Object({
	error: Type.String()
});
