import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env, type AuthUser } from "../../config/env.js";

function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [, saltHex, keyHex] = passwordHash.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");

  return new Promise((resolve, reject) => {
    scrypt(password, salt, expectedKey.length, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(timingSafeEqual(expectedKey, derivedKey));
    });
  });
}

async function burnPasswordCheck(password: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    scrypt(password, randomBytes(16), 64, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function authenticateUser(
  username: string,
  password: string,
  users: AuthUser[] = env.authUsers
): Promise<AuthUser | undefined> {
  const user = users.find((candidate) => candidate.username === username);
  if (!user) {
    await burnPasswordCheck(password);
    return undefined;
  }

  return (await verifyPassword(password, user.passwordHash)) ? user : undefined;
}

export async function getSessionUsername(
  request: FastifyRequest
): Promise<string | undefined> {
  try {
    const payload = await request.jwtVerify<{ sub: string }>({
      onlyCookie: true
    });
    return payload.sub;
  } catch {
    return undefined;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const username = await getSessionUsername(request);
  if (!username) {
    reply.status(401).send({ error: "Authentication required" });
  }
}
