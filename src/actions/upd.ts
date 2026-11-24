"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { guessCategory } from "@/lib/inventory-category";
import { aveldentSearch, docKey, findImported, sellerName } from "@/lib/upd";

type ImportRow = { n: number; name: string; unit: string; qty: number; price: number; target: string; addQty: boolean }; // target: id позиции | "new" | "skip"
type ImportPayload = { kind?: "upd" | "order"; number: string | null; order?: string | null; date: string | null; seller: string | null; total: number | null; rows: ImportRow[] };

/** Записать УПД: покупки (для «Трат»), остатки на складе, новые позиции со ссылкой на поиск */
export async function importUpd(json: string): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  let p: ImportPayload;
  try {
    p = JSON.parse(json);
  } catch {
    return { ok: false, message: "Ошибка данных" };
  }
  const kind = p.kind === "order" ? "order" : "upd";
  const number = (docKey({ kind, number: p.number }) ?? "").slice(0, 50);
  const order = (p.order ?? "").slice(0, 50) || null;
  const seller = (p.seller ?? "").slice(0, 200);
  const prev = await findImported({ kind, number: p.number, order });
  if (prev) {
    return { ok: false, message: `Этот документ (или заказ № ${order ?? p.number}) уже загружен раньше — повторно не записываю, чтобы траты не задвоились.` };
  }
  const date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? new Date(`${p.date}T12:00:00`) : new Date();
  const sName = sellerName(p.seller);
  const supplier = await prisma.supplier.upsert({ where: { name: sName }, create: { name: sName, url: sName === "Авельдент" ? "https://aveldent.ru" : null }, update: {} });
  const rows = (p.rows ?? []).filter((r) => r.target !== "skip" && r.qty > 0 && r.name);
  let added = 0;
  let created = 0;
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      const price = Math.round(r.price || 0);
      let itemId = r.target;
      if (r.target === "new") {
        const item = await tx.inventoryItem.create({
          data: {
            name: r.name.slice(0, 200),
            unit: /упак/i.test(r.unit) ? "упак." : "шт.",
            category: guessCategory(r.name),
            quantity: 0,
            currentPrice: price,
            supplierId: supplier.id,
            url: sName === "Авельдент" ? aveldentSearch(r.name) : null,
          },
        });
        itemId = item.id;
        created++;
      }
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item) continue;
      await tx.purchase.create({ data: { itemId, date, quantity: r.qty, price, supplierId: supplier.id, comment: p.number ? (kind === "order" ? `Заказ № ${p.number}` : `УПД № ${p.number}`) : "Документ" } });
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: {
          ...(r.addQty || r.target === "new" ? { quantity: item.quantity + r.qty, ...(item.countable ? {} : { level: "PLENTY" as const }) } : {}),
          lastPurchaseDate: !item.lastPurchaseDate || item.lastPurchaseDate < date ? date : item.lastPurchaseDate,
          // цену «сейчас» меняем, только если этот документ не старее последней покупки
          ...(!item.lastPurchaseDate || item.lastPurchaseDate <= date ? { lastPurchasePrice: price, currentPrice: price } : {}),
          supplierId: item.supplierId ?? supplier.id,
          // у товара не было ссылки — ставим ссылку на поиск этого товара на Авельденте
          ...(!item.url && sName === "Авельдент" ? { url: aveldentSearch(r.name) } : {}),
        },
      });
      added++;
    }
    if (number) {
      await tx.updImport.create({ data: { number, seller, date, total: Math.round(p.total ?? 0), rows: added, orderNumber: order } });
    }
  });
  revalidatePath("/inventory");
  revalidatePath("/expenses");
  return { ok: true, message: `Записано позиций: ${added}${created ? `, новых на складе: ${created}` : ""}. Покупки — в «Тратах».` };
}
