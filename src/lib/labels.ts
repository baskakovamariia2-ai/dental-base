import type {
  AppointmentStatus,
  InventoryCategory,
  PatientSource,
  PatientStatus,
  ToothStatus,
  TreatmentStatus,
} from "@prisma/client";

type Opt<T extends string> = { value: T; label: string; cls: string };

export const PATIENT_STATUS: Opt<PatientStatus>[] = [
  { value: "NEW", label: "Новый", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  { value: "IN_TREATMENT", label: "В лечении", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  { value: "OBSERVATION", label: "Наблюдение", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  { value: "COMPLETED", label: "Лечение завершено", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
];

export const PATIENT_SOURCE: Opt<PatientSource>[] = [
  { value: "INSTAGRAM", label: "Instagram", cls: "" },
  { value: "REFERRAL", label: "Рекомендация пациента", cls: "" },
  { value: "YANDEX", label: "Яндекс", cls: "" },
  { value: "TWOGIS", label: "2ГИС", cls: "" },
  { value: "FRIENDS", label: "Знакомые", cls: "" },
  { value: "OTHER", label: "Другое", cls: "" },
];

export const APPOINTMENT_STATUS: Opt<AppointmentStatus>[] = [
  { value: "SCHEDULED", label: "Запланирован", cls: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  { value: "CONFIRMED", label: "Подтверждён", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  { value: "ARRIVED", label: "Пришёл", cls: "bg-teal-50 text-teal-700 ring-teal-200" },
  { value: "IN_PROGRESS", label: "В процессе", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  { value: "DONE", label: "Завершён", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { value: "CANCELLED", label: "Отменён", cls: "bg-zinc-50 text-zinc-400 ring-zinc-200 line-through" },
  { value: "NO_SHOW", label: "Не пришёл", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
];

export const TOOTH_STATUS: (Opt<ToothStatus> & { fill: string; stroke: string })[] = [
  { value: "HEALTHY", label: "Здоров", cls: "bg-white text-zinc-600 ring-zinc-200", fill: "#ffffff", stroke: "#d4d4d8" },
  { value: "CARIES", label: "Кариес", cls: "bg-rose-50 text-rose-700 ring-rose-200", fill: "#fecdd3", stroke: "#e11d48" },
  { value: "PLANNED", label: "Лечение запланировано", cls: "bg-orange-50 text-orange-700 ring-orange-200", fill: "#fed7aa", stroke: "#ea580c" },
  { value: "IN_TREATMENT", label: "Лечится", cls: "bg-amber-50 text-amber-700 ring-amber-200", fill: "#fde68a", stroke: "#d97706" },
  { value: "TREATED", label: "Лечение завершено", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", fill: "#a7f3d0", stroke: "#059669" },
  { value: "FILLING", label: "Пломба", cls: "bg-sky-50 text-sky-700 ring-sky-200", fill: "#bae6fd", stroke: "#0284c7" },
  { value: "CROWN", label: "Коронка", cls: "bg-indigo-50 text-indigo-700 ring-indigo-200", fill: "#c7d2fe", stroke: "#4f46e5" },
  { value: "IMPLANT", label: "Имплант", cls: "bg-slate-100 text-slate-700 ring-slate-300", fill: "#cbd5e1", stroke: "#475569" },
  { value: "EXTRACTED", label: "Удалён", cls: "bg-zinc-100 text-zinc-400 ring-zinc-200", fill: "#f4f4f5", stroke: "#a1a1aa" },
  { value: "OBSERVATION", label: "Наблюдение", cls: "bg-violet-50 text-violet-700 ring-violet-200", fill: "#ddd6fe", stroke: "#7c3aed" },
];

export const TREATMENT_STATUS: Opt<TreatmentStatus>[] = [
  { value: "PLANNED", label: "Запланировано", cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  { value: "IN_PROGRESS", label: "В процессе", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  { value: "DONE", label: "Завершено", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { value: "CANCELLED", label: "Отменено", cls: "bg-zinc-50 text-zinc-400 ring-zinc-200" },
];

export const INVENTORY_CATEGORY: Opt<InventoryCategory>[] = [
  { value: "INSTRUMENTS", label: "Инструменты", cls: "" },
  { value: "CONSUMABLES", label: "Расходники", cls: "" },
  { value: "COMPOSITES", label: "Композиты", cls: "" },
  { value: "ANESTHESIA", label: "Анестезия", cls: "" },
  { value: "PROTECTION", label: "Средства защиты", cls: "" },
  { value: "MATERIALS", label: "Материалы", cls: "" },
  { value: "OTHER", label: "Другое", cls: "" },
];

export function findOpt<T extends string, O extends { value: T }>(list: O[], v: T): O {
  return list.find((o) => o.value === v) ?? list[0];
}

export const values = <T extends string>(list: { value: T }[]) => list.map((o) => o.value);
