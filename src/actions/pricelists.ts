"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { int, str } from "@/lib/forms";
import { parsePriceList } from "@/lib/parse-lists";
import { fillMissingPrices } from "@/lib/plan";

/** Пересобрать услуги из текста. Если в тексте у услуги нет цены — берём ту, что уже была введена вручную. */
async function saveItems(priceListId: string, text: string) {
  const old = await prisma.priceListItem.findMany({ where: { priceListId } });
  const oldPrice = new Map(old.map((o) => [o.name.toLowerCase(), o.price]));
  const items = parsePriceList(text).map((i) => ({ ...i, price: i.price || oldPrice.get(i.name.toLowerCase()) || 0 }));
  await prisma.priceListItem.deleteMany({ where: { priceListId } });
  if (items.length) {
    await prisma.priceListItem.createMany({ data: items.map((i, idx) => ({ priceListId, name: i.name, price: i.price, sortOrder: idx })) });
  }
}

async function refreshPlans() {
  await fillMissingPrices();
  revalidatePath("/", "layout");
}

export async function createPriceList(formData: FormData) {
  await requireUser();
  const name = str(formData, "name", 100) || "Прайс";
  const text = str(formData, "text", 20000);
  const isFirst = (await prisma.priceList.count()) === 0;
  const list = await prisma.priceList.create({ data: { name, text, isDefault: isFirst || formData.get("isDefault") === "on" } });
  if (list.isDefault) await prisma.priceList.updateMany({ where: { id: { not: list.id } }, data: { isDefault: false } });
  await saveItems(list.id, text);
  await refreshPlans();
  redirect(`/prices/${list.id}`);
}

export async function updatePriceList(id: string, formData: FormData) {
  await requireUser();
  const text = str(formData, "text", 20000);
  await prisma.priceList.update({ where: { id }, data: { name: str(formData, "name", 100) || "Прайс", text } });
  await saveItems(id, text);
  await refreshPlans();
  redirect(`/prices/${id}?saved=1`);
}

export async function makeDefaultPriceList(id: string) {
  await requireUser();
  await prisma.priceList.updateMany({ data: { isDefault: false } });
  await prisma.priceList.update({ where: { id }, data: { isDefault: true } });
  await refreshPlans();
}

export async function deletePriceList(id: string) {
  await requireUser();
  await prisma.priceList.delete({ where: { id } });
  revalidatePath("/prices", "layout");
  redirect("/prices");
}

// ── Услуги прайса по отдельности ──

export async function updatePriceItem(id: string, formData: FormData) {
  await requireUser();
  const name = str(formData, "name", 200);
  await prisma.priceListItem.update({
    where: { id },
    data: { ...(name ? { name } : {}), price: Math.max(0, int(formData, "price")) },
  });
  await refreshPlans();
}

export async function addPriceItem(priceListId: string, formData: FormData) {
  await requireUser();
  const name = str(formData, "name", 200);
  if (!name) return;
  const max = await prisma.priceListItem.aggregate({ where: { priceListId }, _max: { sortOrder: true } });
  await prisma.priceListItem.create({
    data: { priceListId, name, price: Math.max(0, int(formData, "price")), sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  await refreshPlans();
}

export async function deletePriceItem(id: string) {
  await requireUser();
  await prisma.priceListItem.delete({ where: { id } });
  revalidatePath("/prices", "layout");
}

/** Кнопка «Подставить цены из прайса» в плане пациента */
export async function fillPlanPrices(patientId: string) {
  await requireUser();
  await fillMissingPrices({ patientIds: [patientId] });
  revalidatePath(`/patients/${patientId}`);
}
