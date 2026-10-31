import type { ToothStatus, TreatmentStatus } from "@prisma/client";
import { prisma } from "./db";
import { doneToothStatus } from "./treatments";

/** Зубная схема следует за планом лечения: план — единственное место, где вносится лечение */
export async function syncToothWithPlan(patientId: string, toothNumber: number | null) {
  if (toothNumber === null) return;
  const items = await prisma.treatmentItem.findMany({ where: { patientId, toothNumber, status: { not: "CANCELLED" } } });
  const tooth = await prisma.tooth.findUnique({ where: { patientId_number: { patientId, number: toothNumber } } });
  const current: ToothStatus = tooth?.status ?? "HEALTHY";
  let next: ToothStatus = current;

  const has = (s: TreatmentStatus) => items.some((i) => i.status === s);
  if (has("IN_PROGRESS")) next = "IN_TREATMENT";
  else if (has("PLANNED")) {
    if (current !== "CARIES" && current !== "PLANNED") next = "PLANNED";
  } else if (items.length && items.every((i) => i.status === "DONE")) {
    const last = items[items.length - 1];
    next = doneToothStatus(last.treatment);
  }
  if (next !== current || !tooth) {
    await prisma.tooth.upsert({
      where: { patientId_number: { patientId, number: toothNumber } },
      create: { patientId, number: toothNumber, status: next },
      update: { status: next },
    });
  }
}

/** Позиции прайса пациента (его версия) или прайса по умолчанию */
export async function priceItemsFor(patientId: string) {
  const p = await prisma.patient.findUnique({ where: { id: patientId }, select: { priceListId: true } });
  const list = p?.priceListId
    ? await prisma.priceList.findUnique({ where: { id: p.priceListId }, include: { items: { orderBy: { sortOrder: "asc" } } } })
    : await prisma.priceList.findFirst({ where: { isDefault: true }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  return { list, items: list?.items ?? [] };
}
