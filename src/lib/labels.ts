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

/** Варианты в форме пациента */
export const PATIENT_SOURCE: Opt<PatientSource>[] = [
  { value: "FRIENDS", label: "Знакомые", cls: "" },
  { value: "REFERRAL", label: "Рекомендация пациента", cls: "" },
  { value: "INSTAGRAM", label: "Instagram", cls: "" },
  { value: "OTHER", label: "Другое", cls: "" },
];
/** Для отображения старых записей (Яндекс/2ГИС больше не выбираются, показываются как «Другое») */
export const PATIENT_SOURCE_ALL: Opt<PatientSource>[] = [
  ...PATIENT_SOURCE,
  { value: "YANDEX", label: "Другое", cls: "" },
  { value: "TWOGIS", label: "Другое", cls: "" },
];

/** Статусы записи: только три */
export const APPOINTMENT_STATUS: Opt<AppointmentStatus>[] = [
  { value: "SCHEDULED", label: "Запланирован", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  { value: "CANCELLED", label: "Отменён", cls: "bg-zinc-50 text-zinc-400 ring-zinc-200 line-through" },
  { value: "DONE", label: "Завершён", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
];
/** Старые статусы показываем как ближайший из трёх */
export function apStatusOpt(s: AppointmentStatus) {
  const v: AppointmentStatus = s === "DONE" ? "DONE" : s === "CANCELLED" || s === "NO_SHOW" ? "CANCELLED" : "SCHEDULED";
  return APPOINTMENT_STATUS.find((o) => o.value === v)!;
}

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

export const STOCK_LEVEL: { value: "PLENTY" | "ENOUGH" | "LOW" | "OUT"; label: string; cls: string }[] = [
  { value: "PLENTY", label: "Много", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { value: "ENOUGH", label: "Есть", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  { value: "LOW", label: "Мало", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  { value: "OUT", label: "Нет", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
];

export const ROLE_LABEL: Record<string, string> = { OWNER: "Администратор", DOCTOR: "Врач", ASSISTANT: "Ассистент" };

export const FILE_CATEGORY: { value: "CT" | "XRAY" | "PHOTO" | "DOCUMENT" | "OTHER"; label: string }[] = [
  { value: "PHOTO", label: "Фото" },
  { value: "XRAY", label: "Рентген" },
  { value: "CT", label: "КТ" },
  { value: "DOCUMENT", label: "Документы" },
  { value: "OTHER", label: "Другое" },
];

export const PHOTO_TAGS = ["До лечения", "После лечения", "Отдельный зуб", "Другое"];
