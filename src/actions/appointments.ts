"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { int, oneOf, optStr, safeReturn, str } from "@/lib/forms";
import { parseInputDateTime, toISODate } from "@/lib/dates";
import { APPOINTMENT_STATUS, values } from "@/lib/labels";

function readAppointment(fd: FormData) {
  return {
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
  await prisma.appointment.create({ data: { ...data, startsAt: data.startsAt, patientId } });
  revalidatePath("/", "layout");
  redirect(`/schedule?view=day&date=${toISODate(data.startsAt)}`);
}

export async function updateAppointment(id: string, formData: FormData) {
  await requireUser();
  const data = readAppointment(formData);
  if (!data.startsAt || !data.procedure) redirect(`/schedule/${id}?error=1`);
  await prisma.appointment.update({ where: { id }, data: { ...data, startsAt: data.startsAt } });
  revalidatePath("/", "layout");
  redirect(`/schedule?view=day&date=${toISODate(data.startsAt)}`);
}

export async function setAppointmentStatus(id: string, formData: FormData) {
  await requireUser();
  const status = oneOf(formData, "status", values(APPOINTMENT_STATUS), "SCHEDULED");
  await prisma.appointment.update({ where: { id }, data: { status } });
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
