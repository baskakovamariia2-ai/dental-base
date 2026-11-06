import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtQty, money } from "@/lib/format";
import { toISODate } from "@/lib/dates";
import { INVENTORY_CATEGORY_ALL, STOCK_LEVEL, findOpt } from "@/lib/labels";
import { adjustQuantity, recordPurchase, setLevel, setToBuy } from "@/actions/inventory";
import { Empty, PageHeader } from "@/components/ui";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: { supplier: true, purchases: { orderBy: { date: "desc" }, include: { supplier: true } } },
  });
  if (!item) notFound();
  const low = item.countable ? item.quantity <= item.minQuantity : item.level === "LOW" || item.level === "OUT";
  const price = item.currentPrice ?? item.lastPurchasePrice;

  return (
    <div className="space-y-4">
      <PageHeader title={item.name} subtitle={findOpt(INVENTORY_CATEGORY_ALL, item.category).label} back="/inventory" action={<Link href={`/inventory/${id}/edit`} className="btn-secondary">Изменить</Link>} />

      {!item.countable && (
        <div className="card card-pad">
          <div className="mb-2 text-sm text-ink-soft">Сколько осталось</div>
          <div className="grid grid-cols-4 gap-2">
            {STOCK_LEVEL.map((l) => (
              <form key={l.value} action={setLevel.bind(null, id)}>
                <input type="hidden" name="level" value={l.value} />
                <button className={`h-12 w-full rounded-xl text-[15px] font-medium ring-1 ring-inset ${item.level === l.value ? l.cls : "bg-white text-ink-mute ring-zinc-200"}`}>{l.label}</button>
              </form>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-mute">Чтобы считать штуками — «Изменить» → включить «Считаем штуками».</p>
        </div>
      )}
      <div className={`card card-pad ${item.countable ? "" : "hidden"}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-ink-soft">Остаток</div>
            <div className={`text-3xl font-semibold tabular-nums ${item.quantity <= 0 ? "text-rose-600" : low ? "text-amber-600" : ""}`}>
              {fmtQty(item.quantity)} <span className="text-base font-normal text-ink-mute">{item.unit}</span>
            </div>
            <div className="text-xs text-ink-mute">Минимум: {fmtQty(item.minQuantity)} {item.unit}{low ? " · нужно заказать" : ""}</div>
          </div>
          <div className="flex gap-2">
            <form action={adjustQuantity.bind(null, id)}><input type="hidden" name="delta" value="-1" /><button className="h-12 w-12 rounded-xl bg-zinc-100 text-xl">−</button></form>
            <form action={adjustQuantity.bind(null, id)}><input type="hidden" name="delta" value="1" /><button className="h-12 w-12 rounded-xl bg-zinc-100 text-xl">+</button></form>
          </div>
        </div>
        <form action={adjustQuantity.bind(null, id)} className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-4">
          <input name="exact" inputMode="decimal" placeholder="Точное количество" className="input flex-1" />
          <button className="btn-secondary">Установить</button>
        </form>
      </div>

      <div className="card divide-y divide-zinc-100">
        <Row label="Текущая цена">{money(item.currentPrice)}</Row>
        <Row label="Последняя закупка">{money(item.lastPurchasePrice)} · {fmtDate(item.lastPurchaseDate)}</Row>
        <Row label="Поставщик">{item.supplier?.name ?? "—"}</Row>
        {item.url && <Row label="Ссылка"><a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent">Открыть</a></Row>}
        {item.comment && <Row label="Комментарий">{item.comment}</Row>}
      </div>

      <div className="card card-pad">
        <div className="section-title">Закупка</div>
        {item.toBuyQuantity ? (
          <div className="mb-3 flex items-center justify-between text-sm">
            <span>В списке «Закупить»: {fmtQty(item.toBuyQuantity)} {item.unit}</span>
            <form action={setToBuy.bind(null, id)}><input type="hidden" name="toBuyQuantity" value="0" /><button className="text-ink-mute hover:underline">Убрать</button></form>
          </div>
        ) : (
          <form action={setToBuy.bind(null, id)} className="mb-4 flex items-center gap-2">
            <input name="toBuyQuantity" inputMode="decimal" placeholder="Сколько" className="input w-28" />
            <button className="btn-secondary">Добавить в закупку</button>
          </form>
        )}
        <details>
          <summary className="btn-primary cursor-pointer list-none">Отметить как купленное</summary>
          <form action={recordPurchase.bind(null, id)} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="block"><span className="label">Количество</span><input name="quantity" inputMode="decimal" defaultValue={item.toBuyQuantity ? fmtQty(item.toBuyQuantity) : ""} required className="input" /></label>
            <label className="block"><span className="label">Цена за ед., ₽</span><input name="price" inputMode="numeric" defaultValue={price ?? ""} className="input" /></label>
            <label className="block"><span className="label">Дата</span><input name="date" type="date" defaultValue={toISODate(new Date())} className="input" /></label>
            <label className="block"><span className="label">Поставщик</span><input name="supplier" defaultValue={item.supplier?.name ?? ""} className="input" /></label>
            <label className="col-span-2 block sm:col-span-4"><span className="label">Комментарий</span><input name="comment" className="input" /></label>
            <button className="btn-accent col-span-2 sm:col-span-4">Подтвердить покупку</button>
          </form>
        </details>
      </div>

      <div>
        <h2 className="section-title">История закупок</h2>
        {item.purchases.length === 0 ? (
          <Empty>Закупок ещё не было</Empty>
        ) : (
          <div className="card divide-y divide-zinc-100">
            {item.purchases.map((p, idx) => {
              const prev = item.purchases[idx + 1];
              const diff = prev ? p.price - prev.price : 0;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
                  <div>
                    <div>{fmtDate(p.date)} — {fmtQty(p.quantity)} {item.unit}</div>
                    <div className="text-xs text-ink-mute">{p.supplier?.name ?? ""}{p.comment ? ` · ${p.comment}` : ""}</div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-medium">{money(p.price)}</div>
                    {diff !== 0 && <div className={`text-xs ${diff > 0 ? "text-rose-600" : "text-emerald-600"}`}>{diff > 0 ? "+" : ""}{money(diff)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <span className="text-sm text-ink-mute">{label}</span>
      <span className="text-right text-[15px]">{children}</span>
    </div>
  );
}
