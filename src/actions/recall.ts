"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { int, optStr, str } from "@/lib/forms";
import { parseISODate } from "@/lib/dates";
import { addMonths } from "@/lib/recall";

/** Поставить «связаться» — через N месяцев или к конкретной дате */
export async function setRecall(patientId: string, formData: FormData) {
  await requireUser();
  // нажата кнопка «через N мес.» — считаем от сегодня; иначе берём дату из поля
  const date = formData.has("months")
    ? addMonths(new Date(), Math.min(36, Math.max(0, int(formData, "months", 6))))
    : parseISODate(str(formData, "date", 10)) ?? addMonths(new Date(), 6);
  const note = optStr(formData, "note", 200) ?? "Связаться";
  await prisma.patient.update({ where: { id: patientId }, data: { recallDate: date, recallNote: note } });
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  revalidatePath("/");
}

/** Связались / записали — убрать напоминание */
export async function clearRecall(patientId: string) {
  await requireUser();
  await prisma.patient.update({ where: { id: patientId }, data: { recallDate: null, recallNote: null } });
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  revalidatePath("/");
}
