import type { InventoryItem, Procedure, ProcedureItem } from "@prisma/client";
import { prisma } from "./db";
import { PROCEDURE_SEED } from "./procedure-seed";
import clinicInventory from "@/data/clinic-inventory.json";

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

async function fetchProcedures(): Promise<ProcedureFull[]> {
  return prisma.procedure.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { item: true } } },
  });
}

/**
 * Разовые правки уже созданных процедур (16.11.2026, со слов Маши):
 * в эндо ручных файлов уходит 5 (№10 + 4 из №15–40), композита — в два раза больше,
 * ВиоПаста — кальций между посещениями. Меняем, только если строку ещё не правили руками.
 */
async function applyProcedureFixes() {
  const FLAG = "procedureFix-2026-11-16";
  if (await prisma.setting.findUnique({ where: { key: FLAG } })) return;
  const endo = await prisma.procedure.findFirst({ where: { name: "Эндо" }, include: { items: true } });
  if (endo) {
    for (const l of endo.items) {
      if (l.name === "K-файлы MANI №15–40" && l.qty === 2) await prisma.procedureItem.update({ where: { id: l.id }, data: { qty: 4 } });
      if (l.name === "Композит Эстелайт" && l.qty === 1) await prisma.procedureItem.update({ where: { id: l.id }, data: { qty: 2 } });
      if (l.name === "ВиоПаста") await prisma.procedureItem.update({ where: { id: l.id }, data: { name: "ВиоПаста (кальций между посещениями)" } });
    }
  }
  await prisma.setting.upsert({ where: { key: FLAG }, create: { key: FLAG, value: "1" }, update: { value: "1" } });
}

export async function loadProcedures(): Promise<ProcedureFull[]> {
  await applyProcedureFixes();
  const procs = await fetchProcedures();
  return (await repairProcedureLines(procs)) ? fetchProcedures() : procs;
}

/**
 * Строки стандартных процедур без цены (позиция не нашлась на складе) или связанные
 * с позицией, убранной в архив: связываем с позицией склада из описи или ставим цену из описи.
 */
async function repairProcedureLines(procs: ProcedureFull[]): Promise<boolean> {
  const broken = procs.flatMap((p) => p.items).filter((l) => l.qty > 0 && (lineCost(l) === 0 || l.item?.archivedAt));
  if (broken.length === 0) return false;
  const nameToKey = new Map<string, string>();
  for (const p of PROCEDURE_SEED) for (const l of p.lines) nameToKey.set(l.name, l.key);
  const rows = clinicInventory as { key: string | null; name: string; price: number | null }[];
  const active = await prisma.inventoryItem.findMany({ where: { archivedAt: null }, select: { id: true, name: true } });
  const norm = (n: string) => n.trim().toLowerCase();
  let changed = false;
  for (const l of broken) {
    const key = nameToKey.get(l.name);
    const row = key ? rows.find((r) => r.key === key) : undefined;
    if (!row) continue;
    const found = active.find((i) => norm(i.name) === norm(row.name));
    const data: { itemId?: string | null; price?: number | null } = {};
    if (found && found.id !== l.itemId) data.itemId = found.id;
    else if (l.item?.archivedAt) data.itemId = null;
    if (l.price == null && row.price != null) data.price = row.price;
    if (Object.keys(data).length) {
      await prisma.procedureItem.update({ where: { id: l.id }, data });
      changed = true;
    }
  }
  return changed;
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
