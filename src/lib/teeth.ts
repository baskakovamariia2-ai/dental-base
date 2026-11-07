import type { ToothStatus } from "@prisma/client";

// FDI: верхняя челюсть 18…11 | 21…28; нижняя: 48…41 | 31…38
export const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const ALL_TEETH = [...UPPER, ...LOWER];

export function isValidTooth(n: number) {
  return ALL_TEETH.includes(n);
}

export type ToothKind = "incisor" | "canine" | "premolar" | "molar";
export function toothKind(n: number): ToothKind {
  const d = n % 10;
  if (d <= 2) return "incisor";
  if (d === 3) return "canine";
  if (d <= 5) return "premolar";
  return "molar";
}
export const isUpper = (n: number) => Math.floor(n / 10) === 1 || Math.floor(n / 10) === 2;

// Группы для схемы зубов (как на образце): кариес — зелёный квадратик, пульпит/периодонтит — полоска по каналам,
// под удаление — красный крестик, здоровые — белые.
export type ToothCategory = "extract" | "endo" | "caries" | "problem" | "treated" | "healthy" | "missing";

const RE_EXTRACT = /удален/i;
const RE_ENDO = /пульпит|периодонт|канал/i;
const RE_CARIES = /реставрац|кариес|пломб/i;

export function toothCategory(status: ToothStatus, openTreatments: string[]): ToothCategory {
  if (openTreatments.some((t) => RE_EXTRACT.test(t))) return "extract";
  if (openTreatments.some((t) => RE_ENDO.test(t) && !/реставрац/i.test(t))) return "endo";
  if (openTreatments.some((t) => RE_CARIES.test(t)) || status === "CARIES") return "caries";
  if (openTreatments.length || status === "PLANNED" || status === "IN_TREATMENT") return "problem";
  if (status === "EXTRACTED") return "missing";
  if (status === "FILLING" || status === "TREATED" || status === "CROWN" || status === "IMPLANT") return "treated";
  return "healthy";
}

export const CATEGORY_STYLE: Record<ToothCategory, { label: string; fill: string; stroke: string; bg: string }> = {
  caries: { label: "Кариес зуба", fill: "#FFFFFF", stroke: "#52525B", bg: "#E6F4DA" },
  endo: { label: "Пульпит зуба (периодонтит)", fill: "#FFFFFF", stroke: "#52525B", bg: "#DCEEFF" },
  extract: { label: "Рекомендовано к удалению", fill: "#FFFFFF", stroke: "#52525B", bg: "#FCE4E8" },
  problem: { label: "Коронка / имплант", fill: "#FFFFFF", stroke: "#E8384F", bg: "#FCE4E8" },
  treated: { label: "Вылеченные", fill: "#7C5CFA", stroke: "#7C5CFA", bg: "#E6E1FD" },
  healthy: { label: "Здоровые", fill: "#FFFFFF", stroke: "#52525B", bg: "transparent" },
  missing: { label: "Отсутствует", fill: "#F4F4F5", stroke: "#D4D4D8", bg: "transparent" },
};

export const COLOR = { caries: "#7CB342", endo: "#4DC3BE", cross: "#E53935" };

/** Общая ситуация пациента: считается из схемы и плана, отдельно не хранится */
export function patientStats(
  teeth: { number: number; status: ToothStatus }[],
  plan: { toothNumber: number | null; treatment: string; status: string }[],
) {
  const open = plan.filter((p) => p.status === "PLANNED" || p.status === "IN_PROGRESS");
  const count = (fn: (t: string) => boolean) => open.filter((p) => fn(p.treatment)).length;
  const byNumber = new Map(teeth.map((t) => [t.number, t.status]));
  const cats: Record<ToothCategory, number> = { extract: 0, endo: 0, caries: 0, problem: 0, treated: 0, healthy: 0, missing: 0 };
  for (const n of ALL_TEETH) {
    const tr = open.filter((p) => p.toothNumber === n).map((p) => p.treatment);
    cats[toothCategory(byNumber.get(n) ?? "HEALTHY", tr)]++;
  }
  return {
    caries: count((t) => RE_CARIES.test(t) && !/после лечения каналов/i.test(t)),
    endo: count((t) => RE_ENDO.test(t) && !/реставрац/i.test(t)),
    extraction: count((t) => RE_EXTRACT.test(t)),
    crowns: count((t) => /коронк/i.test(t) && !/— [23]-й приём$/.test(t)),
    problem: cats.extract + cats.endo + cats.caries + cats.problem,
    treated: cats.treated,
    missing: cats.missing,
  };
}
