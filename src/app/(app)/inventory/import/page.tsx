import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { InventoryImport } from "@/components/inventory-import";

export default async function InventoryImportPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="Добавить списком" subtitle="Вставьте текст или надиктуйте" back="/inventory" />
      <InventoryImport />
    </div>
  );
}
