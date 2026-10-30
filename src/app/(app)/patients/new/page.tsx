import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createPatient } from "@/actions/patients";
import { ErrorNote, PageHeader } from "@/components/ui";
import { PatientForm } from "../patient-form";

export default async function NewPatientPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { error } = await searchParams;
  const priceLists = await prisma.priceList.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div>
      <PageHeader title="Новый пациент" back="/patients" />
      <ErrorNote show={!!error}>Укажите имя и фамилию</ErrorNote>
      <PatientForm action={createPatient} submitLabel="Создать пациента" priceLists={priceLists} />
    </div>
  );
}
