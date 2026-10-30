"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num, oneOf, optInt, optStr, str } from "@/lib/forms";
import { parseISODate } from "@/lib/dates";
import { INVENTORY_CATEGORY, values } from "@/lib/labels";

async function supplierIdFrom(fd: FormData): Promise<string | null> {
  const name = str(fd, "supplier", 150);
  if (!name) return null;
  const s = await prisma.supplier.upsert({ where: { name }, create: { name }, update: {} });
  return s.id;
}

function readItem(fd: FormData) {
  return {
    name: str(fd, "name", 200),
    category: oneOf(fd, "category", values(INVENTORY_CATEGORY), "OTHER"),
    quantity: Math.max(0, num(fd, "quantity")),
    unit: str(fd, "unit", 30) || "шт.",
    minQuantity: Math.max(0, num(fd, "minQuantity")),
    lastPurchasePrice: optInt(fd, "lastPurchasePrice"),
    currentPrice: optInt(fd, "currentPrice"),
    lastPurchaseDate: parseISODate(str(fd, "lastPurchaseDate")),
    url: optStr(fd, "url", 500),
    comment: optStr(fd, "comment", 2000),
  };
}

function refresh() {
  revalidatePath("/inventory", "layout");
  revalidatePath("/");
}

export async function createItem(formData: FormData) {
  await requireUser();
  const data = readItem(formData);
  if (!data.name) redirect("/inventory/new?error=name");
  const item = await prisma.inventoryItem.create({ data: { ...data, supplierId: await supplierIdFrom(formData) } });
  refresh();
  redirect(`/inventory/${item.id}`);
}

export async function updateItem(id: string, formData: FormData) {
  await requireUser();
  const data = readItem(formData);
  if (!data.name) redirect(`/inventory/${id}/edit?error=name`);
  await prisma.inventoryItem.update({ where: { id }, data: { ...data, supplierId: await supplierIdFrom(formData) } });
  refresh();
  redirect(`/inventory/${id}`);
}

/** +1 / −1 / установить точное количество */
export async function adjustQuantity(id: string, formData: FormData) {
  await requireUser();
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
  const delta = num(formData, "delta", NaN);
  const exact = num(formData, "exact", NaN);
  let quantity = item.quantity;
  if (Number.isFinite(exact)) quantity = exact;
  else if (Number.isFinite(delta)) quantity = item.quantity + delta;
  await prisma.inventoryItem.update({ where: { id }, data: { quantity: Math.max(0, quantity) } });
  refresh();
}

export async function setToBuy(id: string, formData: FormData) {
  await requireUser();
  const q = num(formData, "toBuyQuantity", 0);
  await prisma.inventoryItem.update({ where: { id }, data: { toBuyQuantity: q > 0 ? q : null } });
  refresh();
}

/** «Отметить как купленное»: запись в истории закупок + обновление остатка и цен */
export async function recordPurchase(id: string, formData: FormData) {
  await requireUser();
  const quantity = num(formData, "quantity", 0);
  const price = optInt(formData, "price");
  if (quantity <= 0) return;
  const date = parseISODate(str(formData, "date")) ?? new Date();
  const supplierId = await supplierIdFrom(formData);
  await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
    await tx.purchase.create({
      data: { itemId: id, date, quantity, price: price ?? item.currentPrice ?? 0, supplierId, comment: optStr(formData, "comment", 500) },
    });
    await tx.inventoryItem.update({
      where: { id },
      data: {
        quantity: item.quantity + quantity,
        lastPurchaseDate: date,
        lastPurchasePrice: price ?? item.lastPurchasePrice,
        currentPrice: price ?? item.currentPrice,
        supplierId: supplierId ?? item.supplierId,
        toBuyQuantity: null,
      },
    });
  });
  refresh();
}

export async function archiveItem(id: string) {
  await requireUser();
  await prisma.inventoryItem.update({ where: { id }, data: { archivedAt: new Date() } });
  refresh();
  redirect("/inventory");
}
