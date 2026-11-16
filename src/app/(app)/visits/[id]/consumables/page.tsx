import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtQty, fullName, money } from "@/lib/format";
import { toISODate } from "@/lib/dates";
import { isTracked, lineCost, loadProcedures, matchProcedure } from "@/lib/consumables";
import { confirmConsumables } from "@/actions/consumables";
import { PageHeader } from "@/components/ui";

export default async function VisitConsumablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string; proc?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const visit = await prisma.visit.findUnique({ where: { id }, include: { patient: true, consumables: true } });
  if (!visit) notFound();
  const back = sp.back && sp.back.startsWith("/") && !sp.back.startsWith("//") ? sp.back : `/schedule?view=day&date=${toISODate(visit.date)}`;

  const [procs, tracked] = await Promise.all([
    loadProcedures(),
    prisma.inventoryItem.findMany({ where: { trackPerVisit: true, archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const proc =
    procs.find((p) => p.id === sp.proc) ??
    procs.find((p) => p.id === visit.procedureId) ??
    (matchProcedure(procs, visit.reason) ? procs.find((p) => p.id === matchProcedure(procs, visit.reason)!.id) : undefined) ??
    null;

  // что подставить: прошлое подтверждение этого приёма, иначе — обычное для процедуры
  const prev = new Map(visit.consumables.filter((c) => c.itemId).map((c) => [c.itemId!, c.qty]));
  const fromProc = new Map<string, number>();
  if (proc) for (const l of proc.items) if (l.itemId && isTracked(l)) fromProc.set(l.itemId, (fromProc.get(l.itemId) ?? 0) + l.qty);
  const useProcDefaults = !visit.consumablesConfirmed || (sp.proc && sp.proc !== visit.procedureId);
  const def = (itemId: string) => (useProcDefaults ? fromProc.get(itemId) ?? 0 : prev.get(itemId) ?? 0);

  const materials = proc ? proc.items.filter((l) => !isTracked(l)).reduce((s, l) => s + lineCost(l), 0) : 0;
  const hrefProc = (pid: string) => `/visits/${id}/consumables?${new URLSearchParams({ proc: pid, back })}`;

  return (
    <div className="space-y-5">
      <PageHeader title="Расходники приёма" subtitle={`${fullName(visit.patient)} · ${fmtDate(visit.date)}${visit.reason ? ` · ${visit.reason}` : ""}`} back={back} />

      <section>
        <h2 className="section-title">Процедура</h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {procs.map((p) => (
            <Link key={p.id} href={hrefProc(p.id)} className={proc?.id === p.id ? "chip-active" : "chip"}>{p.name}</Link>
          ))}
          {procs.length === 0 && <Link href="/procedures" className="chip">Создать процедуры</Link>}
        </div>
      </section>

      <form action={confirmConsumables.bind(null, id)} className="space-y-5">
        <input type="hidden" name="returnTo" value={back} />
        <input type="hidden" name="procedureId" value={proc?.id ?? ""} />

        <div className="card card-pad space-y-5 ring-2 ring-accent">
          <div className="text-[17px] font-semibold">Подтвердите, что использовали</div>
          {tracked.length === 0 && <p className="text-sm text-ink-mute">На складе не отмечено, о чём спрашивать после приёма. Откройте позицию на складе → «Изменить» → «Спрашивать после каждого приёма».</p>}
          {tracked.map((it) => {
            const d = def(it.id);
            const options = [0, 1, 2, 3, 4];
            if (d > 4) options.push(d);
            return (
              <fieldset key={it.id} className="space-y-2">
                <legend className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold">{it.name}</span>
                  <span className={`text-xs ${it.quantity <= it.minQuantity ? "text-amber-700" : "text-ink-mute"}`}>осталось {fmtQty(it.quantity)} {it.unit}</span>
                </legend>
                <div className="flex gap-1.5">
                  {options.map((n) => (
                    <label key={n} className="flex-1">
                      <input type="radio" name={`q_${it.id}`} value={n} defaultChecked={n === d} className="peer sr-only" />
                      <span className="flex h-12 cursor-pointer items-center justify-center rounded-xl bg-zinc-100 text-[17px] font-semibold peer-checked:bg-accent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{n}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="card card-pad space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-ink-soft">Остальные материалы{proc ? ` (${proc.name.toLowerCase()})` : ""}</span><span className="font-medium tabular-nums">{money(Math.round(materials))}</span></div>
          <p className="text-xs text-ink-mute">Композит, адгезив, коффердам и прочее со склада не списываются — в себестоимость они идут по средней цифре процедуры. Анестезия и оптрагейт — по тому, что вы отметили выше.</p>
          <div className="flex justify-between pt-2"><span className="text-ink-soft">Цена приёма</span><span className="font-medium tabular-nums">{money(visit.cost)}</span></div>
          {visit.consumablesConfirmed && visit.consumablesCost !== null && (
            <div className="flex justify-between"><span className="text-ink-soft">Сохранённая себестоимость</span><span className="font-medium tabular-nums">{money(visit.consumablesCost)}</span></div>
          )}
        </div>

        <button className="btn-accent w-full">{visit.consumablesConfirmed ? "Сохранить изменения" : "Подтвердить и списать"}</button>
      </form>
    </div>
  );
}
