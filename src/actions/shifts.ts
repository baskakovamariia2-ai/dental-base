"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { optStr, str } from "@/lib/forms";
import { parseISODate } from "@/lib/dates";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Забронировать смену (или поменять её часы) */
export async function saveShift(date: string, formData: FormData) {
  await requireUser();
  if (!parseISODate(date)) return;
  const start = TIME.test(str(formData, "start", 5)) ? str(formData, "start", 5) : "15:00";
  let end = TIME.test(str(formData, "end", 5)) ? str(formData, "end", 5) : "21:00";
  if (end <= start) end = "21:00";
  const note = optStr(formData, "note", 200);
  await prisma.shift.upsert({ where: { date }, create: { date, start, end, note }, update: { start, end, note } });
  revalidatePath("/schedule");
  revalidatePath("/schedule/new");
}

export async function removeShift(date: string) {
  await requireUser();
  await prisma.shift.deleteMany({ where: { date } });
  revalidatePath("/schedule");
  revalidatePath("/schedule/new");
}
