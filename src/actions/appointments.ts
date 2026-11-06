"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { int, oneOf, optInt, optStr, safeReturn, str } from "@/lib/forms";
import { addDays, parseISODate, parseInputDateTime, toISODate } from "@/lib/dates";
import { completeAppointment } from "@/lib/appointments";
import { isValidTooth } from "@/lib/teeth";
import { APPOINTMENT_STATUS, values } from "@/lib/labels";

function readAppointment(fd: FormData) {
  const tooth = optInt(fd, "toothNumber");
  return {
    price: optInt(fd, "price"),
    toothNumber: tooth !== null && isValidTooth(tooth) ? tooth : null,
    treatmentItemId: optStr(fd, "treatmentItemId", 50),
    startsAt: parseInputDateTime(str(fd, "startsAt")),
    durationMin: Math.min(600, Math.max(5, int(fd, "durationMin", 60))),
    procedure: str(fd, "procedure", 200),
    doctorId: optStr(fd, "doctorId", 50),
    status: oneOf(fd, "status", values(APPOINTMENT_STATUS), "SCHEDULED"),
    comment: optStr(fd, "comment", 2000),
  };
}

export async function createAppointment(formData: FormData) {
  await requireUser();
  const patientId = str(formData, "patientId", 50);
  const data = readAppointment(formData);
  if (!patientId || !data.startsAt || !data.procedure) {
    redirect(`/schedule/new?error=1${patientId ? `&patient=${patientId}` : ""}`);
  }
  if (data.treatmentItemId) {
    const it = await prisma.treatmentItem.findUnique({ where: { id: data.treatmentItemId } });
    if (!it || it.patientId !== patientId) data.treatmentItemId = null;
  }
  await prisma.appointment.create({ data: { ...data, startsAt: data.startsAt, patientId } });
  revalidatePath("/", "layout");
  redirect(`/schedule?view=day&date=${toISODate(data.startsAt)}`);
}

export async function updateAppointment(id: string, formData: FormData) {
  await requireUser();
  const data = readAppointment(formData);
  if (!data.startsAt || !data.procedure) redirect(`/schedule/${id}?error=1`);
  const current = await prisma.appointment.findUniqueOrThrow({ where: { id } });
  if (data.treatmentItemId) {
    const it = await prisma.treatmentItem.findUnique({ where: { id: data.treatmentItemId } });
    if (!it || it.patientId !== current.patientId) data.treatmentItemId = null;
  }
  const { status, ...rest } = data;
  await prisma.appointment.update({ where: { id }, data: { ...rest, startsAt: data.startsAt, ...(status !== "DONE" ? { status } : {}) } });
  if (status === "DONE") await completeAppointment(id);
  revalidatePath("/", "layout");
  redirect(`/schedule?view=day&date=${toISODate(data.startsAt)}`);
}

export async function setAppointmentStatus(id: string, formData: FormData) {
  await requireUser();
  const status = oneOf(formData, "status", values(APPOINTMENT_STATUS), "SCHEDULED");
  if (status === "DONE") await completeAppointment(id);
  else await prisma.appointment.update({ where: { id }, data: { status } });
  revalidatePath("/", "layout");
  const back = safeReturn(formData, "");
  if (back) redirect(back);
}

export async function toggleReminder(id: string, formData: FormData) {
  await requireUser();
  const a = await prisma.appointment.findUniqueOrThrow({ where: { id } });
  await prisma.appointment.update({ where: { id }, data: { reminderSent: !a.reminderSent } });
  revalidatePath("/", "layout");
  const back = safeReturn(formData, "");
  if (back) redirect(back);
}

export async function deleteAppointment(id: string) {
  await requireUser();
  const a = await prisma.appointment.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect(`/schedule?view=day&date=${toISODate(a.startsAt)}`);
}

/** Вызывается кнопкой «Напомнить в Telegram» */
export async function markReminderSent(id: string) {
  await requireUser();
  await prisma.appointment.update({ where: { id }, data: { reminderSent: true } });
  revalidatePath("/", "layout");
}

/** «Завершить день»: все записи дня → выполнены, процедуры → в план как выполненные, суммы → в заработок */
export async function completeDay(date: string) {
  await requireUser();
  const day = parseISODate(date);
  if (!day) return;
  const aps = await prisma.appointment.findMany({
    where: { startsAt: { gte: day, lt: addDays(day, 1) }, status: { notIn: ["CANCELLED", "NO_SHOW", "DONE"] } },
    orderBy: { startsAt: "asc" },
  });
  for (const a of aps) await completeAppointment(a.id);
  revalidatePath("/", "layout");
}
