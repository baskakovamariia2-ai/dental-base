"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, requireRole } from "@/lib/auth";
import { oneOf, str } from "@/lib/forms";
import { createDemoData, removeDemoData } from "@/lib/demo";

/** Первый запуск: создать владельца. Работает только пока в системе нет ни одного пользователя. */
export async function setupOwner(formData: FormData) {
  const count = await prisma.user.count();
  if (count > 0) redirect("/login");
  const name = str(formData, "name", 100);
  const email = str(formData, "email", 200).toLowerCase();
  const password = str(formData, "password", 200);
  if (!name || !email.includes("@") || password.length < 10) redirect("/setup?error=1");
  const user = await prisma.user.create({
    data: { name, email, role: "OWNER", passwordHash: await bcrypt.hash(password, 12) },
  });
  await createSession(user.id);
  redirect("/more?welcome=1");
}

export async function addUser(formData: FormData) {
  await requireRole("OWNER");
  const name = str(formData, "name", 100);
  const email = str(formData, "email", 200).toLowerCase();
  const password = str(formData, "password", 200);
  const role = oneOf(formData, "role", ["OWNER", "DOCTOR", "ASSISTANT"] as const, "DOCTOR");
  if (!name || !email.includes("@") || password.length < 10) redirect("/more?user=invalid");
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) redirect("/more?user=exists");
  await prisma.user.create({ data: { name, email, role, passwordHash: await bcrypt.hash(password, 12) } });
  revalidatePath("/more");
  redirect("/more?user=ok");
}

export async function toggleUserActive(id: string) {
  const me = await requireRole("OWNER");
  if (id === me.id) return;
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  await prisma.user.update({ where: { id }, data: { isActive: !u.isActive } });
  if (u.isActive) await prisma.session.deleteMany({ where: { userId: id } });
  revalidatePath("/more");
}

export async function seedDemo() {
  await requireRole("OWNER");
  await createDemoData();
  revalidatePath("/", "layout");
  redirect("/patients");
}

export async function clearDemo() {
  await requireRole("OWNER");
  await removeDemoData();
  revalidatePath("/", "layout");
  redirect("/more");
}
