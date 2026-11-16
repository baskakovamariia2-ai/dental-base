"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num, optInt, optStr, safeReturn, str } from "@/lib/forms";
import { applyVisitConsumables, isTracked, lineCost, loadProcedures, unconfirmedVisitsOn } from "@/lib/consumables";
import { parseISODate } from "@/lib/dates";
import { PROCEDURE_SEED } from "@/lib/procedure-seed";
import clinicInventory from "@/data/clinic-inventory.json";
import { resetExportKeyValue } from "@/lib/export-key";

function refresh() {
  revalidatePath("/", "layout");
}

/** После приёма: подтвердить анестезию / оптрагейт, списать их со склада и посчитать себестоимость */
export async function confirmConsumables(visitId: string, formData: FormData) {
  await requireUser();
  const back = safeReturn(formData, `/visits/${visitId}`);
  const tracked = await prisma.inventoryItem.findMany({ where: { trackPerVisit: true, archivedAt: null }, select: { id: true } });
  const qty: Record<string, number> = {};
  for (const it of tracked) qty[it.id] = num(formData, `q_${it.id}`, 0);
  await applyVisitConsumables(visitId, qty, optStr(formData, "procedureId", 50));
  refresh();
  redirect(back);
}

/** Конец дня: подтвердить анестезию и оптрагейты сразу по всем приёмам дня */
export async function confirmDayConsumables(date: string, formData: FormData) {
  await requireUser();
  const day = parseISODate(date);
  if (!day) redirect("/schedule");
  const visits = await unconfirmedVisitsOn(day!);
  const ids = new Set(String(formData.get("visitIds") ?? "").split(",").filter(Boolean));
  const tracked = await prisma.inventoryItem.findMany({ where: { trackPerVisit: true, archivedAt: null }, select: { id: true } });
  for (const v of visits) {
    if (!ids.has(v.id)) continue;
    const qty: Record<string, number> = {};
    for (const it of tracked) qty[it.id] = num(formData, `q_${v.id}_${it.id}`, 0);
    await applyVisitConsumables(v.id, qty, optStr(formData, `p_${v.id}`, 50) ?? v.procedureId);
  }
  refresh();
  redirect(`/schedule?view=day&date=${date}`);
}

// ───────────── Процедуры ─────────────

