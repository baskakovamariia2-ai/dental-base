import type { InventoryItem, Procedure, ProcedureItem } from "@prisma/client";
import { prisma } from "./db";

export type LineWithItem = ProcedureItem & { item: InventoryItem | null };
export type ProcedureFull = Procedure & { items: LineWithItem[] };

/** Цена одной единицы склада (шприц, пачка, шт.) */
export function unitPrice(line: { price: number | null; item: InventoryItem | null }): number | null {
  const p = line.item?.currentPrice ?? line.item?.lastPurchasePrice ?? line.price;
  return p ?? null;
}

/** Стоимость строки процедуры при заданном количестве */
export function lineCost(line: LineWithItem, qty = line.qty): number {
  const p = unitPrice(line);
  if (!p || !line.perUnit) return 0;
  return (qty * p) / line.perUnit;
}

export function isTracked(line: LineWithItem) {
  return !!line.item?.trackPerVisit && !line.item.archivedAt;
}

/**
 * Себестоимость процедуры. overrides — сколько фактически ушло позиций,
 * которые подтверждают после приёма (itemId → количество).
 */
export function procedureCost(p: ProcedureFull, overrides?: Map<string, number>) {
  let tracked = 0;
  let materials = 0;
  for (const l of p.items) {
    if (isTracked(l)) {
      const q = overrides && l.itemId && overrides.has(l.itemId) ? overrides.get(l.itemId)! : l.qty;
      tracked += lineCost(l, q);
    } else materials += lineCost(l);
  }
  // подтверждённые позиции, которых нет в шаблоне процедуры (например, Small вместо Regular)
  return { tracked, materials, total: Math.round(tracked + materials) };
}

export async function loadProcedures(): Promise<ProcedureFull[]> {
  return prisma.procedure.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { item: true } } },
  });
}

/** Подобрать процедуру по названию услуги в записи */
export function matchProcedure(procs: Procedure[], text: string | null | undefined): Procedure | null {
  const t = (text ?? "").toLowerCase();
  if (!t) return null;
  for (const p of procs) {
    const words = [p.name, ...(p.keywords ?? "").split(",")].map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (words.some((w) => t.includes(w))) return p;
  }
  return null;
}

/** Позиции, о которых спрашиваем после каждого приёма */
export async function trackedItems() {
  return prisma.inventoryItem.findMany({ where: { trackPerVisit: true, archivedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

/** Сколько приёмов хватит позиции, если на приём уходит perVisit */
export function visitsLeft(quantity: number, perVisit: number) {
  if (!perVisit) return null;
  return Math.floor(quantity / perVisit);
}

/** При завершении приёма: подобрать процедуру и записать себестоимость «по умолчанию» (ещё не подтверждена) */
export async function attachDefaultConsumables(visitId: string, procedureText: string) {
  const procs = await loadProcedures();
  const p = matchProcedure(procs, procedureText) as ProcedureFull | null;
  if (!p) return;
  await prisma.visit.update({
    where: { id: visitId },
    data: { procedureId: p.id, consumablesCost: procedureCost(p).total, consumablesConfirmed: false },
  });
}

type StockLike = { category: string; countable: boolean; quantity: number; minQuantity: number; level: string | null; openLevel: string | null; trackPerVisit: boolean };

/** Пора заказывать? Инструменты не напоминают. */
export function isLowItem(i: StockLike) {
  if (i.category === "INSTRUMENTS") return false;
  if (!i.countable) return i.level === "LOW" || i.level === "OUT";
  if (i.trackPerVisit) return i.quantity <= i.minQuantity;
  if (i.openLevel) return i.quantity <= i.minQuantity && (i.openLevel === "LOW" || i.openLevel === "OUT");
  return i.quantity <= i.minQuantity;
}

/** Ссылка обратно в список склада — сразу к нужной строке */
export function inventoryRowHref(item: { id: string; category: string }) {
  return `/inventory${item.category === "INSTRUMENTS" ? "?tab=tools" : ""}#item-${item.id}`;
}
