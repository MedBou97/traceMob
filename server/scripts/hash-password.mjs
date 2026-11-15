import { randomBytes, scryptSync } from "node:crypto";

const username = process.argv[2]?.trim();
if (!username || username.length > 128) {
  throw new Error("Usage: node server/scripts/hash-password.mjs <username>");
}

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
if (!password) {
  throw new Error("Pass the password through standard input");
}

const salt = randomBytes(16);
const key = scryptSync(password, salt, 64);
process.stdout.write(
  `${JSON.stringify({
    username,
    passwordHash: `scrypt:${salt.toString("hex")}:${key.toString("hex")}`,
  })}\n`,
);
