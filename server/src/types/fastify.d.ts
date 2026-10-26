import type { MqttClient } from "mqtt";

declare module "fastify" {
  interface FastifyInstance {
    mqtt: MqttClient;
  }
}
