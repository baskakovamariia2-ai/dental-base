import { requireUser } from "@/lib/auth";
import { createPriceList } from "@/actions/pricelists";
import { PageHeader } from "@/components/ui";
import { PriceListFields } from "../price-form";

export default async function NewPriceListPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="Новый прайс" back="/prices" />
      <form action={createPriceList} className="space-y-4">
        <PriceListFields />
        <label className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-zinc-200">
          <input type="checkbox" name="isDefault" className="h-5 w-5 accent-teal-700" />
          Сделать текущим (для новых пациентов)
        </label>
        <button className="btn-primary w-full sm:w-auto">Сохранить прайс</button>
      </form>
    </div>
  );
}
