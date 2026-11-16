import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseISODate, startOfDay, toISODate } from "@/lib/dates";
import { fmtDateLong, fmtQty, fmtTime, fullName, money } from "@/lib/format";
import { defaultTrackedQty, isTracked, lineCost, loadProcedures, matchProcedure, unconfirmedVisitsOn } from "@/lib/consumables";
import { confirmDayConsumables } from "@/actions/consumables";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** После «Завершить смену»: сколько анестезий и оптрагейтов ушло на каждого пациента */
export default async function DayConsumablesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const day = parseISODate(sp.date) ?? startOfDay(new Date());
  const iso = toISODate(day);
  const dayUrl = `/schedule?view=day&date=${iso}`;
  const [visits, procs, tracked] = await Promise.all([
    unconfirmedVisitsOn(day),
    loadProcedures(),
    prisma.inventoryItem.findMany({ where: { trackPerVisit: true, archivedAt: null }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Расходники за день" subtitle={fmtDateLong(day)} back={dayUrl} />

      {visits.length === 0 || tracked.length === 0 ? (
        <div className="card card-pad space-y-3 text-center">
          <p className="text-emerald-700">{visits.length === 0 ? "Расходники за этот день подтверждены ✓" : "На складе не отмечено, о чём спрашивать после приёма."}</p>
          <Link href={dayUrl} className="btn-secondary">К расписанию</Link>
        </div>
      ) : (
        <form action={confirmDayConsumables.bind(null, iso)} className="space-y-4">
          <input type="hidden" name="visitIds" value={visits.map((v) => v.id).join(",")} />
          <p className="px-1 text-sm text-ink-soft">Отметьте, сколько использовали у каждого пациента. Подставлено обычное для процедуры — поправьте, если было иначе.</p>

          {visits.map((v) => {
            const proc = procs.find((p) => p.id === v.procedureId) ?? (() => {
              const m = matchProcedure(procs, v.reason);
              return m ? procs.find((p) => p.id === m.id) ?? null : null;
            })();
            const def = defaultTrackedQty(proc);
            const materials = proc ? proc.items.filter((l) => !isTracked(l)).reduce((s, l) => s + lineCost(l), 0) : 0;
            return (
              <section key={v.id} className="card card-pad space-y-4">
                <input type="hidden" name={`p_${v.id}`} value={proc?.id ?? ""} />
                <div>
                  <div className="text-[16px] font-semibold">{fmtTime(v.date)} · {fullName(v.patient)}</div>
                  <div className="text-sm text-ink-soft">
                    {v.reason ?? "Приём"}{proc ? ` · считаем как «${proc.name}»` : ""}{materials ? ` · остальное ≈ ${money(Math.round(materials))}` : ""}
                  </div>
                </div>
                {tracked.map((it) => {
                  const d = def[it.id] ?? 0;
                  const options = [0, 1, 2, 3, 4];
                  if (d > 4) options.push(d);
                  return (
                    <fieldset key={it.id} className="space-y-1.5">
                      <legend className="flex w-full items-baseline justify-between gap-2">
                        <span className="text-[15px] font-medium">{it.name}</span>
                        <span className="text-xs text-ink-mute">на складе {fmtQty(it.quantity)}</span>
                      </legend>
                      <div className="flex gap-1.5">
                        {options.map((n) => (
                          <label key={n} className="flex-1">
                            <input type="radio" name={`q_${v.id}_${it.id}`} value={n} defaultChecked={n === d} className="peer sr-only" />
                            <span className="flex h-11 cursor-pointer items-center justify-center rounded-xl bg-zinc-100 text-[16px] font-semibold peer-checked:bg-accent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{n}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </section>
            );
          })}

          <button className="btn-primary w-full py-3 text-[16px]">✓ Подтвердить и списать со склада</button>
          <Link href={dayUrl} className="block text-center text-sm text-ink-mute underline">Позже — напомнит в «Заработке»</Link>
        </form>
      )}
    </div>
  );
}
