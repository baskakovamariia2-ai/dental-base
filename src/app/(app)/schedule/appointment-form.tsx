import type { Appointment, User } from "@prisma/client";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { toInputDateTime } from "@/lib/dates";
import { Field, Select } from "@/components/ui";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export function AppointmentFields({
  ap,
  doctors,
  defaultDoctorId,
  defaultStart,
}: {
  ap?: Appointment;
  doctors: User[];
  defaultDoctorId: string;
  defaultStart: Date;
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
      <Field label="Процедура *" className="sm:col-span-2">
        <input name="procedure" required defaultValue={ap?.procedure ?? ""} placeholder="Лечение 36 зуба" className="input" list="procedures" />
        <datalist id="procedures">
          {["Консультация", "Диагностика", "Лечение кариеса", "Профессиональная гигиена", "Контрольный осмотр", "Удаление", "Имплантация"].map((p) => <option key={p} value={p} />)}
        </datalist>
      </Field>
      <Field label="Врач">
        <select name="doctorId" defaultValue={ap?.doctorId ?? defaultDoctorId} className="input">
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Статус"><Select name="status" options={APPOINTMENT_STATUS} defaultValue={ap?.status ?? "SCHEDULED"} /></Field>
      <Field label="Комментарий" className="sm:col-span-2"><textarea name="comment" rows={2} defaultValue={ap?.comment ?? ""} className="input" /></Field>
    </div>
  );
}
