import type { InventoryItem, Supplier } from "@prisma/client";
import { INVENTORY_CATEGORY, STOCK_LEVEL } from "@/lib/labels";
import { toISODate } from "@/lib/dates";
import { Field, Select } from "@/components/ui";

export function ItemForm({
  action,
  item,
  suppliers,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  item?: InventoryItem & { supplier: Supplier | null };
  suppliers: Supplier[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="card card-pad grid gap-4 sm:grid-cols-2">
        <Field label="Название *" className="sm:col-span-2"><input name="name" required defaultValue={item?.name} placeholder="Композит Filtek A2" className="input" /></Field>
        <Field label="Категория"><Select name="category" options={INVENTORY_CATEGORY} defaultValue={item?.category ?? "CONSUMABLES"} /></Field>
        <Field label="Единица измерения">
          <input name="unit" defaultValue={item?.unit ?? "шт."} list="units" className="input" />
          <datalist id="units">{["шт.", "уп.", "шприц", "карпула", "мл", "г", "набор"].map((u) => <option key={u} value={u} />)}</datalist>
        </Field>
        <label className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3.5 py-3 text-sm sm:col-span-2">
          <input type="checkbox" name="countable" defaultChecked={item?.countable ?? true} className="h-5 w-5 accent-teal-700" />
          Считаем штуками (если выключить — отмечаем «много / есть / мало / нет»)
        </label>
        <Field label="Количество"><input name="quantity" inputMode="decimal" defaultValue={item?.quantity ?? 0} className="input" /></Field>
        <Field label="Минимальный остаток"><input name="minQuantity" inputMode="decimal" defaultValue={item?.minQuantity ?? 1} className="input" /></Field>
        <Field label="Уровень (если не считаем штуками)">
          <select name="level" defaultValue={item?.level ?? "ENOUGH"} className="input">
            {STOCK_LEVEL.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="card card-pad grid gap-4 sm:grid-cols-2">
        <Field label="Последняя цена покупки, ₽"><input name="lastPurchasePrice" inputMode="numeric" defaultValue={item?.lastPurchasePrice ?? ""} className="input" /></Field>
        <Field label="Текущая цена, ₽"><input name="currentPrice" inputMode="numeric" defaultValue={item?.currentPrice ?? ""} className="input" /></Field>
        <Field label="Дата последней покупки"><input name="lastPurchaseDate" type="date" defaultValue={item?.lastPurchaseDate ? toISODate(item.lastPurchaseDate) : ""} className="input" /></Field>
        <Field label="Поставщик">
          <input name="supplier" defaultValue={item?.supplier?.name ?? ""} list="suppliers" className="input" />
          <datalist id="suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>
        <Field label="Ссылка на товар" className="sm:col-span-2"><input name="url" type="url" defaultValue={item?.url ?? ""} placeholder="https://" className="input" /></Field>
        <Field label="Комментарий" className="sm:col-span-2"><textarea name="comment" rows={2} defaultValue={item?.comment ?? ""} className="input" /></Field>
      </div>
      <button className="btn-primary w-full sm:w-auto">{submitLabel}</button>
    </form>
  );
}
