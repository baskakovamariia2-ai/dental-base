"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { int, optStr, str } from "@/lib/forms";

// Индивидуальный прайс пациента
export async function addPatientPrice(patientId: string, formData: FormData) {
  await requireUser();
  const serviceId = optStr(formData, "serviceId", 50);
  let name = str(formData, "name", 200);
  let price = int(formData, "price", -1);
  if (serviceId && (!name || price < 0)) {
    const s = await prisma.service.findUnique({ where: { id: serviceId } });
    if (s) {
      name = name || s.name;
      if (price < 0) price = s.price;
    }
  }
  if (!name || price < 0) return;
  await prisma.patientPrice.create({ data: { patientId, serviceId, name, price } });
  revalidatePath(`/patients/${patientId}`);
}

export async function updatePatientPrice(id: string, formData: FormData) {
  await requireUser();
  const p = await prisma.patientPrice.update({
    where: { id },
    data: { price: Math.max(0, int(formData, "price")) },
  });
  revalidatePath(`/patients/${p.patientId}`);
}

export async function deletePatientPrice(id: string) {
  await requireUser();
  const p = await prisma.patientPrice.delete({ where: { id } });
  revalidatePath(`/patients/${p.patientId}`);
}

// Общий прайс клиники
export async function addService(formData: FormData) {
  await requireUser();
  const name = str(formData, "name", 200);
  if (!name) return;
  await prisma.service.create({
    data: {
      name,
      price: Math.max(0, int(formData, "price")),
      category: optStr(formData, "category", 100),
      comment: optStr(formData, "comment", 500),
    },
  });
  revalidatePath("/prices");
}

export async function updateService(id: string, formData: FormData) {
  await requireUser();
  await prisma.service.update({
    where: { id },
    data: {
      name: str(formData, "name", 200) || undefined,
      price: Math.max(0, int(formData, "price")),
      category: optStr(formData, "category", 100),
      comment: optStr(formData, "comment", 500),
    },
  });
  revalidatePath("/prices");
}

export async function deleteService(id: string) {
  await requireUser();
  // Мягкое удаление: старые цены пациентов остаются нетронутыми
  await prisma.service.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/prices");
}
