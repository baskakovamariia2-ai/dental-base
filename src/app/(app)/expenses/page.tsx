import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addMonths, parseISODate, startOfMonth, toISODate } from "@/lib/dates";
import { fmtDate, money } from "@/lib/format";
import { EXPENSE_CATEGORY, expenseCategoryLabel } from "@/lib/expenses";
import { addExpense, deleteExpense } from "@/actions/expenses";
import { ConfirmButton } from "@/components/auto-submit";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { IconBack, IconChevron } from "@/components/icons";

export const dynamic = "force-dynamic";

type Row = { key: string; date: Date; title: string; amount: number; category: string; note: string | null; expenseId: string | null; href: string | null };

/** Траты по месяцам: покупки на склад + всё, что купили помимо склада. Чтобы видеть, сколько вложено. */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireUser();
  const { month } = await searchParams;
  const m = startOfMonth(parseISODate(month ? `${month}-01` : null) ?? new Date());
  const next = addMonths(m, 1);
  const yearStart = new Date(m.getFullYear(), 0, 1);

  const [expenses, purchases, allExp, allPur, yearExp, yearPur] = await Promise.all([
    prisma.expense.findMany({ where: { date: { gte: m, lt: next } }, orderBy: { date: "desc" } }),
    prisma.purchase.findMany({ where: { date: { gte: m, lt: next } }, include: { item: true, supplier: true }, orderBy: { date: "desc" } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.purchase.findMany({ select: { quantity: true, price: true } }),
    prisma.expense.aggregate({ where: { date: { gte: yearStart, lt: new Date(m.getFullYear() + 1, 0, 1) } }, _sum: { amount: true } }),
    prisma.purchase.findMany({ where: { date: { gte: yearStart, lt: new Date(m.getFullYear() + 1, 0, 1) } }, select: { quantity: true, price: true } }),
  ]);
  const purSum = (list: { quantity: number; price: number }[]) => list.reduce((s, p) => s + Math.round(p.quantity * p.price), 0);

  const rows: Row[] = [
    ...expenses.map((e) => ({ key: e.id, date: e.date, title: e.title, amount: e.amount, category: e.category, note: e.comment, expenseId: e.id, href: null })),
    ...purchases.map((p) => ({
      key: p.id,
      date: p.date,
      title: p.item.name,
      amount: Math.round(p.quantity * p.price),
      category: "STOCK",
      note: [`${p.quantity} ${p.item.unit ?? "шт"} × ${money(p.price)}`, p.supplier?.name].filter(Boolean).join(" · "),
      expenseId: null,
      href: `/inventory/${p.itemId}`,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);
  const catLabel = (c: string) => (c === "STOCK" ? "Покупки на склад" : expenseCategoryLabel(c));
  const yearTotal = (yearExp._sum.amount ?? 0) + purSum(yearPur);
  const allTotal = (allExp._sum.amount ?? 0) + purSum(allPur);
  const monthKey = (d: Date) => toISODate(d).slice(0, 7);
  const title = m.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const today = toISODate(new Date());

  return (
    <div className="space-y-5">
      <PageHeader title="Траты" subtitle="Всё, что купили для кабинета: покупки на склад подтягиваются сами, остальное добавляйте ниже." back="/more" />

      <div className="flex items-center gap-2">
        <Link href={`/expenses?month=${monthKey(addMonths(m, -1))}`} className="btn-secondary h-11 w-11 px-0" aria-label="Предыдущий месяц"><IconBack /></Link>
        <div className="flex-1 text-center text-[17px] font-semibold capitalize">{title}</div>
        <Link href={`/expenses?month=${monthKey(next)}`} className="btn-secondary h-11 w-11 px-0" aria-label="Следующий месяц"><IconChevron /></Link>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="За месяц" value={money(total)} />
        <Stat label={`За ${m.getFullYear()} год`} value={money(yearTotal)} />
        <Stat label="Вложено всего" value={money(allTotal)} />
      </div>

      {byCat.size > 0 && (
        <div className="card divide-y divide-zinc-100">
          {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
            <div key={c} className="flex justify-between px-4 py-2.5 text-[15px]">
              <span className="text-ink-soft">{catLabel(c)}</span>
              <span className="font-semibold tabular-nums">{money(v)}</span>
            </div>
          ))}
        </div>
      )}

      <details className="card" open={rows.length === 0}>
        <summary className="cursor-pointer list-none px-4 py-3.5 text-[15px] font-medium">+ Добавить трату</summary>
        <form action={addExpense} className="grid grid-cols-2 gap-2 px-4 pb-4">
          <label className="col-span-2 block"><span className="label">Что купили</span><input name="title" required placeholder="например, лампа, наконечник, обучение" className="input" /></label>
          <label className="block"><span className="label">Сумма, ₽</span><input name="amount" required inputMode="numeric" className="input" /></label>
          <label className="block"><span className="label">Дата</span><input name="date" type="date" defaultValue={today} className="input" /></label>
          <label className="col-span-2 block">
            <span className="label">Категория</span>
            <select name="category" defaultValue="OTHER" className="input">
              {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="col-span-2 block"><span className="label">Комментарий</span><input name="comment" placeholder="где купили, ссылка" className="input" /></label>
          <button className="btn-primary col-span-2">Добавить</button>
        </form>
      </details>

      <section>
        <h2 className="section-title">Все траты за месяц · {rows.length}</h2>
        {rows.length === 0 ? (
          <Empty>В этом месяце трат нет.</Empty>
        ) : (
          <div className="card divide-y divide-zinc-100">
            {rows.map((r) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-ink-mute">{fmtDate(r.date)} · {catLabel(r.category)}{r.note ? ` · ${r.note}` : ""}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(r.amount)}</span>
                </>
              );
              return (
                <div key={r.key} className="flex items-center gap-3 px-4 py-2.5">
                  {r.href ? <Link href={r.href} className="flex min-w-0 flex-1 items-center gap-3">{body}</Link> : <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>}
                  {r.expenseId && (
                    <form action={deleteExpense.bind(null, r.expenseId)}>
                      <ConfirmButton message="Удалить трату?" className="px-1 text-lg text-ink-mute">×</ConfirmButton>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 px-1 text-xs text-ink-mute">Покупки на склад появляются здесь сами — и из «Отметить как купленное», и из загруженных УПД (Склад → 📄 УПД). Чтобы удалить такую покупку — откройте позицию склада.</p>
      </section>
    </div>
  );
}
