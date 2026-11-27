import { prisma } from "@/lib/db";
import { checkExportKey } from "@/lib/export-key";
import { INVENTORY_CATEGORY_ALL, STOCK_LEVEL, findOpt } from "@/lib/labels";
import { isLowItem, isTracked, lineCost, loadProcedures, procedureCost, unitPrice } from "@/lib/consumables";

export const dynamic = "force-dynamic";

// Данные для Google Таблицы: =IMPORTDATA("…/api/export/inventory?key=…"; ","; "en_US")
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const url = new URL(req.url);
  if (!(await checkExportKey(url.searchParams.get("key")))) return new Response("Forbidden", { status: 403 });
  const { kind } = await params;

  let rows: (string | number | null)[][] = [];
  if (kind === "inventory") {
    const items = await prisma.inventoryItem.findMany({ where: { archivedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] });
    const level = (v: string | null) => (v ? findOpt(STOCK_LEVEL, v as "ENOUGH").label.toLowerCase() : "");
    rows.push(["Раздел", "Группа", "Наименование", "Кол-во", "Ед.", "Открытая упаковка", "Считаем после приёма", "Цена за ед., ₽", "Пора заказать", "Ссылка", "Комментарий"]);
    for (const i of items) {
      rows.push([
        i.category === "INSTRUMENTS" ? "Инструменты" : "Расходники",
        findOpt(INVENTORY_CATEGORY_ALL, i.category).label,
        i.name,
        i.countable ? i.quantity : level(i.level),
        i.countable ? i.unit : "",
        i.countable && !i.trackPerVisit ? level(i.openLevel) : "",
        i.trackPerVisit ? "да" : "",
        i.currentPrice ?? i.lastPurchasePrice ?? "",
        isLowItem(i) ? "мало" : "",
        i.url ?? "",
        i.comment ?? "",
      ]);
    }
  } else if (kind === "procedures") {
    const procs = await loadProcedures();
    rows.push(["Процедура", "Расходник", "Уходит", "Хватает на (из 1 ед.)", "Цена за ед., ₽", "Стоимость, ₽", "Подтверждаем после приёма"]);
    for (const p of procs) {
      for (const l of p.items) {
        rows.push([p.name, l.name, l.qty, l.perUnit, unitPrice(l) ?? "", Math.round(lineCost(l) * 100) / 100, isTracked(l) ? "да" : ""]);
      }
      rows.push([p.name, "ИТОГО", "", "", "", procedureCost(p).total, ""]);
      rows.push(["", "", "", "", "", "", ""]);
    }
  } else if (kind === "visits") {
    const from = new Date();
    from.setMonth(from.getMonth() - 3);
    const visits = await prisma.visit.findMany({
      where: { date: { gte: from }, OR: [{ source: null }, { source: { not: "plan" } }] },
      include: { patient: { select: { lastName: true, firstName: true } }, procedureTpl: true, consumables: true },
      orderBy: { date: "desc" },
    });
    rows.push(["Дата", "Пациент", "Процедура", "Цена приёма, ₽", "Расходники, ₽", "Подтверждено", "Что подтвердили"]);
    for (const v of visits) {
      rows.push([
        v.date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Moscow" }).replace(" г.", ""),
        `${v.patient.lastName} ${v.patient.firstName}`,
        v.procedureTpl?.name ?? v.reason ?? "",
        v.cost,
        v.consumablesCost ?? "",
        v.consumablesConfirmed ? "да" : v.procedureId ? "нет" : "",
        v.consumables.map((c) => `${c.name} × ${c.qty}`).join("; "),
      ]);
    }
  } else {
    return new Response("Not found", { status: 404 });
  }

  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
