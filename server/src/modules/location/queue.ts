import { Type, type Static } from "@sinclair/typebox";
import { OwnTracksLocationSchema } from "./schema.js";

export const LOCATION_TOPIC = "tracemob/location";

export const QueuedLocationSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  location: OwnTracksLocationSchema
});

export type QueuedLocation = Static<typeof QueuedLocationSchema>;
