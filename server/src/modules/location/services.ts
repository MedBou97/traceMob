import { randomUUID } from "node:crypto";
import type { MqttClient } from "mqtt";
import type { OwnTracksLocation } from "./schema.js";
import { LOCATION_TOPIC } from "./queue.js";

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
