"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num, optInt, optStr, safeReturn, str } from "@/lib/forms";
import { isTracked, lineCost, loadProcedures } from "@/lib/consumables";
import { PROCEDURE_SEED } from "@/lib/procedure-seed";
import clinicInventory from "@/data/clinic-inventory.json";

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
            price: l.price ?? null,
            sortOrder: j + 1,
          })),
        },
      },
    });
  }
}

/** Загрузить опись клиники из таблицы (13–16.11.2026): текущий склад уходит в архив, процедуры создаются заново */
export async function loadClinicInventory() {
  await requireUser();
  const rows = clinicInventory as SeedItem[];
  await prisma.inventoryItem.updateMany({ where: { archivedAt: null }, data: { archivedAt: new Date(), toBuyQuantity: null } });
  const keyToId = new Map<string, string>();
  for (const r of rows) {
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
    if (r.key) keyToId.set(r.key, created.id);
  }
  await prisma.procedure.deleteMany({});
  await seedProcedures(keyToId);
  refresh();
  redirect("/inventory");
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
