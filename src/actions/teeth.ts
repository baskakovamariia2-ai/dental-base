"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { optInt, optStr, oneOf, str } from "@/lib/forms";
import { TOOTH_STATUS, TREATMENT_STATUS, values } from "@/lib/labels";
import { isValidTooth } from "@/lib/teeth";

export async function saveTooth(patientId: string, number: number, formData: FormData) {
  await requireUser();
  if (!isValidTooth(number)) throw new Error("Неверный номер зуба");

  const tsRaw = str(formData, "treatmentStatus");
  const data = {
    status: oneOf(formData, "status", values(TOOTH_STATUS), "HEALTHY"),
    diagnosis: optStr(formData, "diagnosis", 300),
    problem: optStr(formData, "problem", 300),
    treatment: optStr(formData, "treatment", 300),
    notes: optStr(formData, "notes", 3000),
    price: optInt(formData, "price"),
    treatmentStatus: tsRaw ? oneOf(formData, "treatmentStatus", values(TREATMENT_STATUS), "PLANNED") : null,
  };

  await prisma.tooth.upsert({
    where: { patientId_number: { patientId, number } },
    create: { patientId, number, ...data },
    update: data,
  });

  // По желанию — сразу добавить пункт в план лечения
  if (formData.get("addToPlan") === "on" && data.treatment) {
    await prisma.treatmentItem.create({
      data: {
        patientId,
        toothNumber: number,
        diagnosis: data.diagnosis,
        treatment: data.treatment,
        price: data.price ?? 0,
        status: data.treatmentStatus ?? "PLANNED",
      },
    });
  }

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
}
