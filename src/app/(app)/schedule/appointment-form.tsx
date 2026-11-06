import type { Appointment, User } from "@prisma/client";
import { APPOINTMENT_STATUS, apStatusOpt } from "@/lib/labels";
import { toInputDateTime } from "@/lib/dates";
import { Field, Select } from "@/components/ui";
import { ProcedureFields } from "@/components/procedure-fields";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export function AppointmentFields({
  ap,
  doctors,
  defaultDoctorId,
  defaultStart,
  prices,
  plan,
}: {
  ap?: Appointment;
  doctors: User[];
  defaultDoctorId: string;
  defaultStart: Date;
  prices: { name: string; price: number }[];
  plan: { id: string; toothNumber: number | null; treatment: string; price: number }[];
}) {
  return (
    <div className="card card-pad grid gap-4 sm:grid-cols-2">
      <Field label="Дата и время *">
        <input type="datetime-local" name="startsAt" required step={300} defaultValue={toInputDateTime(ap?.startsAt ?? defaultStart)} className="input" />
      </Field>
      <Field label="Продолжительность">
        <select name="durationMin" defaultValue={String(ap?.durationMin ?? 60)} className="input">
          {DURATIONS.map((d) => <option key={d} value={d}>{d < 60 ? `${d} мин` : `${d / 60} ч`.replace(".5", ",5")}</option>)}
        </select>
      </Field>
      <ProcedureFields
        prices={prices}
        plan={plan}
        initial={ap ? { procedure: ap.procedure, price: ap.price, toothNumber: ap.toothNumber, treatmentItemId: ap.treatmentItemId } : undefined}
      />
      <Field label="Врач">
        <select name="doctorId" defaultValue={ap?.doctorId ?? defaultDoctorId} className="input">
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Статус"><Select name="status" options={APPOINTMENT_STATUS} defaultValue={ap ? apStatusOpt(ap.status).value : "SCHEDULED"} /></Field>
      <Field label="Комментарий" className="sm:col-span-2"><textarea name="comment" rows={2} defaultValue={ap?.comment ?? ""} className="input" /></Field>
    </div>
  );
}
