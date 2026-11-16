import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtQty, money } from "@/lib/format";
import { isTracked, lineCost, loadProcedures, procedureCost, unitPrice } from "@/lib/consumables";
import { addProcedureItem, deleteProcedure, deleteProcedureItem, updateProcedure, updateProcedureItem } from "@/actions/consumables";
import { ConfirmButton } from "@/components/auto-submit";
import { PageHeader } from "@/components/ui";

export default async function ProcedurePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [procs, items] = await Promise.all([
    loadProcedures(),
    prisma.inventoryItem.findMany({ where: { archivedAt: null, category: { not: "INSTRUMENTS" } }, orderBy: { name: "asc" } }),
  ]);
  const p = procs.find((x) => x.id === id);
  if (!p) notFound();
  const c = procedureCost(p);

  return (
    <div className="space-y-5">
      <PageHeader title={p.name} subtitle={`Расходники ≈ ${money(c.total)} на одну процедуру`} back="/procedures" />

      <div className="card divide-y divide-zinc-100">
        {p.items.map((l) => {
          const price = unitPrice(l);
          return (
            <details key={l.id} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{l.name}</span>
                  <span className="block truncate text-xs text-ink-mute">
                    {isTracked(l) ? "подтверждаете после приёма · " : ""}
                    {fmtQty(l.qty)} шт. · 1 {l.item?.unit ?? "ед."} хватает на {fmtQty(l.perUnit)}
                    {price ? ` · ${money(price)} за ${l.item?.unit ?? "ед."}` : " · нет цены"}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money(Math.round(lineCost(l)))}</span>
              </summary>
              <form action={updateProcedureItem.bind(null, l.id)} className="grid grid-cols-3 gap-2 px-4 pb-3">
                <label className="block"><span className="label">Уходит</span><input name="qty" inputMode="decimal" defaultValue={fmtQty(l.qty)} className="input" /></label>
                <label className="block"><span className="label">Хватает на</span><input name="perUnit" inputMode="decimal" defaultValue={fmtQty(l.perUnit)} className="input" /></label>
                <label className="block"><span className="label">Цена, ₽</span><input name="price" inputMode="numeric" defaultValue={l.price ?? ""} placeholder={l.item ? "со склада" : ""} className="input" /></label>
                <button className="btn-primary btn-sm col-span-2 h-11">Сохранить</button>
                <button formAction={deleteProcedureItem.bind(null, l.id)} className="btn-ghost btn-sm h-11 text-rose-600">Убрать</button>
              </form>
              <p className="px-4 pb-3 text-xs text-ink-mute">«Хватает на» — на сколько процедур хватает одной единицы со склада. Например, шприца композита — на 24 пломбы, тогда «Уходит» = 1. Цена берётся со склада; своя цена нужна, только если на складе её нет.</p>
            </details>
          );
        })}
        <div className="flex items-center justify-between px-4 py-3 font-semibold">
          <span>Итого</span>
          <span className="tabular-nums text-accent">≈ {money(c.total)}</span>
        </div>
      </div>

      <form action={addProcedureItem.bind(null, id)} className="card card-pad grid grid-cols-3 gap-2">
        <div className="col-span-3 text-sm font-medium">Добавить расходник</div>
        <select name="itemId" defaultValue="" className="input col-span-3">
          <option value="">— со склада —</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input name="name" placeholder="или своё название" className="input col-span-3" />
        <label className="block"><span className="label">Уходит</span><input name="qty" inputMode="decimal" defaultValue="1" className="input" /></label>
        <label className="block"><span className="label">Хватает на</span><input name="perUnit" inputMode="decimal" defaultValue="1" className="input" /></label>
        <label className="block"><span className="label">Цена, ₽</span><input name="price" inputMode="numeric" placeholder="со склада" className="input" /></label>
        <button className="btn-secondary col-span-3">Добавить</button>
      </form>

      <form action={updateProcedure.bind(null, id)} className="card card-pad grid gap-2">
        <label className="block"><span className="label">Название</span><input name="name" defaultValue={p.name} className="input" /></label>
        <label className="block"><span className="label">Слова для автоподбора (через запятую)</span><input name="keywords" defaultValue={p.keywords ?? ""} className="input" /></label>
        <p className="text-xs text-ink-mute">Если в названии услуги в записи есть одно из этих слов, после приёма подставится эта процедура.</p>
        <button className="btn-secondary">Сохранить</button>
      </form>

      <form action={deleteProcedure.bind(null, id)}>
        <ConfirmButton message={`Удалить процедуру «${p.name}»?`}>Удалить процедуру</ConfirmButton>
      </form>
    </div>
  );
}
