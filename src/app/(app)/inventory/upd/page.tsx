import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { UpdImporter } from "@/components/upd-importer";

export default async function UpdPage() {
  await requireUser();
  return (
    <div className="space-y-4">
      <PageHeader title="Загрузить УПД" subtitle="PDF-документ от поставщика: база сама запишет покупки в «Траты» и пополнит склад." back="/inventory" />
      <UpdImporter />
    </div>
  );
}
