import { prisma } from "./db";

const KEY = "cleanup-manual-purchases-2026-11-24";

/**
 * Разовая уборка по просьбе Маши (24.11.2026):
 * — покупки, внесённые вручную 24 ноября через «Отметить как купленное» (цены из описи, а не из чека);
 * — пробная покупка зеркала Hello Kitty с Озона.
 * Остаток на складе уменьшаем обратно, цену пересчитываем по оставшимся покупкам.
 */
export async function cleanupManualPurchasesOnce() {
  // только в базе Маши — копию друга (база «friend») не трогаем
  if (/\/friend(\?|$)/.test(process.env.DATABASE_URL ?? "")) return;
  try {
    await prisma.setting.create({ data: { key: KEY, value: "running" } });
  } catch {
    return;
  }
  const from = new Date("2026-11-24T00:00:00+03:00");
  const to = new Date("2026-11-25T00:00:00+03:00");
  const list = await prisma.purchase.findMany({ include: { item: true } });
  const victims = list.filter((p) => {
    const manual = p.createdAt >= from && p.createdAt < to && !/^(Заказ|УПД|Озон|Wildberries)/.test(p.comment ?? "");
    const kitty = /hello\s*kitty|китти/i.test(p.item.name);
    return manual || kitty;
  });
  const names: string[] = [];
  let sum = 0;
  for (const p of victims) {
    await prisma.$transaction(async (tx) => {
      await tx.purchase.delete({ where: { id: p.id } });
      const item = await tx.inventoryItem.findUnique({ where: { id: p.itemId } });
      if (item && !item.archivedAt) {
        const last = await tx.purchase.findFirst({ where: { itemId: p.itemId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
        await tx.inventoryItem.update({
          where: { id: p.itemId },
          data: {
            quantity: Math.max(0, item.quantity - p.quantity),
            ...(last ? { currentPrice: last.price, lastPurchasePrice: last.price, lastPurchaseDate: last.date } : {}),
          },
        });
      }
    });
    names.push(p.item.name);
    sum += Math.round(p.quantity * p.price);
  }
  await prisma.setting.update({ where: { key: KEY }, data: { value: JSON.stringify({ at: new Date().toISOString(), count: victims.length, sum, names }) } });
}

/** Итог уборки — показываем в «Тратах» неделю */
export async function cleanupReport(): Promise<{ count: number; sum: number; names: string[] } | null> {
  const s = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!s || s.value === "running") return null;
  try {
    const v = JSON.parse(s.value) as { at: string; count: number; sum: number; names: string[] };
    return Date.now() - new Date(v.at).getTime() < 7 * 86400000 && v.count > 0 ? v : null;
  } catch {
    return null;
  }
}
