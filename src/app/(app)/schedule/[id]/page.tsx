import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { priceItemsFor } from "@/lib/plan";
import { getReminderTemplate, reminderText } from "@/lib/reminder";
import { ReminderButton } from "@/components/reminder-button";
import { getDoctors } from "@/lib/doctors";
import { fullName, phoneHref, telegramHref } from "@/lib/format";
import { deleteAppointment, toggleReminder, updateAppointment } from "@/actions/appointments";
import { ConfirmButton } from "@/components/auto-submit";
import { ErrorNote, PageHeader } from "@/components/ui";
import { AppointmentFields } from "../appointment-form";

export default async function EditAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;
  const [ap, doctors] = await Promise.all([
    prisma.appointment.findUnique({ where: { id }, include: { patient: true } }),
    getDoctors(),
  ]);
  if (!ap) notFound();
  const [{ items: priceItems }, openPlan] = await Promise.all([
    priceItemsFor(ap.patientId),
    prisma.treatmentItem.findMany({
      where: { patientId: ap.patientId, OR: [{ status: { in: ["PLANNED", "IN_PROGRESS"] } }, ...(ap.treatmentItemId ? [{ id: ap.treatmentItemId }] : [])] },
      orderBy: [{ toothNumber: "asc" }, { sortOrder: "asc" }],
    }),
  ]);
  const prices = priceItems.map((i) => ({ name: i.name, price: i.price }));
  const plan = openPlan.map((i) => ({ id: i.id, toothNumber: i.toothNumber, treatment: i.treatment, price: i.price }));
  const tpl = await getReminderTemplate();

  return (
    <div>
      <PageHeader title="Запись" subtitle={<Link href={`/patients/${ap.patientId}`} className="text-accent">{fullName(ap.patient)}</Link>} back="/schedule" />
      <ErrorNote show={!!error}>Укажите дату, время и процедуру</ErrorNote>

      <div className="card card-pad mb-4">
        <div className="section-title">Напоминание</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${ap.reminderSent ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200"}`}>
            {ap.reminderSent ? "Напоминание отправлено" : "Напоминание не отправлено"}
          </span>
          <ReminderButton appointmentId={ap.id} text={reminderText(tpl, ap.startsAt)} telegram={telegramHref(ap.patient)} sent={ap.reminderSent} className="btn-primary btn-sm" />
          {ap.patient.phone && <a href={phoneHref(ap.patient.phone)} className="btn-secondary btn-sm">Позвонить</a>}
          <form action={toggleReminder.bind(null, ap.id)}>
            <input type="hidden" name="returnTo" value={`/schedule/${ap.id}`} />
            <button className="btn-primary btn-sm">{ap.reminderSent ? "Снять отметку" : "Отметить: напомнили"}</button>
          </form>
        </div>
      </div>

      <form action={updateAppointment.bind(null, ap.id)} className="space-y-4">
        <AppointmentFields ap={ap} doctors={doctors} defaultDoctorId={doctors[0]?.id ?? user.id} defaultStart={ap.startsAt} prices={prices} plan={plan} />
        <button className="btn-primary w-full sm:w-auto">Сохранить</button>
      </form>
      <form action={deleteAppointment.bind(null, ap.id)} className="mt-8">
        <ConfirmButton message="Удалить запись из расписания?">Удалить запись</ConfirmButton>
      </form>
    </div>
  );
}
