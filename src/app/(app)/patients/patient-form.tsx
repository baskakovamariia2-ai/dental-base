import type { Patient } from "@prisma/client";
import { PATIENT_SOURCE, PATIENT_STATUS } from "@/lib/labels";
import { toISODate } from "@/lib/dates";
import { Field, Select } from "@/components/ui";

export function PatientForm({
  action,
  patient,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  patient?: Patient;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="card card-pad grid gap-4 sm:grid-cols-2">
        <Field label="Имя *"><input name="firstName" required defaultValue={patient?.firstName} className="input" autoComplete="off" /></Field>
        <Field label="Фамилия *"><input name="lastName" required defaultValue={patient?.lastName} className="input" autoComplete="off" /></Field>
        <Field label="Отчество"><input name="middleName" defaultValue={patient?.middleName ?? ""} className="input" autoComplete="off" /></Field>
        <Field label="Телефон"><input name="phone" type="tel" inputMode="tel" defaultValue={patient?.phone ?? ""} placeholder="+7" className="input" /></Field>
        <Field label="Дата рождения"><input name="birthDate" type="date" defaultValue={patient?.birthDate ? toISODate(patient.birthDate) : ""} className="input" /></Field>
        <Field label="Дата первого визита">
          <input name="firstVisitDate" type="date" defaultValue={toISODate(patient?.firstVisitDate ?? new Date())} className="input" />
        </Field>
      </div>
      <div className="card card-pad grid gap-4 sm:grid-cols-2">
        <Field label="Откуда узнал о нас? *"><Select name="source" options={PATIENT_SOURCE} defaultValue={patient?.source ?? "INSTAGRAM"} /></Field>
        <Field label="Уточнение (кто порекомендовал и т.п.)"><input name="sourceComment" defaultValue={patient?.sourceComment ?? ""} className="input" /></Field>
        <Field label="Статус"><Select name="status" options={PATIENT_STATUS} defaultValue={patient?.status ?? "NEW"} /></Field>
      </div>
      <div className="card card-pad">
        <Field label="Общие заметки"><textarea name="notes" rows={4} defaultValue={patient?.notes ?? ""} className="input" /></Field>
      </div>
      <button className="btn-primary w-full sm:w-auto">{submitLabel}</button>
    </form>
  );
}
