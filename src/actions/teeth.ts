"use server";

import type { ToothStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { optStr, oneOf } from "@/lib/forms";
import { TOOTH_STATUS, values } from "@/lib/labels";
import { isValidTooth } from "@/lib/teeth";
import { findPrice, type DictatedItem } from "@/lib/dictation";
import { applyCrownRules, applyEndoRules, priceItemsFor, syncToothWithPlan } from "@/lib/plan";

/** Состояние зуба и заметка. Лечение и цены — в плане лечения. */
export async function saveTooth(patientId: string, number: number, formData: FormData) {
  await requireUser();
  if (!isValidTooth(number)) throw new Error("Неверный номер зуба");
  const hasStatus = typeof formData.get("status") === "string" && formData.get("status") !== "";
  const data = {
    ...(hasStatus ? { status: oneOf(formData, "status", values(TOOTH_STATUS), "HEALTHY") } : {}),
    notes: optStr(formData, "notes", 3000),
    patientNote: optStr(formData, "patientNote", 3000),
    patientNoteVisible: formData.get("patientNoteVisible") === "on",
  };
  await prisma.tooth.upsert({
    where: { patientId_number: { patientId, number } },
    create: { patientId, number, status: "HEALTHY", ...data },
    update: data,
  });
  revalidatePath(`/patients/${patientId}`);
}

async function appendToothNote(patientId: string, number: number, note: string, status: ToothStatus | null = null) {
  const t = await prisma.tooth.findUnique({ where: { patientId_number: { patientId, number } } });
  const add = (old: string | null | undefined) => (old && old.toLowerCase().includes(note.toLowerCase()) ? old : [old, note].filter(Boolean).join("; "));
  await prisma.tooth.upsert({
    where: { patientId_number: { patientId, number } },
    create: { patientId, number, status: status ?? "HEALTHY", notes: note, patientNote: note },
    update: { notes: add(t?.notes), patientNote: add(t?.patientNote) },
  });
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
    // уточнение («дистально», «контакт») — заметка к зубу, сразу в обе строки: для нас и для пациента
    if (tooth !== null && it.note) {
      await appendToothNote(patientId, tooth, String(it.note).slice(0, 500), status);
    }
    if (tooth !== null && status) {
      await prisma.tooth.upsert({
        where: { patientId_number: { patientId, number: tooth } },
        create: { patientId, number: tooth, status },
        update: { status },
      });
    }
    if (it.treatment) {
      const treatment = String(it.treatment).slice(0, 300);
      await prisma.treatmentItem.create({
        data: {
          patientId,
          toothNumber: tooth,
          treatment,
          price: findPrice(treatment, prices) ?? 0,
          sortOrder: order++,
        },
      });
      if (tooth !== null) touched.add(tooth);
    }
  }
  await applyEndoRules(patientId);
  await applyCrownRules(patientId);
  for (const t of touched) await syncToothWithPlan(patientId, t);
  revalidatePath(`/patients/${patientId}`);
}
