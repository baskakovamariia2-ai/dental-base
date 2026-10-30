import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getDoctors } from "@/lib/doctors";
import { parseISODate } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { createAppointment } from "@/actions/appointments";
import { ErrorNote, PageHeader } from "@/components/ui";
import { PatientChooser } from "@/components/patient-chooser";
import { AppointmentFields } from "../appointment-form";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; date?: string; q?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { patient: patientId, date, q = "", error } = await searchParams;
  const extra: Record<string, string> = date ? { date } : {};

  if (!patientId) {
    return (
      <div>
        <PageHeader title="Новая запись" subtitle="Выберите пациента" back="/schedule" />
        <PatientChooser basePath="/schedule/new" q={q} extra={extra} />
      </div>
    );
  }

  const [patient, doctors] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId } }),
    getDoctors(),
  ]);
  if (!patient) notFound();

  const start = parseISODate(date) ?? new Date();
  if (date) start.setHours(10, 0, 0, 0);
  else {
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
  }

  return (
    <div>
      <PageHeader title="Новая запись" subtitle={fullName(patient)} back={`/patients/${patient.id}`} />
      <ErrorNote show={!!error}>Укажите дату, время и процедуру</ErrorNote>
      <form action={createAppointment} className="space-y-4">
        <input type="hidden" name="patientId" value={patient.id} />
        <AppointmentFields doctors={doctors} defaultDoctorId={doctors[0]?.id ?? user.id} defaultStart={start} />
        <button className="btn-primary w-full sm:w-auto">Записать</button>
      </form>
    </div>
  );
}
