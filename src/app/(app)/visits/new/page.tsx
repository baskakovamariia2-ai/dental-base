import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getDoctors } from "@/lib/doctors";
import { addDays, startOfDay } from "@/lib/dates";
import { fmtTime, fullName } from "@/lib/format";
import { createVisit } from "@/actions/visits";
import { notFound } from "next/navigation";
import { ErrorNote, PageHeader } from "@/components/ui";
import { PatientChooser } from "@/components/patient-chooser";
import { VisitFields } from "../visit-form";

export default async function NewVisitPage({ searchParams }: { searchParams: Promise<{ patient?: string; error?: string; q?: string }> }) {
  const user = await requireUser();
  const { patient: patientId, error, q = "" } = await searchParams;
  const today = startOfDay(new Date());
  if (!patientId) {
    return (
      <div>
        <PageHeader title="Новый приём" subtitle="Выберите пациента" back="/" />
        <PatientChooser basePath="/visits/new" q={q} />
      </div>
    );
  }
  const [doctors, patient, todayAp] = await Promise.all([
    getDoctors(),
    prisma.patient.findUnique({ where: { id: patientId } }),
    prisma.appointment.findFirst({
      where: { patientId, startsAt: { gte: today, lt: addDays(today, 1) }, status: { notIn: ["CANCELLED", "DONE", "NO_SHOW"] } },
    }),
  ]);
  if (!patient) notFound();

  return (
    <div>
      <PageHeader title="Новый приём" subtitle={fullName(patient)} back={`/patients/${patient.id}?tab=history`} />
      <ErrorNote show={!!error}>Выберите пациента</ErrorNote>
      <form action={createVisit} className="space-y-4">
        <input type="hidden" name="patientId" value={patient.id} />
        <VisitFields doctors={doctors} defaultDoctorId={doctors[0]?.id ?? user.id} />
        {todayAp && (
          <label className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-zinc-200">
            <input type="checkbox" name="closeAppointment" value={todayAp.id} defaultChecked className="h-5 w-5 accent-teal-700" />
            Отметить сегодняшнюю запись ({fmtTime(todayAp.startsAt)}, {todayAp.procedure}) как завершённую
          </label>
        )}
        <button className="btn-primary w-full sm:w-auto">Сохранить приём</button>
      </form>
    </div>
  );
}
