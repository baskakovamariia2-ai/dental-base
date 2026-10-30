import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { archivePatient, deletePatientForever, restorePatient, updatePatient } from "@/actions/patients";
import { fullName } from "@/lib/format";
import { ErrorNote, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/auto-submit";
import { PatientForm } from "../../patient-form";

export default async function EditPatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) notFound();
  const priceLists = await prisma.priceList.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div>
      <PageHeader title="Редактирование" subtitle={fullName(patient)} back={`/patients/${id}`} />
      <ErrorNote show={!!error}>Укажите имя и фамилию</ErrorNote>
      <PatientForm action={updatePatient.bind(null, id)} patient={patient} submitLabel="Сохранить" priceLists={priceLists} />

      <div className="mt-10 border-t border-zinc-200 pt-6">
        <h2 className="section-title">Архив</h2>
        {patient.archivedAt ? (
          <div className="flex flex-wrap gap-2">
            <form action={restorePatient.bind(null, id)}><button className="btn-secondary">Вернуть из архива</button></form>
            {user.role === "OWNER" && (
              <form action={deletePatientForever.bind(null, id)}>
                <ConfirmButton message="Удалить пациента и ВСЕ его данные навсегда? Это нельзя отменить.">Удалить навсегда</ConfirmButton>
              </form>
            )}
          </div>
        ) : (
          <form action={archivePatient.bind(null, id)}>
            <p className="mb-3 text-sm text-ink-soft">Пациент пропадёт из списков, но все данные сохранятся.</p>
            <ConfirmButton message="Переместить пациента в архив?">Переместить в архив</ConfirmButton>
          </form>
        )}
      </div>
    </div>
  );
}
