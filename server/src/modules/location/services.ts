import { randomUUID } from "node:crypto";
import type { MqttClient } from "mqtt";
import { LOCATION_TOPIC, OwnTracksLocation } from "./schema.js";

export async function enqueueOwnTracksLocation(
  mqtt: MqttClient,
  location: OwnTracksLocation
): Promise<void> {
  const message = {
    id: randomUUID(),
    location
  };

  await mqtt.publishAsync(LOCATION_TOPIC, JSON.stringify(message), { qos: 1 });
}
