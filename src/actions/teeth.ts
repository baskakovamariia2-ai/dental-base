"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { optStr, oneOf } from "@/lib/forms";
import { TOOTH_STATUS, values } from "@/lib/labels";
import { isValidTooth } from "@/lib/teeth";
import { findPrice, type DictatedItem } from "@/lib/dictation";
import { priceItemsFor, syncToothWithPlan } from "@/lib/plan";

/** Состояние зуба (диагноз, заметки). Лечение и цены — в плане лечения. */
export async function saveTooth(patientId: string, number: number, formData: FormData) {
  await requireUser();
  if (!isValidTooth(number)) throw new Error("Неверный номер зуба");
  const data = {
    status: oneOf(formData, "status", values(TOOTH_STATUS), "HEALTHY"),
    diagnosis: optStr(formData, "diagnosis", 300),
    problem: optStr(formData, "problem", 300),
    notes: optStr(formData, "notes", 3000),
  };
  await prisma.tooth.upsert({
    where: { patientId_number: { patientId, number } },
    create: { patientId, number, ...data },
    update: data,
  });
  revalidatePath(`/patients/${patientId}`);
}

/** Применить надиктованную формулу: обновить зубы и составить план */
export async function applyDictation(patientId: string, payload: string) {
  await requireUser();
  let items: DictatedItem[] = [];
  try {
    items = JSON.parse(payload);
  } catch {
    return;
  }
  const { items: prices } = await priceItemsFor(patientId);
  const touched = new Set<number>();
  const maxOrder = await prisma.treatmentItem.aggregate({ where: { patientId }, _max: { sortOrder: true } });
  let order = (maxOrder._max.sortOrder ?? 0) + 1;

  for (const it of items.slice(0, 100)) {
    const tooth = it.tooth !== null && isValidTooth(Number(it.tooth)) ? Number(it.tooth) : null;
    const status = it.status && values(TOOTH_STATUS).includes(it.status) ? it.status : null;
    if (tooth !== null && (status || it.diagnosis)) {
      await prisma.tooth.upsert({
        where: { patientId_number: { patientId, number: tooth } },
        create: { patientId, number: tooth, status: status ?? "HEALTHY", diagnosis: it.diagnosis },
        update: { ...(status ? { status } : {}), ...(it.diagnosis ? { diagnosis: it.diagnosis } : {}) },
      });
    }
    if (it.treatment) {
      const treatment = String(it.treatment).slice(0, 300);
      await prisma.treatmentItem.create({
        data: {
          patientId,
          toothNumber: tooth,
          diagnosis: it.diagnosis ? String(it.diagnosis).slice(0, 300) : null,
          treatment,
          price: findPrice(treatment, prices) ?? 0,
          sortOrder: order++,
        },
      });
      if (tooth !== null) touched.add(tooth);
    }
  }
  // Диагноз (кариес/пульпит) оставляем как статус зуба; для остальных — «лечение запланировано»
  for (const t of touched) {
    const tooth = await prisma.tooth.findUnique({ where: { patientId_number: { patientId, number: t } } });
    if (!tooth || tooth.status === "HEALTHY") await syncToothWithPlan(patientId, t);
  }
  revalidatePath(`/patients/${patientId}`);
}
