import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const configModule = pathToFileURL(
  join(process.cwd(), "dist", "config", "env.js"),
).href;
const appModule = pathToFileURL(
  join(process.cwd(), "dist", "app.js"),
).href;

function runIsolated(code, extraEnv = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "tracemob-env-"));
  try {
    return spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      {
        cwd,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "",
          NODE_ENV: "production",
          ...extraEnv,
        },
      },
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("production environment config can be imported without auth settings", () => {
  const result = runIsolated(`await import(${JSON.stringify(configModule)})`);
  assert.equal(result.status, 0, result.stderr);
});

test("production API still requires auth settings", () => {
  const result = runIsolated(
    `const { buildApp } = await import(${JSON.stringify(appModule)}); buildApp()`,
    { JWT_SECRET: "test-secret-with-more-than-thirty-two-characters" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AUTH_USERS_JSON must be set in production/);
});

test("production environment accepts a single auth user object", () => {
  const passwordHash = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
  const result = runIsolated(
    `const { env } = await import(${JSON.stringify(configModule)}); console.log(env.authUsers.length)`,
    {
      AUTH_USERS_JSON: JSON.stringify({
        username: "alice",
        passwordHash,
      }),
      JWT_SECRET: "test-secret-with-more-than-thirty-two-characters",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "1");
});
