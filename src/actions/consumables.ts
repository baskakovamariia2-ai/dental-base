"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num, optInt, optStr, safeReturn, str } from "@/lib/forms";
import { isTracked, lineCost, loadProcedures } from "@/lib/consumables";
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
  const procedureId = optStr(formData, "procedureId", 50);
  const procs = await loadProcedures();
  const proc = procs.find((p) => p.id === procedureId) ?? null;
  const tracked = await prisma.inventoryItem.findMany({ where: { trackPerVisit: true, archivedAt: null } });

  await prisma.$transaction(async (tx) => {
    // вернуть на склад то, что списали при прошлом подтверждении
    const prev = await tx.visitConsumable.findMany({ where: { visitId } });
    for (const c of prev) {
      if (c.itemId) await tx.inventoryItem.update({ where: { id: c.itemId }, data: { quantity: { increment: c.qty } } });
    }
    await tx.visitConsumable.deleteMany({ where: { visitId } });

    let total = 0;
    for (const it of tracked) {
      const qty = Math.max(0, Math.min(20, num(formData, `q_${it.id}`, 0)));
      if (!qty) continue;
      const price = it.currentPrice ?? it.lastPurchasePrice ?? 0;
      const cost = Math.round(qty * price);
      total += cost;
      await tx.visitConsumable.create({ data: { visitId, itemId: it.id, name: it.name, qty, cost } });
      const fresh = await tx.inventoryItem.findUniqueOrThrow({ where: { id: it.id } });
      await tx.inventoryItem.update({ where: { id: it.id }, data: { quantity: Math.max(0, fresh.quantity - qty) } });
    }
    if (proc) for (const l of proc.items) if (!isTracked(l)) total += lineCost(l);
    await tx.visit.update({
      where: { id: visitId },
      data: { procedureId: proc?.id ?? null, consumablesCost: Math.round(total), consumablesConfirmed: true },
    });
  });
  refresh();
  redirect(back);
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

/** Цена из описи — запасная, если строка не связана со складом */
function seedPrice(key: string): number | null {
  const r = (clinicInventory as SeedItem[]).find((x) => x.key === key);
  return r?.price ?? null;
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
          name: r.name.slice(0, 200),
          category: r.category as never,
          quantity: r.quantity,
          unit: r.unit,
          countable: r.countable,
          level: (r.level as never) ?? null,
          openLevel: (r.openLevel as never) ?? null,
          currentPrice: r.price,
          lastPurchasePrice: r.price,
          url: r.url,
          comment: r.comment,
          trackPerVisit: r.trackPerVisit,
          minQuantity: r.minQuantity,
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
