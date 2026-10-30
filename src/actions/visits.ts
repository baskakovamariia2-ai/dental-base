"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { int, optStr, str } from "@/lib/forms";
import { parseISODate } from "@/lib/dates";

function readVisit(fd: FormData) {
  return {
    date: parseISODate(str(fd, "date")) ?? new Date(),
    doctorId: optStr(fd, "doctorId", 50),
    reason: optStr(fd, "reason", 300),
    workDone: optStr(fd, "workDone", 5000),
    teeth: optStr(fd, "teeth", 200),
    diagnosis: optStr(fd, "diagnosis", 500),
    materials: optStr(fd, "materials", 2000),
    recommendations: optStr(fd, "recommendations", 3000),
    cost: Math.max(0, int(fd, "cost")),
    comment: optStr(fd, "comment", 3000),
  };
}

export async function createVisit(formData: FormData) {
  const user = await requireUser();
  const patientId = str(formData, "patientId", 50);
  if (!patientId) redirect("/visits/new?error=patient");
  const data = readVisit(formData);
  await prisma.visit.create({ data: { ...data, doctorId: data.doctorId ?? user.id, patientId } });
  // Завершаем сегодняшнюю запись пациента, если она была
  if (formData.get("closeAppointment")) {
    const apId = str(formData, "closeAppointment", 50);
    await prisma.appointment.updateMany({ where: { id: apId, patientId }, data: { status: "DONE" } });
  }
  revalidatePath("/", "layout");
  redirect(`/patients/${patientId}?tab=history`);
}

export async function updateVisit(id: string, formData: FormData) {
  await requireUser();
  const v = await prisma.visit.update({ where: { id }, data: readVisit(formData) });
  revalidatePath("/", "layout");
  redirect(`/patients/${v.patientId}?tab=history`);
}

export async function deleteVisit(id: string) {
  await requireUser();
  const v = await prisma.visit.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect(`/patients/${v.patientId}?tab=history`);
}
