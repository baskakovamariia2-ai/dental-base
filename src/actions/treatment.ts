"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { int, optInt, optStr, oneOf, str } from "@/lib/forms";
import { TREATMENT_STATUS, values } from "@/lib/labels";
import { isValidTooth } from "@/lib/teeth";
import { fillMissingPrices, syncToothWithPlan } from "@/lib/plan";

function refresh(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
}

export async function addTreatmentItem(patientId: string, formData: FormData) {
  await requireUser();
  const raw = optInt(formData, "toothNumber");
  const tooth = raw !== null && isValidTooth(raw) ? raw : null;
  const treatment = str(formData, "treatment", 300);
  if (!treatment) return;
  const maxOrder = await prisma.treatmentItem.aggregate({ where: { patientId }, _max: { sortOrder: true } });
  await prisma.treatmentItem.create({
    data: {
      patientId,
      toothNumber: tooth,
      treatment,
      note: optStr(formData, "note", 1000),
      price: Math.max(0, int(formData, "price")),
      paid: Math.max(0, int(formData, "paid")),
      status: oneOf(formData, "status", values(TREATMENT_STATUS), "PLANNED"),
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
  await syncToothWithPlan(patientId, tooth);
  await fillMissingPrices({ patientIds: [patientId] });
  refresh(patientId);
}

export async function updateTreatmentItem(id: string, formData: FormData) {
  await requireUser();
  const item = await prisma.treatmentItem.findUniqueOrThrow({ where: { id } });
  const status = oneOf(formData, "status", values(TREATMENT_STATUS), item.status);
  let paid = Math.max(0, int(formData, "paid", item.paid));
  if (formData.get("markPaid") === "1") paid = item.price;
  await prisma.treatmentItem.update({
    where: { id },
    data: {
      status,
      paid,
      price: Math.max(0, int(formData, "price", item.price)),
      treatment: str(formData, "treatment", 300) || item.treatment,
      note: formData.has("note") ? optStr(formData, "note", 1000) : item.note,
    },
  });
  await syncToothWithPlan(item.patientId, item.toothNumber);
  refresh(item.patientId);
}

export async function deleteTreatmentItem(id: string) {
  await requireUser();
  const item = await prisma.treatmentItem.delete({ where: { id } });
  await syncToothWithPlan(item.patientId, item.toothNumber);
  refresh(item.patientId);
}
