import Link from "next/link";
import type { InventoryItem, Prisma, Supplier } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtQty, money } from "@/lib/format";
import { toISODate } from "@/lib/dates";
import { INVENTORY_CATEGORY, INVENTORY_CATEGORY_ALL, STOCK_LEVEL, categoryGroup, findOpt } from "@/lib/labels";
import { autoCategorize, clearInventory, openNewPackage, setOpenLevel } from "@/actions/inventory";
import { loadClinicInventory, resetExportKey } from "@/actions/consumables";
import { headers } from "next/headers";
import { getExportKey } from "@/lib/export-key";
import { ConfirmButton } from "@/components/auto-submit";
import { adjustQuantity, recordPurchase, setLevel, setToBuy } from "@/actions/inventory";
import { isLowItem, loadProcedures, visitsLeft } from "@/lib/consumables";
import { Empty, PageHeader } from "@/components/ui";
import { IconPlus, IconSearch } from "@/components/icons";

type Item = InventoryItem & { supplier: Supplier | null };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cat?: string; q?: string }>;
}) {
  await requireUser();
  const { tab: tabRaw = "cons", cat = "", q = "" } = await searchParams;
  const tab = tabRaw === "all" || tabRaw === "low" ? "cons" : tabRaw;

  const where: Prisma.InventoryItemWhereInput = { archivedAt: null };
  if (q.trim()) where.name = { contains: q.trim(), mode: "insensitive" };
  if (cat && INVENTORY_CATEGORY.some((c) => c.value === cat)) where.category = { in: categoryGroup(cat) };
  if (tab === "buy") where.toBuyQuantity = { not: null };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const exportKey = await getExportKey();
  const sheetFormula = (kind: string) => `=IMPORTDATA("${origin}/api/export/${kind}?key=${exportKey}"; ","; "en_US")`;
  const [all, everything, procs] = await Promise.all([
    prisma.inventoryItem.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }], include: { supplier: true } }),
    prisma.inventoryItem.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    loadProcedures(),
  ]);
  const isTool = (i: { category: string }) => i.category === "INSTRUMENTS";
  const low = everything.filter(isLowItem);
  const buyCount = everything.filter((i) => i.toBuyQuantity).length;

  // сколько уходит за обычный приём (первая процедура, где позиция есть) — чтобы показать «на N приёмов»
  const perVisit = new Map<string, number>();
  for (const p of procs) for (const l of p.items) if (l.itemId && l.qty > 0 && !perVisit.has(l.itemId)) perVisit.set(l.itemId, l.qty);

  const tracked = all.filter((i) => i.trackPerVisit && !isTool(i));
  const packaged = all.filter((i) => !i.trackPerVisit && !isTool(i));
  const tools = all.filter(isTool);
  const buyItems = all.filter((i) => i.toBuyQuantity);
  const buyTotal = buyItems.reduce((s, i) => s + (i.toBuyQuantity ?? 0) * (i.currentPrice ?? i.lastPurchasePrice ?? 0), 0);

  const tabs = [
    { key: "cons", label: "Расходники" },
    { key: "tools", label: "Инструменты" },
    { key: "buy", label: `Закупить${buyCount ? ` · ${buyCount}` : ""}` },
  ];
  const href = (p: Record<string, string>) => `/inventory?${new URLSearchParams(Object.fromEntries(Object.entries({ tab, cat, q, ...p }).filter(([, v]) => v)))}`;

  return (
    <div>
      <PageHeader
        title="Склад"
        action={
          <div className="flex gap-2">
            <Link href="/procedures" className="btn-secondary">₽ <span className="hidden sm:inline">Себестоимость</span></Link>
            <Link href="/inventory/import" className="btn-secondary">🎙 <span className="hidden sm:inline">Списком</span></Link>
            <Link href="/inventory/new" className="btn-accent"><IconPlus /> <span className="hidden sm:inline">Добавить</span></Link>
          </div>
        }
      />

      <div className="mb-3 flex rounded-xl bg-zinc-200/60 p-1">
        {tabs.map((t) => (
          <Link key={t.key} href={href({ tab: t.key, cat: "" })} className={`flex-1 rounded-lg py-2 text-center text-[13px] font-medium sm:text-sm ${tab === t.key ? "bg-white shadow-card" : "text-ink-soft"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <form className="relative mb-3">
        <input type="hidden" name="tab" value={tab} />
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" />
        <input name="q" defaultValue={q} placeholder="Поиск" className="input bg-white pl-11" enterKeyHint="search" />
      </form>

      {tab === "cons" && (
        <>
          {low.length > 0 && !q && (
            <div className="mb-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <div className="mb-2 font-semibold text-amber-900">Заканчивается · {low.length}</div>
              <div className="space-y-2">
                {low.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 text-sm text-amber-900">
                    <Link href={`/inventory/${i.id}`} className="min-w-0 flex-1 truncate">{i.name}</Link>
                    {i.toBuyQuantity ? (
                      <span className="shrink-0 text-xs text-accent">в закупке</span>
                    ) : (
                      <form action={setToBuy.bind(null, i.id)} className="shrink-0">
                        <input type="hidden" name="toBuyQuantity" value="1" />
                        <button className="h-9 rounded-lg bg-white px-3 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">В закупку</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <Link href={href({ cat: "" })} className={!cat ? "chip-active" : "chip"}>Все</Link>
            {INVENTORY_CATEGORY.filter((c) => c.value !== "INSTRUMENTS").map((c) => (
              <Link key={c.value} href={href({ cat: c.value })} className={cat === c.value ? "chip-active" : "chip"}>{c.label}</Link>
            ))}
          </div>

          {tracked.length > 0 && (
            <section className="mb-5">
              <h2 className="section-title">Считаем после каждого приёма</h2>
              <div className="card divide-y divide-zinc-100">
                {tracked.map((i) => {
                  const left = visitsLeft(i.quantity, perVisit.get(i.id) ?? 0);
                  const isLow = isLowItem(i);
                  return (
                    <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                      <Link href={`/inventory/${i.id}`} className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium">{i.name}</div>
                        <div className="truncate text-xs text-ink-mute">
                          {money(i.currentPrice ?? i.lastPurchasePrice)}{left !== null ? ` · хватит примерно на ${left} приёмов` : ""}
                        </div>
                      </Link>
                      <QtyStepper item={i} warn={isLow} />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h2 className="section-title">Считаем упаковками</h2>
            {packaged.length === 0 ? (
              <Empty>Пока пусто. Внизу страницы можно загрузить опись клиники.</Empty>
            ) : (
              <div className="card divide-y divide-zinc-100">
                {packaged.map((i) => <PackageRow key={i.id} item={i} />)}
              </div>
            )}
            <p className="mt-2 px-1 text-xs text-ink-mute">После приёма это не списывается. Начали новую упаковку — «Открыла новую», и одна целая уйдёт. У открытой отмечайте: много, есть, мало.</p>
          </section>
        </>
      )}

      {tab === "tools" && (
        <section>
          <p className="mb-3 px-1 text-sm text-ink-soft">Инструменты не списываются — здесь просто видно, что у вас есть.</p>
          {tools.length === 0 ? (
            <Empty>Инструментов пока нет</Empty>
          ) : (
            <div className="card divide-y divide-zinc-100">
              {tools.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/inventory/${i.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{i.name}</div>
                    {i.comment && <div className="truncate text-xs text-ink-mute">{i.comment}</div>}
                  </Link>
                  {i.countable ? <QtyStepper item={i} warn={false} /> : <span className="text-sm text-ink-mute">{findOpt(STOCK_LEVEL, i.level ?? "ENOUGH").label}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "buy" && (
        <>
          {buyItems.length === 0 ? (
            <Empty>Список закупок пуст. Добавляйте из блока «Заканчивается» во вкладке «Расходники».</Empty>
          ) : (
            <>
              <div className="card card-pad mb-3 flex items-baseline justify-between">
                <span className="text-ink-soft">Примерная сумма закупки</span>
                <span className="text-lg font-semibold tabular-nums">{money(buyTotal)}</span>
              </div>
              <div className="card divide-y divide-zinc-100">
                {buyItems.map((i) => {
                  const price = i.currentPrice ?? i.lastPurchasePrice;
                  return (
                    <div key={i.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/inventory/${i.id}`} className="min-w-0 flex-1 text-[15px] font-medium">{i.name}</Link>
                        {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm text-accent">Ссылка на товар</a>}
                      </div>
                      <form action={setToBuy.bind(null, i.id)} className="flex items-center gap-2 text-sm">
                        <span className="text-ink-soft">Купить:</span>
                        <input name="toBuyQuantity" inputMode="decimal" defaultValue={fmtQty(i.toBuyQuantity ?? 1)} className="input h-10 w-20" aria-label="Сколько купить" />
                        <span className="text-ink-mute">{i.unit} × {money(price)}</span>
                        <button className="btn-ghost btn-sm ml-auto">OK</button>
                      </form>
                      <details>
                        <summary className="btn-primary btn-sm cursor-pointer list-none">Отметить как купленное</summary>
                        <form action={recordPurchase.bind(null, i.id)} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <label className="block"><span className="label">Количество</span><input name="quantity" inputMode="decimal" defaultValue={fmtQty(i.toBuyQuantity ?? 1)} className="input" /></label>
                          <label className="block"><span className="label">Цена за ед., ₽</span><input name="price" inputMode="numeric" defaultValue={price ?? ""} className="input" /></label>
                          <label className="block"><span className="label">Дата</span><input name="date" type="date" defaultValue={toISODate(new Date())} className="input" /></label>
                          <label className="block"><span className="label">Поставщик</span><input name="supplier" defaultValue={i.supplier?.name ?? ""} className="input" /></label>
                          <button className="btn-accent col-span-2 sm:col-span-4">Подтвердить — остаток и цена обновятся</button>
                        </form>
                      </details>
                      <form action={setToBuy.bind(null, i.id)}>
                        <input type="hidden" name="toBuyQuantity" value="0" />
                        <button className="text-xs text-ink-mute hover:underline">Убрать из списка</button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <details className="card mt-8">
        <summary className="cursor-pointer list-none px-4 py-3.5 text-[15px] font-medium">📊 Связь с Google Таблицей</summary>
        <div className="space-y-3 px-4 pb-4 text-sm">
          <p className="text-ink-soft">Создайте в Google Таблице новый лист, нажмите на ячейку A1 и вставьте формулу. Таблица будет сама подтягивать данные из базы (обновляется примерно раз в час). Менять данные — только здесь, в базе.</p>
          {[
            { kind: "inventory", label: "Склад" },
            { kind: "procedures", label: "Себестоимость процедур" },
            { kind: "visits", label: "Приёмы и расходники (3 месяца, с именами пациентов)" },
          ].map((f) => (
            <label key={f.kind} className="block">
              <span className="label">{f.label}</span>
              <textarea readOnly rows={3} defaultValue={sheetFormula(f.kind)} className="input font-mono text-xs" />
            </label>
          ))}
          <p className="text-xs text-ink-mute">В формуле секретный ключ — не пересылайте её чужим. Если формула попала не туда, смените ключ: старые формулы перестанут работать, вставьте новые.</p>
          <form action={resetExportKey}>
            <ConfirmButton className="btn-ghost btn-sm" message="Сменить ключ? Формулы, которые уже вставлены в таблицу, перестанут работать.">Сменить ключ</ConfirmButton>
          </form>
        </div>
      </details>

      <div className="mt-6 space-y-3 border-t border-zinc-200 pt-6">
        <form action={loadClinicInventory}>
          <ConfirmButton className="btn-secondary" message="Загрузить опись клиники Ильи из таблицы (ноябрь 2026)? Текущий склад уйдёт в архив, процедуры для себестоимости создадутся заново.">
            📋 Загрузить опись клиники из таблицы
          </ConfirmButton>
        </form>
        <div className="flex flex-wrap gap-2">
          <form action={autoCategorize}>
            <button className="btn-secondary">✨ Разложить по категориям</button>
          </form>
          <form action={clearInventory}>
            <ConfirmButton message="Удалить ВЕСЬ склад? Все позиции пропадут из списка (история закупок сохранится в базе).">Удалить весь склад</ConfirmButton>
          </form>
        </div>
      </div>
    </div>
  );
}

function QtyStepper({ item: i, warn }: { item: Item; warn: boolean }) {
  const out = i.quantity <= 0;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <form action={adjustQuantity.bind(null, i.id)}>
        <input type="hidden" name="delta" value="-1" />
        <button className="h-10 w-10 rounded-xl bg-zinc-100 text-lg font-medium hover:bg-zinc-200" aria-label="Минус один">−</button>
      </form>
      <span className={`min-w-[52px] text-center text-[15px] font-semibold tabular-nums ${warn && out ? "text-rose-600" : warn ? "text-amber-600" : ""}`}>
        {fmtQty(i.quantity)}<span className="block text-[10px] font-normal text-ink-mute">{i.unit}</span>
      </span>
      <form action={adjustQuantity.bind(null, i.id)}>
        <input type="hidden" name="delta" value="1" />
        <button className="h-10 w-10 rounded-xl bg-zinc-100 text-lg font-medium hover:bg-zinc-200" aria-label="Плюс один">+</button>
      </form>
    </div>
  );
}

function PackageRow({ item: i }: { item: Item }) {
  const low = isLowItem(i);
  if (!i.countable) {
    return (
      <div className="space-y-2 px-4 py-3">
        <Link href={`/inventory/${i.id}`} className="flex items-center gap-2">
          {low && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />}
          <span className="truncate text-[15px] font-medium">{i.name}</span>
        </Link>
        <div className="flex gap-1.5">
          {STOCK_LEVEL.map((l) => (
            <form key={l.value} action={setLevel.bind(null, i.id)}>
              <input type="hidden" name="level" value={l.value} />
              <button className={`h-9 min-w-[60px] rounded-lg px-3 text-[13px] font-medium ring-1 ring-inset ${i.level === l.value ? l.cls : "bg-white text-ink-mute ring-zinc-200"}`}>{l.label}</button>
            </form>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <Link href={`/inventory/${i.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {low && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />}
            <span className="truncate text-[15px] font-medium">{i.name}</span>
          </div>
          <div className="truncate text-xs text-ink-mute">
            {findOpt(INVENTORY_CATEGORY_ALL, i.category).label}
            {i.currentPrice ?? i.lastPurchasePrice ? ` · ${money(i.currentPrice ?? i.lastPurchasePrice)} за ${i.unit}` : ""}
          </div>
        </Link>
        <span className={`shrink-0 text-right text-[15px] font-semibold tabular-nums ${low ? "text-amber-600" : ""}`}>
          {fmtQty(i.quantity)}<span className="block text-[10px] font-normal text-ink-mute">{i.unit}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-ink-mute">Открытая:</span>
        {STOCK_LEVEL.map((l) => (
          <form key={l.value} action={setOpenLevel.bind(null, i.id)}>
            <input type="hidden" name="level" value={l.value} />
            <button className={`h-8 rounded-lg px-2.5 text-xs font-medium ring-1 ring-inset ${i.openLevel === l.value ? l.cls : "bg-white text-ink-mute ring-zinc-200"}`}>{l.label}</button>
          </form>
        ))}
        <form action={openNewPackage.bind(null, i.id)} className="ml-auto">
          <button className="h-8 rounded-lg bg-zinc-100 px-2.5 text-xs font-semibold hover:bg-zinc-200">Открыла новую</button>
        </form>
      </div>
    </div>
  );
}
