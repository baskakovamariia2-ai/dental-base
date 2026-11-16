import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { isTracked, lineCost, loadProcedures, procedureCost } from "@/lib/consumables";
import { createProcedure, seedDefaultProcedures } from "@/actions/consumables";
import { Empty, PageHeader } from "@/components/ui";
import { IconChevron } from "@/components/icons";

export default async function ProceduresPage() {
  await requireUser();
  const procs = await loadProcedures();

  return (
    <div className="space-y-5">
      <PageHeader title="Себестоимость" subtitle="Сколько стоят расходники на одну процедуру. Цены берутся со склада и обновляются после каждой закупки." back="/inventory" />

      {procs.length === 0 ? (
        <div className="space-y-3">
          <Empty>Процедур пока нет</Empty>
          <form action={seedDefaultProcedures}>
            <button className="btn-secondary w-full">Создать стандартные: кариес, чистка, эндо, коронка</button>
          </form>
        </div>
      ) : (
        <div className="space-y-3">
          {procs.map((p) => {
            const c = procedureCost(p);
            const top = [...p.items]
              .map((l) => ({ name: l.name, cost: lineCost(l), tracked: isTracked(l), qty: l.qty }))
              .filter((l) => l.cost > 0)
              .sort((a, b) => b.cost - a.cost)
              .slice(0, 3);
            const missing = p.items.filter((l) => lineCost(l) === 0 && l.qty > 0).length;
            return (
              <Link key={p.id} href={`/procedures/${p.id}`} className="card card-pad block hover:bg-zinc-50">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-lg font-semibold">{p.name}</span>
                  <span className="text-xl font-semibold tabular-nums text-accent">≈ {money(c.total)}</span>
                </div>
                <div className="mt-1 text-sm text-ink-soft">{top.map((t) => `${t.name} ${money(Math.round(t.cost))}`).join(" · ")}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-ink-mute">
                  <span>
                    {p.items.length} позиций{missing ? ` · без цены: ${missing}` : ""}
                  </span>
                  <IconChevron className="h-4 w-4" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <form action={createProcedure} className="card card-pad flex gap-2">
        <input name="name" placeholder="Новая процедура" className="input flex-1" />
        <button className="btn-secondary">Добавить</button>
      </form>
      <p className="px-1 text-xs text-ink-mute">Анестезию и оптрагейт после приёма подтверждаете вы — в себестоимость приёма идёт то, что реально ушло. Остальное считается по средней цифре из процедуры.</p>
    </div>
  );
}
