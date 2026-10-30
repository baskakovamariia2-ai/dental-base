"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/forms";
import { parsePriceList } from "@/lib/parse-lists";

async function saveItems(priceListId: string, text: string) {
  const items = parsePriceList(text);
  await prisma.priceListItem.deleteMany({ where: { priceListId } });
  if (items.length) {
    await prisma.priceListItem.createMany({ data: items.map((i, idx) => ({ priceListId, name: i.name, price: i.price, sortOrder: idx })) });
  }
}

export async function createPriceList(formData: FormData) {
  await requireUser();
  const name = str(formData, "name", 100) || "Прайс";
  const text = str(formData, "text", 20000);
  const isFirst = (await prisma.priceList.count()) === 0;
  const list = await prisma.priceList.create({ data: { name, text, isDefault: isFirst || formData.get("isDefault") === "on" } });
  if (list.isDefault) await prisma.priceList.updateMany({ where: { id: { not: list.id } }, data: { isDefault: false } });
  await saveItems(list.id, text);
  revalidatePath("/prices");
  redirect(`/prices/${list.id}`);
}

export async function updatePriceList(id: string, formData: FormData) {
  await requireUser();
  const text = str(formData, "text", 20000);
  await prisma.priceList.update({ where: { id }, data: { name: str(formData, "name", 100) || "Прайс", text } });
  await saveItems(id, text);
  revalidatePath("/prices", "layout");
  redirect(`/prices/${id}`);
}

export async function makeDefaultPriceList(id: string) {
  await requireUser();
  await prisma.priceList.updateMany({ data: { isDefault: false } });
  await prisma.priceList.update({ where: { id }, data: { isDefault: true } });
  revalidatePath("/prices", "layout");
}

export async function deletePriceList(id: string) {
  await requireUser();
  await prisma.priceList.delete({ where: { id } });
  revalidatePath("/prices", "layout");
  redirect("/prices");
}
