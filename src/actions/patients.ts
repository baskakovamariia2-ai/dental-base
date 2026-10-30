"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { optStr, oneOf, str } from "@/lib/forms";
import { parseISODate } from "@/lib/dates";
import { PATIENT_SOURCE, PATIENT_STATUS, values } from "@/lib/labels";

function readPatient(fd: FormData) {
  return {
    firstName: str(fd, "firstName", 100),
    lastName: str(fd, "lastName", 100),
    middleName: optStr(fd, "middleName", 100),
    phone: optStr(fd, "phone", 40),
    telegram: optStr(fd, "telegram", 100),
    priceListId: optStr(fd, "priceListId", 50),
    birthDate: parseISODate(str(fd, "birthDate")),
    firstVisitDate: parseISODate(str(fd, "firstVisitDate")),
    source: oneOf(fd, "source", values(PATIENT_SOURCE), "OTHER"),
    sourceComment: optStr(fd, "sourceComment", 200),
    status: oneOf(fd, "status", values(PATIENT_STATUS), "NEW"),
    notes: optStr(fd, "notes", 5000),
  };
}

export async function createPatient(formData: FormData) {
  await requireUser();
  const data = readPatient(formData);
  if (!data.firstName || !data.lastName) redirect("/patients/new?error=name");
  const p = await prisma.patient.create({ data: { ...data, firstVisitDate: data.firstVisitDate ?? new Date() } });
  revalidatePath("/", "layout");
  redirect(`/patients/${p.id}`);
}

export async function updatePatient(id: string, formData: FormData) {
  await requireUser();
  const data = readPatient(formData);
  if (!data.firstName || !data.lastName) redirect(`/patients/${id}/edit?error=name`);
  await prisma.patient.update({ where: { id }, data });
  revalidatePath("/", "layout");
  redirect(`/patients/${id}`);
}

export async function setPatientPriceList(id: string, formData: FormData) {
  await requireUser();
  await prisma.patient.update({ where: { id }, data: { priceListId: optStr(formData, "priceListId", 50) } });
  revalidatePath(`/patients/${id}`);
}

export async function setPatientStatus(id: string, formData: FormData) {
  await requireUser();
  const status = oneOf(formData, "status", values(PATIENT_STATUS), "NEW");
  await prisma.patient.update({ where: { id }, data: { status } });
  revalidatePath("/", "layout");
}

export async function archivePatient(id: string) {
  await requireUser();
  await prisma.patient.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath("/", "layout");
  redirect("/patients");
}

export async function restorePatient(id: string) {
  await requireUser();
  await prisma.patient.update({ where: { id }, data: { archivedAt: null } });
  revalidatePath("/", "layout");
  redirect(`/patients/${id}`);
}

/** Полное удаление — только владелец и только из архива */
export async function deletePatientForever(id: string) {
  await requireRole("OWNER");
  const p = await prisma.patient.findUniqueOrThrow({ where: { id } });
  if (!p.archivedAt) throw new Error("Сначала переместите пациента в архив");
  await prisma.patient.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect("/patients?filter=archived");
}
