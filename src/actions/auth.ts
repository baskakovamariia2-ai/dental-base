"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  clearFailedLogins,
  createSession,
  destroySession,
  isLoginBlocked,
  registerFailedLogin,
  requireUser,
} from "@/lib/auth";
import { str } from "@/lib/forms";

export async function login(formData: FormData) {
  const email = str(formData, "email", 200).toLowerCase();
  const password = str(formData, "password", 200);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${ip}:${email}`;

  if (isLoginBlocked(key)) redirect("/login?error=blocked");

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const ok = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !ok) {
    registerFailedLogin(key);
    redirect("/login?error=invalid");
  }
  clearFailedLogins(key);
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changePassword(formData: FormData) {
  const user = await requireUser();
  const current = str(formData, "current", 200);
  const next = str(formData, "next", 200);
  if (next.length < 10) redirect("/more?pw=short");
  const db = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await bcrypt.compare(current, db.passwordHash))) redirect("/more?pw=wrong");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  // Завершаем все остальные сессии
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await createSession(user.id);
  redirect("/more?pw=ok");
}
