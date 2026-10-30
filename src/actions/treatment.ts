"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { int, optInt, optStr, oneOf, str } from "@/lib/forms";
import { TREATMENT_STATUS, values } from "@/lib/labels";
import { isValidTooth } from "@/lib/teeth";

function refresh(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
}

export async function addTreatmentItem(patientId: string, formData: FormData) {
  await requireUser();
  const tooth = optInt(formData, "toothNumber");
  const treatment = str(formData, "treatment", 300);
  if (!treatment) return;
  await prisma.treatmentItem.create({
    data: {
      patientId,
      toothNumber: tooth !== null && isValidTooth(tooth) ? tooth : null,
      diagnosis: optStr(formData, "diagnosis", 300),
      treatment,
      price: Math.max(0, int(formData, "price")),
      paid: Math.max(0, int(formData, "paid")),
      status: oneOf(formData, "status", values(TREATMENT_STATUS), "PLANNED"),
    },
  });
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
    data: { status, paid, price: Math.max(0, int(formData, "price", item.price)) },
  });
  refresh(item.patientId);
}

export async function deleteTreatmentItem(id: string) {
  await requireUser();
  const item = await prisma.treatmentItem.delete({ where: { id } });
  refresh(item.patientId);
}
