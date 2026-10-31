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

// Четыре понятные группы, как на схеме: проблемные / леченые / здоровые / отсутствующие
export type ToothCategory = "problem" | "treated" | "healthy" | "missing";

export function toothCategory(status: ToothStatus, hasOpenPlan: boolean): ToothCategory {
  if (status === "EXTRACTED") return hasOpenPlan ? "problem" : "missing";
  if (hasOpenPlan || status === "CARIES" || status === "PLANNED" || status === "IN_TREATMENT") return "problem";
  if (status === "FILLING" || status === "TREATED" || status === "CROWN" || status === "IMPLANT") return "treated";
  return "healthy";
}

export const CATEGORY_STYLE: Record<ToothCategory, { label: string; fill: string; stroke: string; bg: string }> = {
  problem: { label: "Проблемные", fill: "#E8384F", stroke: "#E8384F", bg: "#FCE4E8" },
  treated: { label: "Леченые", fill: "#7C5CFA", stroke: "#7C5CFA", bg: "#E6E1FD" },
  healthy: { label: "Здоровые", fill: "#FFFFFF", stroke: "#C4C7CE", bg: "transparent" },
  missing: { label: "Отсутствующие", fill: "#F4F4F5", stroke: "#D4D4D8", bg: "transparent" },
};

/** Общая ситуация пациента: считается из схемы и плана, отдельно не хранится */
export function patientStats(
  teeth: { number: number; status: ToothStatus }[],
  plan: { toothNumber: number | null; treatment: string; status: string }[],
) {
  const open = plan.filter((p) => p.status === "PLANNED" || p.status === "IN_PROGRESS");
  const count = (re: RegExp) => open.filter((p) => re.test(p.treatment.toLowerCase())).length;
  const openTeeth = new Set(open.map((p) => p.toothNumber).filter((n): n is number => n !== null));
  const byNumber = new Map(teeth.map((t) => [t.number, t.status]));
  let problem = 0, treated = 0, missing = 0;
  for (const n of ALL_TEETH) {
    const c = toothCategory(byNumber.get(n) ?? "HEALTHY", openTeeth.has(n));
    if (c === "problem") problem++;
    if (c === "treated") treated++;
    if (c === "missing") missing++;
  }
  return {
    caries: count(/реставрац|кариес|пломб/),
    canals: count(/пульпит|канал/) - count(/периодонт.*канал|канал.*периодонт/),
    periodontitis: count(/периодонт/),
    extraction: count(/удален/),
    crowns: count(/коронк/),
    problem,
    treated,
    missing,
  };
}
