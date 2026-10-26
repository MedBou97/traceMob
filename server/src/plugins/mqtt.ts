import fp from "fastify-plugin";
import { connectAsync } from "mqtt";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";

export const mqttPlugin: FastifyPluginAsync = fp(async (app) => {
  // connect to the MQTT broker, here as a publisher sending msgs to the location topic
  const client = await connectAsync(env.MQTT_URL, {
    clientId: "tracemob-api",
    clean: true,
    reconnectPeriod: 1000
  });

  client.on("error", (error) => {
    app.log.error(error, "MQTT connection error");
  });

  app.decorate("mqtt", client);

  app.addHook("onClose", async () => {
    await client.endAsync();
  });
});
