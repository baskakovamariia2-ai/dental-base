import type { ToothStatus, TreatmentStatus } from "@prisma/client";
import { prisma } from "./db";
import { CROWN_PARTS, DEFAULT_RESTORATION_PRICE, ENDO_RESTORATION, FOUR_CANAL_NOTE, FOUR_CANAL_PRICE, canalCount, crownPartName, doneToothStatus, findPrice, isEndo, restorationPrice, splitCrownPrice } from "./treatments";

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
  } else if (!items.length && (current === "PLANNED" || current === "IN_TREATMENT")) {
    // лечение из плана удалили — зуб больше не отмечен как проблемный
    next = "HEALTHY";
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
    where: {
      price: 0,
      status: { not: "CANCELLED" },
      NOT: { diagnosis: { startsWith: "crown:" } },
      ...(where.patientIds ? { patientId: { in: where.patientIds } } : {}),
    },
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

/**
 * После добавления пульпита/периодонтита: сразу добавить реставрацию зуба (6 000 ₽ или по прайсу),
 * а для 4-канального зуба — цена 15 000 ₽ и комментарий «скидка 5 000 ₽».
 */
export async function applyEndoRules(patientId: string) {
  const items = await prisma.treatmentItem.findMany({ where: { patientId, status: { not: "CANCELLED" } } });
  const endo = items.filter((i) => isEndo(i.treatment));
  if (!endo.length) return;
  const { items: prices } = await priceItemsFor(patientId);
  for (const e of endo) {
    if (canalCount(e.treatment) === 4 && e.status !== "DONE" && (e.price !== FOUR_CANAL_PRICE || !e.note)) {
      await prisma.treatmentItem.update({
        where: { id: e.id },
        data: { price: FOUR_CANAL_PRICE, note: e.note && e.note.includes("скидка") ? e.note : [e.note, FOUR_CANAL_NOTE].filter(Boolean).join(" · ") },
      });
    }
    // реставрацию добавляем один раз (если её потом удалили вручную — больше не добавляем)
    if (e.toothNumber === null || e.status === "DONE" || e.diagnosis === "auto:resto") continue;
    await prisma.treatmentItem.update({ where: { id: e.id }, data: { diagnosis: "auto:resto" } });
    const hasRestoration = items.some((i) => i.toothNumber === e.toothNumber && /реставрац|пломб/i.test(i.treatment));
    if (!hasRestoration) {
      const created = await prisma.treatmentItem.create({
        data: {
          patientId,
          toothNumber: e.toothNumber,
          treatment: ENDO_RESTORATION,
          price: restorationPrice(prices) || DEFAULT_RESTORATION_PRICE,
          status: "PLANNED",
          sortOrder: e.sortOrder + 1,
        },
      });
      items.push(created);
    }
  }
}

/** Коронку (ещё не выполненную) делим на три приёма с ценой 10 000 + 10 000 + 5 000 */
export async function applyCrownRules(patientId: string) {
  const items = await prisma.treatmentItem.findMany({
    where: { patientId, status: { in: ["PLANNED", "IN_PROGRESS"] }, treatment: { contains: "оронк" } },
  });
  if (!items.length) return;
  const { items: prices } = await priceItemsFor(patientId);
  for (const it of items) {
    if (it.diagnosis?.startsWith("crown:")) {
      // часть уже разделённой коронки без цены — досчитать, когда цена появилась в прайсе
      if (!it.price) {
        const [, part, base] = it.diagnosis.split(":");
        const total = findPrice(base, prices) ?? 0;
        const price = splitCrownPrice(total)[Number(part) - 1] ?? 0;
        if (price) await prisma.treatmentItem.update({ where: { id: it.id }, data: { price } });
      }
      continue;
    }
    const total = it.price || findPrice(it.treatment, prices) || 0;
    const parts = splitCrownPrice(total);
    await prisma.$transaction([
      prisma.treatmentItem.delete({ where: { id: it.id } }),
      ...Array.from({ length: CROWN_PARTS }, (_, i) =>
        prisma.treatmentItem.create({
          data: {
            patientId,
            toothNumber: it.toothNumber,
            treatment: crownPartName(it.treatment, i + 1),
            price: parts[i],
            paid: i === 0 ? Math.min(it.paid, parts[0]) : 0,
            note: i === 0 ? it.note : null,
            status: i === 0 ? it.status : "PLANNED",
            sortOrder: it.sortOrder,
            diagnosis: `crown:${i + 1}:${it.treatment}`,
          },
        }),
      ),
    ]);
  }
}
