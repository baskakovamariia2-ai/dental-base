import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { priceItemsFor } from "@/lib/plan";
import { getDoctors } from "@/lib/doctors";
import Link from "next/link";
import { addDays, parseISODate, startOfDay, toISODate } from "@/lib/dates";
import { freeWindows, shiftDays, totalFree, durationText } from "@/lib/shifts";
import { fmtTime } from "@/lib/format";
import { fullName } from "@/lib/format";
import { createAppointment } from "@/actions/appointments";
import { ErrorNote, PageHeader } from "@/components/ui";
import { PatientChooser } from "@/components/patient-chooser";
import { AppointmentFields } from "../appointment-form";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; date?: string; time?: string; q?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { patient: patientId, date, time, q = "", error } = await searchParams;
  const extra: Record<string, string> = { ...(date ? { date } : {}), ...(time ? { time } : {}) };

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
  const [{ items: priceItems }, openPlan] = await Promise.all([
    priceItemsFor(patient.id),
    prisma.treatmentItem.findMany({
      where: { patientId: patient.id, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      orderBy: [{ toothNumber: "asc" }, { sortOrder: "asc" }],
    }),
  ]);
  const prices = priceItems.map((i) => ({ name: i.name, price: i.price }));
  const plan = openPlan.map((i) => ({ id: i.id, toothNumber: i.toothNumber, treatment: i.treatment, price: i.price }));

  // Смены на 2 месяца вперёд — подсвечиваем, куда можно записать, и свободные окна
  const today = startOfDay(new Date());
  const horizon = addDays(today, 62);
  const [shifts, upcoming] = await Promise.all([
    shiftDays(today, horizon),
    prisma.appointment.findMany({ where: { startsAt: { gte: today, lt: horizon } }, select: { startsAt: true, durationMin: true, status: true } }),
  ]);
  const shiftList = [...shifts.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((sh) => ({ ...sh, free: freeWindows(sh, upcoming.filter((a) => toISODate(a.startsAt) === sh.date)) }));
  const selected = date ? shiftList.find((s) => s.date === date) : undefined;

  const start = parseISODate(date) ?? new Date();
  const tm = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  if (date && tm) start.setHours(Number(tm[1]), Number(tm[2]), 0, 0);
  else if (date && selected) {
    const first = selected.free[0]?.from;
    if (first) start.setHours(first.getHours(), first.getMinutes(), 0, 0);
    else start.setHours(Number(selected.start.slice(0, 2)), Number(selected.start.slice(3)), 0, 0);
  } else if (date) start.setHours(15, 0, 0, 0);
  else {
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
  }
  const href = (d: string, t?: string) => `/schedule/new?${new URLSearchParams({ patient: patient.id, date: d, ...(t ? { time: t } : {}) })}`;

  return (
    <div>
      <PageHeader title="Новая запись" subtitle={fullName(patient)} back={`/patients/${patient.id}`} />
      <ErrorNote show={!!error}>Укажите дату, время и процедуру</ErrorNote>
      {shiftList.length > 0 && (
        <div className="card card-pad mb-4">
          <div className="section-title">Смены — куда можно записать</div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {shiftList.map((sh) => {
              const d = parseISODate(sh.date)!;
              const on = sh.date === date;
              const freeMin = totalFree(sh.free);
              return (
                <Link
                  key={sh.date}
                  href={href(sh.date)}
                  className={`shrink-0 rounded-2xl px-3.5 py-2 text-center ring-1 ${on ? "bg-emerald-600 text-white ring-emerald-600" : freeMin ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-zinc-50 text-ink-mute ring-zinc-200"}`}
                >
                  <div className="text-[15px] font-semibold capitalize">{d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}</div>
                  <div className="text-xs opacity-80">{freeMin ? `свободно ${durationText(freeMin)}` : "всё занято"}</div>
                </Link>
              );
            })}
          </div>
          {selected && selected.free.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-sm text-ink-soft">Свободные окна — нажмите, чтобы подставить время:</div>
              <div className="flex flex-wrap gap-2">
                {selected.free.map((w) => (
                  <Link key={w.from.getTime()} href={href(selected.date, fmtTime(w.from))} className={time === fmtTime(w.from) ? "chip-active" : "chip"}>
                    {fmtTime(w.from)}–{fmtTime(w.to)} · {durationText(w.minutes)}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {date && !selected && <p className="mt-2 text-sm text-amber-700">На эту дату смены нет — проверьте, забронирован ли кабинет.</p>}
        </div>
      )}
      <form action={createAppointment} className="space-y-4">
        <input type="hidden" name="patientId" value={patient.id} />
        <AppointmentFields key={`${date ?? ""}${time ?? ""}`} doctors={doctors} defaultDoctorId={doctors[0]?.id ?? user.id} defaultStart={start} prices={prices} plan={plan} />
        <button className="btn-primary w-full sm:w-auto">Записать</button>
      </form>
    </div>
  );
}
