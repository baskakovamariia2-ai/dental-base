"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/forms";
import { parseISODate } from "@/lib/dates";

export async function addTask(formData: FormData) {
  await requireUser();
  const title = str(formData, "title", 300);
  if (!title) return;
  await prisma.task.create({ data: { title, dueDate: parseISODate(str(formData, "dueDate")) } });
  revalidatePath("/");
}

export async function toggleTask(id: string) {
  await requireUser();
  const t = await prisma.task.findUniqueOrThrow({ where: { id } });
  await prisma.task.update({ where: { id }, data: { done: !t.done } });
  revalidatePath("/");
}
