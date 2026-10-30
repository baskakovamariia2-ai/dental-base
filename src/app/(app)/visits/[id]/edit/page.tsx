import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getDoctors } from "@/lib/doctors";
import { fullName } from "@/lib/format";
import { deleteVisit, updateVisit } from "@/actions/visits";
import { ConfirmButton } from "@/components/auto-submit";
import { PageHeader } from "@/components/ui";
import { VisitFields } from "../../visit-form";

export default async function EditVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const visit = await prisma.visit.findUnique({ where: { id }, include: { patient: true } });
  if (!visit) notFound();
  const doctors = await getDoctors();
  return (
    <div>
      <PageHeader title="Приём" subtitle={fullName(visit.patient)} back={`/patients/${visit.patientId}?tab=history`} />
      <form action={updateVisit.bind(null, id)} className="space-y-4">
        <VisitFields visit={visit} doctors={doctors} defaultDoctorId={doctors[0]?.id ?? user.id} />
        <button className="btn-primary w-full sm:w-auto">Сохранить</button>
      </form>
      <form action={deleteVisit.bind(null, id)} className="mt-8">
        <ConfirmButton message="Удалить запись о приёме?">Удалить приём</ConfirmButton>
      </form>
    </div>
  );
}
