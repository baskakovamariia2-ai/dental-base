import type { User, Visit } from "@prisma/client";
import { toISODate } from "@/lib/dates";
import { Field } from "@/components/ui";

export function VisitFields({ visit, doctors, defaultDoctorId }: { visit?: Visit; doctors: User[]; defaultDoctorId: string }) {
  return (
    <>
      <div className="card card-pad grid gap-4 sm:grid-cols-2">
        <Field label="Дата"><input type="date" name="date" defaultValue={toISODate(visit?.date ?? new Date())} className="input" required /></Field>
        <Field label="Врач">
          <select name="doctorId" defaultValue={visit?.doctorId ?? defaultDoctorId} className="input">
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Причина визита" className="sm:col-span-2"><input name="reason" defaultValue={visit?.reason ?? ""} placeholder="Лечение 36 зуба" className="input" /></Field>
        <Field label="Какие зубы лечили"><input name="teeth" defaultValue={visit?.teeth ?? ""} placeholder="36, 37" className="input" /></Field>
        <Field label="Диагноз"><input name="diagnosis" defaultValue={visit?.diagnosis ?? ""} placeholder="Средний кариес" className="input" /></Field>
      </div>
      <div className="card card-pad space-y-4">
        <Field label="Что было сделано"><textarea name="workDone" rows={4} defaultValue={visit?.workDone ?? ""} placeholder={"Проведена анестезия.\nУдалены кариозные ткани.\nВыполнена композитная реставрация."} className="input" /></Field>
        <Field label="Использованные материалы"><textarea name="materials" rows={2} defaultValue={visit?.materials ?? ""} className="input" /></Field>
        <Field label="Рекомендации"><textarea name="recommendations" rows={2} defaultValue={visit?.recommendations ?? ""} className="input" /></Field>
      </div>
      <div className="card card-pad grid gap-4 sm:grid-cols-2">
        <Field label="Стоимость, ₽"><input name="cost" inputMode="numeric" defaultValue={visit?.cost ?? ""} className="input" /></Field>
        <Field label="Комментарий"><input name="comment" defaultValue={visit?.comment ?? ""} className="input" /></Field>
      </div>
    </>
  );
}
