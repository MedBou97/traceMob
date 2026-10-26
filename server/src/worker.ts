import { createServer } from "node:http";
import { Value } from "@sinclair/typebox/value";
import { connectAsync } from "mqtt";
import { Pool } from "pg";
import { env } from "./config/env.js";
import {
  LOCATION_TOPIC,
  QueuedLocationSchema,
} from "./modules/location/queue.js";

async function main() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set for the GPS worker");
  }

  const db = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    ssl: /sslmode=disable/i.test(env.DATABASE_URL)
      ? false
      : { rejectUnauthorized: false },
  });
  try {
    await db.query("SELECT 1");

    // connect to the MQTT broker, here as a subscriber to the location topic, and process messages as they arrive
    const client = await connectAsync(env.MQTT_URL, {
      clientId: "tracemob-gps-worker",
      clean: false,
      reconnectPeriod: 1000,
    });
    // this means the worker is connected to the MQTT broker and has successfully subscribed to the topic, and is ready to process messages
    let ready = false; // ready refers to the worker

    // this is used to track whether we have successfully subscribed to the topic at least once, so that we can resubscribe on reconnect
    let hasSubscribed = false;

    client.on("error", (error) => {
      console.error("MQTT worker connection error", error);
    });
    client.on("offline", () => {
      ready = false;
    });
    client.on("close", () => {
      ready = false;
    });
    client.on("connect", () => {
      // this will run only on reconnection cause hasSubscribed is false, so initial
      //              connect/subribe will be handled outside this event on the first connection
      if (hasSubscribed) {
        void client
          .subscribeAsync(LOCATION_TOPIC, { qos: 1 })
          .then(() => {
            ready = true;
          })
          .catch((error: unknown) => {
            console.error("Failed to resubscribe GPS worker", error);
          });
      }
    });

    // process messages received on the topic
    client.handleMessage = (packet, callback) => {
      void storeQueuedLocation(db, packet.payload)
        .then(() => callback())
        .catch((error: unknown) => {
          console.error("Failed to store queued location", error);
          callback(error instanceof Error ? error : new Error(String(error)));
        });
    };

    // initial subscription to the topic when the worker starts up
    await client.subscribeAsync(LOCATION_TOPIC, { qos: 1 });
    hasSubscribed = true;
    ready = true;
    console.info(`GPS worker subscribed to ${LOCATION_TOPIC}`);

    // this will help docker health checks to determine if the worker is ready to process messages
    const healthServer = createServer((_request, response) => {
      response.statusCode = ready ? 200 : 503;
      response.end(ready ? "ready" : "not ready");
    });
    await new Promise<void>((resolve, reject) => {
      healthServer.once("error", reject);
      healthServer.listen(3001, "0.0.0.0", resolve);
    });

    const shutdown = async () => {
      ready = false;
      await new Promise<void>((resolve, reject) => {
        healthServer.close((error) => (error ? reject(error) : resolve()));
      });
      await client.endAsync();
      await db.end();
    };

    // signals like ctrl + c or docker stop
    process.once("SIGINT", () => {
      void shutdown().catch((error: unknown) => {
        console.error("GPS worker shutdown failed", error);
        process.exitCode = 1;
      });
    });
    process.once("SIGTERM", () => {
      void shutdown().catch((error: unknown) => {
        console.error("GPS worker shutdown failed", error);
        process.exitCode = 1;
      });
    });
  } catch (error) {
    await db.end();
    throw error;
  }
}

async function storeQueuedLocation(
  db: Pool,
  payload: Buffer | string,
): Promise<void> {
  const parsed: unknown = JSON.parse(payload.toString());
  if (!Value.Check(QueuedLocationSchema, parsed)) {
    throw new Error("Received an invalid queued location message");
  }

  const { id, location } = parsed;
  const recordedAt = new Date(location.tst * 1000);

  await db.query(
    `INSERT INTO raw_locations (id, user_id, latitude, longitude, accuracy, recorded_at, geom)
     VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($4, $3), 4326))
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      location.tid || "unknown",
      location.lat,
      location.lon,
      location.acc,
      recordedAt,
    ],
  );
}

void main().catch((error: unknown) => {
  console.error("GPS worker failed to start", error);
  process.exitCode = 1;
});
