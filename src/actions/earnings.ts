"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { int, optStr } from "@/lib/forms";

/** Аренда/стерилизация в конкретный день, если отличались от обычных */
export async function saveDayExpense(date: string, formData: FormData) {
  await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  if (formData.get("reset") === "1") {
    await prisma.dayExpense.deleteMany({ where: { date } });
  } else {
    const data = { rent: Math.max(0, int(formData, "rent")), sterilization: Math.max(0, int(formData, "sterilization")), note: optStr(formData, "note", 300) };
    await prisma.dayExpense.upsert({ where: { date }, create: { date, ...data }, update: data });
  }
  revalidatePath("/earnings");
  revalidatePath("/schedule");
}
