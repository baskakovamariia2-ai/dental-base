import type { ToothStatus, TreatmentStatus } from "@prisma/client";
import { prisma } from "./db";
import { doneToothStatus, findPrice } from "./treatments";

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

/**
 * Подставляет цены из прайса пациента в пункты плана, где цена ещё не указана (0).
 * Уже назначенные цены не трогаем.
 */
export async function fillMissingPrices(where: { patientIds?: string[] } = {}) {
  const items = await prisma.treatmentItem.findMany({
    where: { price: 0, status: { not: "CANCELLED" }, ...(where.patientIds ? { patientId: { in: where.patientIds } } : {}) },
    select: { id: true, patientId: true, treatment: true },
  });
  if (!items.length) return 0;
  const cache = new Map<string, { name: string; price: number }[]>();
  let updated = 0;
  for (const it of items) {
    if (!cache.has(it.patientId)) cache.set(it.patientId, (await priceItemsFor(it.patientId)).items);
    const price = findPrice(it.treatment, cache.get(it.patientId)!);
    if (price) {
      await prisma.treatmentItem.update({ where: { id: it.id }, data: { price } });
      updated++;
    }
  }
  return updated;
}
