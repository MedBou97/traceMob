import { Type, type Static } from "@sinclair/typebox";

export const LoginRequestSchema = Type.Object({
  username: Type.String({ minLength: 1, maxLength: 128 }),
  password: Type.String({ minLength: 1, maxLength: 1024 })
});

export type LoginRequest = Static<typeof LoginRequestSchema>;

export const AuthSessionSchema = Type.Object({
  username: Type.String()
});

export const AuthErrorSchema = Type.Object({
  error: Type.String()
});

export const LogoutResponseSchema = Type.Null();
