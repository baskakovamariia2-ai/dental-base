import Link from "next/link";
import type { Appointment, Patient, User } from "@prisma/client";
import { setAppointmentStatus, toggleReminder } from "@/actions/appointments";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { fmtTime, fullName, telegramHref } from "@/lib/format";
import { AutoSubmitSelect } from "./auto-submit";

export type AppointmentWith = Appointment & { patient: Patient; doctor: User | null };

export function AppointmentRow({ a, returnTo, showDate }: { a: AppointmentWith; returnTo: string; showDate?: boolean }) {
  const end = new Date(a.startsAt.getTime() + a.durationMin * 60000);
  const cancelled = a.status === "CANCELLED" || a.status === "NO_SHOW";
  return (
    <div className={`flex gap-3 px-4 py-3.5 ${cancelled ? "opacity-60" : ""}`}>
      <div className="w-14 shrink-0 pt-0.5 text-right">
        {showDate && (
          <div className="text-[11px] text-ink-mute">
            {a.startsAt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
          </div>
        )}
        <div className="text-[15px] font-semibold tabular-nums">{fmtTime(a.startsAt)}</div>
        <div className="text-xs tabular-nums text-ink-mute">{fmtTime(end)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/patients/${a.patient.id}`} className="block truncate text-[15px] font-medium hover:underline">
          {fullName(a.patient)}
          {a.patient.isDemo && <span className="ml-1.5 text-[10px] font-semibold text-amber-600">DEMO</span>}
        </Link>
        <div className="truncate text-sm text-ink-soft">{a.procedure}</div>
        {a.comment && <div className="mt-0.5 truncate text-xs text-ink-mute">{a.comment}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <form action={setAppointmentStatus.bind(null, a.id)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <AutoSubmitSelect name="status" defaultValue={a.status} options={APPOINTMENT_STATUS} ariaLabel="Статус записи" />
          </form>
          <form action={toggleReminder.bind(null, a.id)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${a.reminderSent ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-ink-soft"}`}
              title={a.reminderSent ? "Отметить как не отправленное" : "Отметить, что напоминание отправлено"}
            >
              {a.reminderSent ? "✓ Напоминание отправлено" : "Напомнить пациенту"}
            </button>
          </form>
          {telegramHref(a.patient) && (
            <a href={telegramHref(a.patient)!} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-[#229ED9]">
              Telegram
            </a>
          )}
          <Link href={`/schedule/${a.id}`} className="rounded-lg px-2 py-1.5 text-xs text-ink-mute hover:bg-zinc-100">
            Изменить
          </Link>
        </div>
      </div>
    </div>
  );
}
