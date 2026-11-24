"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseISODate, startOfDay } from "@/lib/dates";
import { EXPENSE_CATEGORY } from "@/lib/expenses";
import { guessCategory } from "@/lib/inventory-category";
import { nameScore } from "@/lib/upd";

export async function addExpense(formData: FormData) {
  await requireUser();
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const amount = Math.round(Number(String(formData.get("amount") ?? "").replace(/[\s₽]/g, "").replace(",", ".")));
  if (!title || !Number.isFinite(amount) || amount <= 0) return;
  const cat = String(formData.get("category") ?? "OTHER");
  await prisma.expense.create({
    data: {
      title,
      amount,
      date: parseISODate(String(formData.get("date") ?? "")) ?? startOfDay(new Date()),
      category: cat in EXPENSE_CATEGORY ? cat : "OTHER",
      comment: String(formData.get("comment") ?? "").trim().slice(0, 500) || null,
    },
  });
  revalidatePath("/expenses");
  revalidatePath("/inventory");
  redirect(`/inventory/ozon?ok=${encodeURIComponent(title)}`);
}

export async function deleteExpense(id: string) {
  await requireUser();
  await prisma.expense.deleteMany({ where: { id } });
  revalidatePath("/expenses");
  revalidatePath("/inventory");
}

/** Покупка по ссылке (Озон и т.п.): на склад (с ссылкой) или просто в траты */
export async function addLinkPurchase(formData: FormData) {
  await requireUser();
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const amount = Math.round(Number(String(formData.get("amount") ?? "").replace(/[\s₽]/g, "").replace(",", ".")));
  const quantity = Number(String(formData.get("quantity") ?? "1").replace(",", ".")) || 1;
  if (!title || !Number.isFinite(amount) || amount <= 0 || quantity <= 0) return;
  const rawUrl = String(formData.get("url") ?? "").trim();
  const url = /^https?:\/\//.test(rawUrl) ? rawUrl.slice(0, 1000) : null;
  const date = parseISODate(String(formData.get("date") ?? "")) ?? startOfDay(new Date());
  const shop = String(formData.get("shop") ?? "").trim().slice(0, 100) || "Озон";

  if (formData.get("toStock") === "on") {
    const supplier = await prisma.supplier.upsert({ where: { name: shop }, create: { name: shop }, update: {} });
    const items = await prisma.inventoryItem.findMany({ where: { archivedAt: null }, select: { id: true, name: true, url: true } });
    let best: (typeof items)[number] | null = null;
    let score = 0;
    for (const it of items) {
      const sc = nameScore(title, it.name);
      if (sc > score) { score = sc; best = it; }
    }
    const price = Math.round(amount / quantity);
    await prisma.$transaction(async (tx) => {
      const item =
        best && score >= 0.6
          ? await tx.inventoryItem.findUniqueOrThrow({ where: { id: best.id } })
          : await tx.inventoryItem.create({ data: { name: title, category: guessCategory(title), quantity: 0, url, supplierId: supplier.id, currentPrice: price } });
      await tx.purchase.create({ data: { itemId: item.id, date, quantity, price, supplierId: supplier.id, comment: url ? `${shop}: ${url}` : shop } });
      await tx.inventoryItem.update({
        where: { id: item.id },
        // нельзя посчитать (вата, вазелин) — после покупки «много»
        data: { quantity: item.quantity + quantity, ...(item.countable ? {} : { level: "PLENTY" as const }), lastPurchaseDate: date, lastPurchasePrice: price, currentPrice: price, url: item.url ?? url },
      });
    });
    revalidatePath("/inventory");
  } else {
    await prisma.expense.create({ data: { title, amount, date, category: "MATERIALS", comment: [shop, url].filter(Boolean).join(" · ") || null } });
  }
  revalidatePath("/expenses");
  revalidatePath("/inventory");
  redirect(`/inventory/ozon?ok=${encodeURIComponent(title)}`);
}

/**
 * Удалить покупку из «Трат» (ошибочная или пробная запись). Если позиция ещё на складе —
 * её остаток уменьшится на это количество, будто покупки не было.
 */
export async function deletePurchase(id: string) {
  await requireUser();
  const p = await prisma.purchase.findUnique({ where: { id }, include: { item: true } });
  if (!p) return;
  await prisma.$transaction(async (tx) => {
    await tx.purchase.delete({ where: { id } });
    if (!p.item.archivedAt) {
      await tx.inventoryItem.update({ where: { id: p.itemId }, data: { quantity: Math.max(0, p.item.quantity - p.quantity) } });
    }
  });
  revalidatePath("/expenses");
  revalidatePath("/inventory");
}