export async function createProcedure(formData: FormData) {
  await requireUser();
  const name = str(formData, "name", 100);
  if (!name) redirect("/procedures");
  const max = await prisma.procedure.aggregate({ _max: { sortOrder: true } });
  const p = await prisma.procedure.create({ data: { name, keywords: optStr(formData, "keywords", 300), sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  refresh();
  redirect(`/procedures/${p.id}`);
}

export async function updateProcedure(id: string, formData: FormData) {
  await requireUser();
  const name = str(formData, "name", 100);
  if (name) await prisma.procedure.update({ where: { id }, data: { name, keywords: optStr(formData, "keywords", 300) } });
  refresh();
}

export async function deleteProcedure(id: string) {
  await requireUser();
  await prisma.procedure.delete({ where: { id } });
  refresh();
  redirect("/procedures");
}

function readLine(fd: FormData) {
  return {
    qty: Math.max(0, num(fd, "qty", 1)),
    perUnit: Math.max(0.001, num(fd, "perUnit", 1)),
    price: optInt(fd, "price"),
  };
}

export async function addProcedureItem(procedureId: string, formData: FormData) {
  await requireUser();
  const itemId = optStr(formData, "itemId", 50);
  const item = itemId ? await prisma.inventoryItem.findUnique({ where: { id: itemId } }) : null;
  const name = str(formData, "name", 200) || item?.name || "";
  if (!name) redirect(`/procedures/${procedureId}`);
  const max = await prisma.procedureItem.aggregate({ where: { procedureId }, _max: { sortOrder: true } });
  await prisma.procedureItem.create({
    data: { procedureId, itemId: item?.id ?? null, name, ...readLine(formData), sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  refresh();
  redirect(`/procedures/${procedureId}`);
}

export async function updateProcedureItem(lineId: string, formData: FormData) {
  await requireUser();
  const line = await prisma.procedureItem.update({ where: { id: lineId }, data: readLine(formData) });
  refresh();
  redirect(`/procedures/${line.procedureId}`);
}

export async function deleteProcedureItem(lineId: string) {
  await requireUser();
  const line = await prisma.procedureItem.delete({ where: { id: lineId } });
  refresh();
  redirect(`/procedures/${line.procedureId}`);
}

type SeedItem = {
  key: string | null;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  countable: boolean;
  level: string | null;
  openLevel: string | null;
  price: number | null;
  url: string | null;
  comment: string | null;
  trackPerVisit: boolean;
  minQuantity: number;
};

const asText = (v: unknown) => (v == null || v === "" ? null : String(v));
const asPrice = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

/** Цена из описи — запасная, если строка не связана со складом */
function seedPrice(key: string): number | null {
  const r = (clinicInventory as SeedItem[]).find((x) => x.key === key);
  return asPrice(r?.price);
}

async function seedProcedures(keyToId: Map<string, string>) {
  for (const [i, p] of PROCEDURE_SEED.entries()) {
    await prisma.procedure.create({
      data: {
        name: p.name,
        keywords: p.keywords,
        sortOrder: i + 1,
        items: {
          create: p.lines.map((l, j) => ({
            name: l.name,
            itemId: keyToId.get(l.key) ?? null,
            qty: l.qty,
            perUnit: l.perUnit,
            price: l.price ?? seedPrice(l.key),
            sortOrder: j + 1,
          })),
        },
      },
    });
  }
}

/** Добавить из описи клиники (13–16.11.2026) позиции, которых ещё нет. Существующие не трогаем — правки пользователя сохраняются */
export async function loadClinicInventory() {
  await requireUser();
  const rows = clinicInventory as SeedItem[];
  const existing = await prisma.inventoryItem.findMany({ where: { archivedAt: null } });
  const norm = (n: string) => n.trim().toLowerCase();
  const byName = new Map(existing.map((i) => [norm(i.name), i.id]));
  const keyToId = new Map<string, string>();
  for (const r of rows) {
    let id = byName.get(norm(r.name.slice(0, 200)));
    if (!id) {
      const created = await prisma.inventoryItem.create({
        data: {
          name: String(r.name).slice(0, 200),
          category: r.category as never,
          quantity: Number(r.quantity) || 0,
          unit: String(r.unit ?? "шт."),
          countable: r.countable !== false,
          level: (r.level as never) ?? null,
          openLevel: (r.openLevel as never) ?? null,
          currentPrice: asPrice(r.price),
          lastPurchasePrice: asPrice(r.price),
          url: asText(r.url),
          comment: asText(r.comment),
          trackPerVisit: r.trackPerVisit === true,
          minQuantity: Number(r.minQuantity) || 0,
        },
      });
      id = created.id;
    }
    if (r.key) keyToId.set(r.key, id);
  }
  if ((await prisma.procedure.count()) === 0) await seedProcedures(keyToId);
  else await relinkProcedureLines(keyToId);
  refresh();
  redirect("/inventory");
}

/** Строкам процедур, потерявшим связь со складом, вернуть связь по названию из описи */
async function relinkProcedureLines(keyToId: Map<string, string>) {
  const lines = await prisma.procedureItem.findMany({ where: { itemId: null } });
  const nameToKey = new Map<string, string>();
  for (const p of PROCEDURE_SEED) for (const l of p.lines) nameToKey.set(l.name, l.key);
  for (const line of lines) {
    const key = nameToKey.get(line.name);
    const id = key ? keyToId.get(key) : undefined;
    if (id) await prisma.procedureItem.update({ where: { id: line.id }, data: { itemId: id } });
  }
}

/** Создать стандартные процедуры, если их ещё нет (позиции ищутся на складе по названию) */
export async function seedDefaultProcedures() {
  await requireUser();
  if ((await prisma.procedure.count()) === 0) {
    const rows = clinicInventory as SeedItem[];
    const items = await prisma.inventoryItem.findMany({ where: { archivedAt: null } });
    const keyToId = new Map<string, string>();
    for (const r of rows) {
      if (!r.key) continue;
      const found = items.find((i) => i.name === r.name);
      if (found) keyToId.set(r.key, found.id);
    }
    await seedProcedures(keyToId);
  }
  refresh();
  redirect("/procedures");
}

/** Сменить ключ ссылок для Google Таблицы (старые формулы перестанут работать) */
export async function resetExportKey() {
  await requireUser();
  await resetExportKeyValue();
  refresh();
}
