import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function main() {
  const app = buildApp();

  try {
    await app.ready(); // initialize Fastify plugins

    await app.db?.query("SELECT 1"); // Test database connection
    console.log("Database connected");
    await app.listen({
      host: env.HOST,
      port: Number(env.PORT),
    });
    app.log.info(`Server running on http://${env.HOST}:${env.PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
