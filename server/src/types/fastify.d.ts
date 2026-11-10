import type { MqttClient } from "mqtt";
import type { Pool } from "pg";

declare module "fastify" {
  interface FastifyInstance {
    db: Pool | null;
    mqtt: MqttClient;
  }
}
