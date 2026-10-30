import Link from "next/link";
import type { InventoryCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtQty, money } from "@/lib/format";
import { toISODate } from "@/lib/dates";
import { INVENTORY_CATEGORY, findOpt } from "@/lib/labels";
import { adjustQuantity, recordPurchase, setToBuy } from "@/actions/inventory";
import { Empty, PageHeader } from "@/components/ui";
import { IconPlus, IconSearch } from "@/components/icons";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cat?: string; q?: string }>;
}) {
  await requireUser();
  const { tab = "all", cat = "", q = "" } = await searchParams;

  const where: Prisma.InventoryItemWhereInput = { archivedAt: null };
  if (cat && INVENTORY_CATEGORY.some((c) => c.value === cat)) where.category = cat as InventoryCategory;
  if (q.trim()) where.name = { contains: q.trim(), mode: "insensitive" };
  if (tab === "buy") where.toBuyQuantity = { not: null };

  const all = await prisma.inventoryItem.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }], include: { supplier: true } });
  const items = tab === "low" ? all.filter((i) => i.quantity <= i.minQuantity) : all;
  const lowCount = (await prisma.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM "InventoryItem" WHERE "archivedAt" IS NULL AND quantity <= "minQuantity"`)[0]?.c ?? 0n;
  const buyCount = await prisma.inventoryItem.count({ where: { archivedAt: null, toBuyQuantity: { not: null } } });
  const buyTotal = items.reduce((s, i) => s + (i.toBuyQuantity ?? 0) * (i.currentPrice ?? i.lastPurchasePrice ?? 0), 0);

  const tabs = [
    { key: "all", label: "Все товары" },
    { key: "low", label: `Нужно заказать${lowCount ? ` · ${lowCount}` : ""}` },
    { key: "buy", label: `Закупить${buyCount ? ` · ${buyCount}` : ""}` },
  ];
  const href = (p: Record<string, string>) => `/inventory?${new URLSearchParams(Object.fromEntries(Object.entries({ tab, cat, q, ...p }).filter(([, v]) => v)))}`;

  return (
    <div>
      <PageHeader title="Склад" action={<Link href="/inventory/new" className="btn-accent"><IconPlus /> <span className="hidden sm:inline">Добавить товар</span></Link>} />

      <div className="mb-3 flex rounded-xl bg-zinc-200/60 p-1">
        {tabs.map((t) => (
          <Link key={t.key} href={href({ tab: t.key })} className={`flex-1 rounded-lg py-2 text-center text-[13px] font-medium sm:text-sm ${tab === t.key ? "bg-white shadow-card" : "text-ink-soft"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <form className="relative mb-3">
        <input type="hidden" name="tab" value={tab} />
        {cat && <input type="hidden" name="cat" value={cat} />}
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" />
        <input name="q" defaultValue={q} placeholder="Поиск товара" className="input bg-white pl-11" enterKeyHint="search" />
      </form>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Link href={href({ cat: "" })} className={!cat ? "chip-active" : "chip"}>Все</Link>
        {INVENTORY_CATEGORY.map((c) => (
          <Link key={c.value} href={href({ cat: c.value })} className={cat === c.value ? "chip-active" : "chip"}>{c.label}</Link>
        ))}
      </div>

      {tab === "buy" && items.length > 0 && (
        <div className="card card-pad mb-3 flex items-baseline justify-between">
          <span className="text-ink-soft">Примерная сумма закупки</span>
          <span className="text-lg font-semibold tabular-nums">{money(buyTotal)}</span>
        </div>
      )}

      {items.length === 0 ? (
        <Empty>{tab === "buy" ? "Список закупок пуст. Добавляйте товары кнопкой «В закупку»." : tab === "low" ? "Всего достаточно 👌" : "Товаров пока нет"}</Empty>
      ) : (
        <div className="card divide-y divide-zinc-100">
          {items.map((i) => {
            const low = i.quantity <= i.minQuantity;
            const out = i.quantity <= 0;
            const price = i.currentPrice ?? i.lastPurchasePrice;
            return (
              <div key={i.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <Link href={`/inventory/${i.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {low && <span className={`h-2 w-2 shrink-0 rounded-full ${out ? "bg-rose-500" : "bg-amber-400"}`} />}
                      <span className="truncate text-[15px] font-medium">{i.name}</span>
                    </div>
                    <div className="truncate text-xs text-ink-mute">
                      {findOpt(INVENTORY_CATEGORY, i.category).label} · мин. {fmtQty(i.minQuantity)} {i.unit}
                      {price ? ` · ${money(price)}` : ""}
                    </div>
                  </Link>
                  {tab !== "buy" && (
                    <div className="flex shrink-0 items-center gap-1">
                      <form action={adjustQuantity.bind(null, i.id)}>
                        <input type="hidden" name="delta" value="-1" />
                        <button className="h-10 w-10 rounded-xl bg-zinc-100 text-lg font-medium hover:bg-zinc-200" aria-label="Минус один">−</button>
                      </form>
                      <span className={`min-w-[52px] text-center text-[15px] font-semibold tabular-nums ${out ? "text-rose-600" : low ? "text-amber-600" : ""}`}>
                        {fmtQty(i.quantity)}<span className="block text-[10px] font-normal text-ink-mute">{i.unit}</span>
                      </span>
                      <form action={adjustQuantity.bind(null, i.id)}>
                        <input type="hidden" name="delta" value="1" />
                        <button className="h-10 w-10 rounded-xl bg-zinc-100 text-lg font-medium hover:bg-zinc-200" aria-label="Плюс один">+</button>
                      </form>
                    </div>
                  )}
                </div>

                {tab === "low" && !i.toBuyQuantity && (
                  <form action={setToBuy.bind(null, i.id)} className="mt-2 flex items-center gap-2">
                    <input name="toBuyQuantity" inputMode="decimal" defaultValue={fmtQty(Math.max(1, i.minQuantity * 2 - i.quantity))} className="input w-24" aria-label="Сколько купить" />
                    <span className="text-sm text-ink-mute">{i.unit}</span>
                    <button className="btn-secondary btn-sm h-11">Добавить в закупку</button>
                  </form>
                )}
                {tab === "low" && i.toBuyQuantity && <p className="mt-1.5 text-xs text-accent">В списке закупок: {fmtQty(i.toBuyQuantity)} {i.unit}</p>}

                {tab === "buy" && i.toBuyQuantity && (
                  <div className="mt-2 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-ink-soft">Купить: {fmtQty(i.toBuyQuantity)} {i.unit} × {money(price)}</span>
                      <span className="font-medium tabular-nums">≈ {money(Math.round(i.toBuyQuantity * (price ?? 0)))}</span>
                    </div>
                    <details>
                      <summary className="btn-primary btn-sm cursor-pointer list-none">Отметить как купленное</summary>
                      <form action={recordPurchase.bind(null, i.id)} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <label className="block"><span className="label">Количество</span><input name="quantity" inputMode="decimal" defaultValue={fmtQty(i.toBuyQuantity)} className="input" /></label>
                        <label className="block"><span className="label">Цена за ед., ₽</span><input name="price" inputMode="numeric" defaultValue={price ?? ""} className="input" /></label>
                        <label className="block"><span className="label">Дата</span><input name="date" type="date" defaultValue={toISODate(new Date())} className="input" /></label>
                        <label className="block"><span className="label">Поставщик</span><input name="supplier" defaultValue={i.supplier?.name ?? ""} className="input" /></label>
                        <button className="btn-accent col-span-2 sm:col-span-4">Подтвердить покупку — остаток обновится</button>
                      </form>
                    </details>
                    <form action={setToBuy.bind(null, i.id)}>
                      <input type="hidden" name="toBuyQuantity" value="0" />
                      <button className="text-xs text-ink-mute hover:underline">Убрать из списка</button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
