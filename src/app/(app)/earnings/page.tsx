import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { addMonths, parseISODate, startOfMonth, toISODate } from "@/lib/dates";
import { money } from "@/lib/format";
import { earningsByDay } from "@/lib/earnings";
import { getSettings } from "@/lib/settings";
import { saveDayExpense } from "@/actions/earnings";
import { saveSettings } from "@/actions/settings";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { IconBack, IconChevron } from "@/components/icons";

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireUser();
  const { month } = await searchParams;
  const m = startOfMonth(parseISODate(month ? `${month}-01` : null) ?? new Date());
  const next = addMonths(m, 1);
  const [rows, settings] = await Promise.all([earningsByDay(m, next), getSettings()]);

  const past = rows.filter((r) => !r.future);
  const future = rows.filter((r) => r.future);
  const revenue = past.reduce((s, r) => s + r.revenue, 0);
  const expenses = past.reduce((s, r) => s + r.rent + r.sterilization, 0);
  const futureExpenses = future.reduce((s, r) => s + r.rent + r.sterilization, 0);
  const monthKey = (d: Date) => toISODate(d).slice(0, 7);
  const title = m.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  const dayLabel = (d: string) => {
    const date = parseISODate(d)!;
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Заработок" subtitle="Выручка — из стоимости приёмов. Расходы — аренда и стерилизация за каждый рабочий день." back="/more" />

      <div className="flex items-center gap-2">
        <Link href={`/earnings?month=${monthKey(addMonths(m, -1))}`} className="btn-secondary h-11 w-11 px-0" aria-label="Предыдущий месяц"><IconBack /></Link>
        <div className="flex-1 text-center text-[17px] font-semibold capitalize">{title}</div>
        <Link href={`/earnings?month=${monthKey(next)}`} className="btn-secondary h-11 w-11 px-0" aria-label="Следующий месяц"><IconChevron /></Link>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Выручка" value={money(revenue)} />
        <Stat label="Аренда + стерилизация" value={money(expenses)} hint={`рабочих дней: ${past.length}`} />
        <Stat label="Чистыми" value={<span className={revenue - expenses < 0 ? "text-rose-600" : "text-emerald-700"}>{money(revenue - expenses)}</span>} />
        <Stat label="Предстоит расходов" value={money(futureExpenses)} hint={`запланировано дней: ${future.length}`} />
      </div>

      <section>
        <h2 className="section-title">По дням</h2>
        {rows.length === 0 ? (
          <Empty>В этом месяце нет приёмов и записей</Empty>
        ) : (
          <div className="card divide-y divide-zinc-100">
            {rows.map((r) => (
              <details key={r.date} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium capitalize">
                      {dayLabel(r.date)}
                      {r.future && <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-normal text-sky-700">предстоит</span>}
                    </span>
                    <span className="block text-xs text-ink-mute">
                      {r.future ? `записей: ${r.appointments}` : `приёмов: ${r.visits}`} · выручка {money(r.revenue)} · расходы {money(r.rent + r.sterilization)}
                      {r.overridden ? " (изменены)" : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-right font-semibold tabular-nums ${r.net < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {r.net > 0 ? "+" : ""}{money(r.net)}
                  </span>
                </summary>
                <form action={saveDayExpense.bind(null, r.date)} className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4 sm:items-end">
                  <label className="block"><span className="label">Аренда</span><input name="rent" inputMode="numeric" defaultValue={r.rent} className="input" /></label>
                  <label className="block"><span className="label">Стерилизация</span><input name="sterilization" inputMode="numeric" defaultValue={r.sterilization} className="input" /></label>
                  <button className="btn-primary btn-sm h-11">Сохранить</button>
                  {r.overridden && <button name="reset" value="1" className="btn-ghost btn-sm h-11">Как обычно</button>}
                </form>
              </details>
            ))}
          </div>
        )}
        <p className="mt-2 px-1 text-xs text-ink-mute">Нажмите на день, чтобы изменить аренду или стерилизацию именно в этот день.</p>
      </section>

      <section>
        <h2 className="section-title">Обычные расходы за рабочий день</h2>
        <form action={saveSettings} className="card card-pad grid grid-cols-2 gap-3 sm:grid-cols-3 sm:items-end">
          <input type="hidden" name="returnTo" value={`/earnings?month=${monthKey(m)}`} />
          <label className="block"><span className="label">Аренда (смена 6 ч), ₽</span><input name="rentPerDay" inputMode="numeric" defaultValue={settings.rentPerDay} className="input" /></label>
          <label className="block"><span className="label">Стерилизация, ₽</span><input name="sterilizationPerDay" inputMode="numeric" defaultValue={settings.sterilizationPerDay} className="input" /></label>
          <button className="btn-secondary col-span-2 sm:col-span-1">Сохранить</button>
        </form>
      </section>
    </div>
  );
}
