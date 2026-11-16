import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addDays, parseISODate, startOfDay, toISODate } from "@/lib/dates";
import { fmtDateLong, fmtTime, fullName, money } from "@/lib/format";
import { finishShift, setAppointmentStatus, updateFromReport } from "@/actions/appointments";
import { priceItemsFor } from "@/lib/plan";
import { ProcedureFields } from "@/components/procedure-fields";
import { PhotoUploader } from "@/components/photo-uploader";
import { ConfirmButton } from "@/components/auto-submit";
import { pendingShiftDays } from "@/lib/shift";

export const dynamic = "force-dynamic";

/** Отчёт о смене: кто пришёл, фото (по желанию), затем «Завершить смену» */
export default async function ShiftReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const day = parseISODate(sp.date) ?? startOfDay(new Date());
  const iso = toISODate(day);
  const [aps, pending] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: day, lt: addDays(day, 1) } },
      include: { patient: true },
      orderBy: { startsAt: "asc" },
    }),
    pendingShiftDays(),
  ]);
  const photoCounts = await prisma.patientFile.groupBy({
    by: ["appointmentId"],
    where: { appointmentId: { in: aps.map((a) => a.id) } },
    _count: true,
  });
  const photosOf = (id: string) => photoCounts.find((p) => p.appointmentId === id)?._count ?? 0;
  // для правки процедуры: прайс и план каждого пациента
  const patientIds = [...new Set(aps.map((a) => a.patientId))];
  const pricesBy = new Map<string, { name: string; price: number }[]>();
  for (const pid of patientIds) pricesBy.set(pid, (await priceItemsFor(pid)).items.map((i) => ({ name: i.name, price: i.price })));
  const planItems = await prisma.treatmentItem.findMany({
    where: {
      patientId: { in: patientIds },
      OR: [{ status: { in: ["PLANNED", "IN_PROGRESS"] } }, { id: { in: aps.map((a) => a.treatmentItemId).filter((x): x is string => !!x) } }],
    },
    orderBy: [{ toothNumber: "asc" }, { sortOrder: "asc" }],
  });
  const planOf = (pid: string) => planItems.filter((i) => i.patientId === pid).map((i) => ({ id: i.id, toothNumber: i.toothNumber, treatment: i.treatment, price: i.price }));
  const active = aps.filter((a) => !["CANCELLED", "NO_SHOW"].includes(a.status));
  const open = active.filter((a) => a.status !== "DONE");
  const total = active.reduce((s, a) => s + (a.price ?? 0), 0);
  const back = `/schedule/report?date=${iso}`;
  const otherDays = pending.filter((p) => p.date !== iso);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/schedule?view=day&date=${iso}`} className="btn-secondary">← Назад</Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Отчёт о смене</h1>
        <p className="text-ink-soft">{fmtDateLong(day)}</p>
      </div>

      {otherDays.length > 0 && (
        <div className="card card-pad text-sm">
          Есть и другие незавершённые смены:{" "}
          {otherDays.map((d) => (
            <Link key={d.date} href={`/schedule/report?date=${d.date}`} className="mr-2 font-medium text-accent-ink underline">
              {d.date.split("-").reverse().slice(0, 2).join(".")}
            </Link>
          ))}
        </div>
      )}

      {aps.length === 0 ? (
        <div className="card card-pad text-ink-soft">В этот день записей нет.</div>
      ) : (
        <ol className="space-y-3">
          {aps.map((a) => {
            const cancelled = ["CANCELLED", "NO_SHOW"].includes(a.status);
            const n = photosOf(a.id);
            return (
              <li key={a.id} className={`card card-pad space-y-2 ${cancelled ? "opacity-50" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="w-12 shrink-0 text-[15px] font-semibold tabular-nums">{fmtTime(a.startsAt)}</div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/patients/${a.patient.id}`} className="block truncate text-[15px] font-medium">{fullName(a.patient)}</Link>
                    <div className="text-sm text-ink-soft">
                      {a.procedure}{a.toothNumber ? ` · зуб ${a.toothNumber}` : ""}{a.price ? ` · ${money(a.price)}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${a.status === "DONE" ? "bg-emerald-50 text-emerald-700" : cancelled ? "bg-zinc-100 text-zinc-500" : "bg-sky-50 text-sky-700"}`}>
                    {a.status === "DONE" ? "Завершён" : cancelled ? "Не пришёл" : "Был на приёме"}
                  </span>
                </div>

                {!cancelled && (
                  <details className="rounded-xl bg-zinc-50 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">✏️ Изменить процедуру или сумму</summary>
                    <form action={updateFromReport.bind(null, a.id)} className="grid gap-3 pt-3 sm:grid-cols-2">
                      <input type="hidden" name="returnTo" value={back} />
                      <ProcedureFields
                        prices={pricesBy.get(a.patientId) ?? []}
                        plan={planOf(a.patientId)}
                        initial={{ procedure: a.procedure, price: a.price, toothNumber: a.toothNumber, treatmentItemId: a.treatmentItemId }}
                      />
                      <button className="btn-primary sm:col-span-2">Сохранить</button>
                      {a.status === "DONE" && <p className="text-xs text-ink-mute sm:col-span-2">Приём уже завершён — обновятся история пациента, план лечения, зубная формула и заработок. Если процедуру заменили, прежняя вернётся в план как невыполненная (не нужна — удалите её из плана).</p>}
                    </form>
                  </details>
                )}

                {!cancelled && (
                  <details className="rounded-xl bg-zinc-50 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">📷 Фото {n ? `· загружено ${n}` : "(необязательно)"}</summary>
                    <div className="pt-3">
                      <PhotoUploader patientId={a.patient.id} appointmentId={a.id} defaultTooth={a.toothNumber} compact />
                    </div>
                  </details>
                )}

                {a.status !== "DONE" && (
                  <form action={setAppointmentStatus.bind(null, a.id)}>
                    <input type="hidden" name="returnTo" value={back} />
                    <input type="hidden" name="status" value={cancelled ? "SCHEDULED" : "CANCELLED"} />
                    <button className="text-sm text-ink-mute underline">{cancelled ? "Вернуть: пациент был" : "Пациент не пришёл"}</button>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {open.length > 0 ? (
        <form action={finishShift.bind(null, iso)} className="space-y-2">
          <ConfirmButton
            message={`Завершить смену? ${open.length} зап. станут «Завершён», лечение из них отметится выполненным и оплаченным, суммы попадут в историю и заработок.`}
            className="btn-primary w-full py-3 text-[16px]"
          >
            ✓ Завершить смену · {money(total)}
          </ConfirmButton>
          <p className="text-center text-xs text-ink-mute">Фото можно добавить и позже — в карточке пациента.</p>
        </form>
      ) : (
        aps.length > 0 && <div className="card card-pad text-center text-emerald-700">Смена завершена ✓</div>
      )}
    </div>
  );
}
