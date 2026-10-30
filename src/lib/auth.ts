import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "crypto";
import type { Role } from "@prisma/client";
import { prisma } from "./db";

export const SESSION_COOKIE = "db_session";
const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const h = await headers();
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = { id: string; name: string; email: string; role: Role };

/** Проверка сессии на сервере. Кешируется в пределах одного запроса. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  const { id, name, email, role } = session.user;
  return { id, name, email, role };
});

/** Вызывается в КАЖДОЙ странице и server action с медицинскими данными. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("Недостаточно прав");
  return user;
}

// Простая защита от подбора пароля (в памяти процесса)
const attempts = new Map<string, { count: number; until: number }>();

export function isLoginBlocked(key: string) {
  const a = attempts.get(key);
  return !!a && a.count >= 5 && a.until > Date.now();
}

export function registerFailedLogin(key: string) {
  const a = attempts.get(key);
  const now = Date.now();
  if (!a || a.until < now) attempts.set(key, { count: 1, until: now + 15 * 60 * 1000 });
  else a.count += 1;
}

export function clearFailedLogins(key: string) {
  attempts.delete(key);
}
