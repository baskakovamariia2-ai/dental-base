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

// ── Детали для схем: сколько каналов и где кариес (медиально / дистально / жевательная) ──

export type CariesSide = "m" | "d" | "c";
export type ToothInfo = { category: ToothCategory; canals: number; caries: CariesSide[] };

/** Сосед в сторону середины (медиальный) и наружу (дистальный) */
export function mesialNeighbor(n: number): number | null {
  const q = Math.floor(n / 10), d = n % 10;
  if (d > 1) return n - 1;
  return { 1: 21, 2: 11, 3: 41, 4: 31 }[q] ?? null;
}
export function distalNeighbor(n: number): number | null {
  return n % 10 < 8 ? n + 1 : null;
}

const canalsIn = (t: string) => {
  const m = /(\d|один|одного|два|двух|три|тр[её]х|четыре|четыр[её]х)\s*-?\s*канал/i.exec(t);
  if (!m) return null;
  const w: Record<string, number> = { один: 1, одного: 1, два: 2, двух: 2, три: 3, трех: 3, трёх: 3, четыре: 4, четырех: 4, четырёх: 4 };
  return /^\d$/.test(m[1]) ? Number(m[1]) : w[m[1].toLowerCase()] ?? null;
};

export function buildToothInfo(
  teeth: { number: number; status: ToothStatus; notes?: string | null }[],
  items: { toothNumber: number | null; treatment: string; status: string; note?: string | null; internalNote?: string | null }[],
): (n: number) => ToothInfo {
  const open = items.filter((i) => i.toothNumber !== null && (i.status === "PLANNED" || i.status === "IN_PROGRESS"));
  const statusOf = new Map(teeth.map((t) => [t.number, t.status]));
  const toothNote = new Map(teeth.map((t) => [t.number, t.notes ?? ""]));
  const cariesItems = (n: number) => open.filter((i) => i.toothNumber === n && RE_CARIES.test(i.treatment) && !/после лечения каналов/i.test(i.treatment));
  const hasCaries = (n: number | null) => n !== null && (cariesItems(n).length > 0 || statusOf.get(n) === "CARIES");
  const cache = new Map<number, ToothInfo>();
  return (n: number) => {
    const hit = cache.get(n);
    if (hit) return hit;
    const mine = open.filter((i) => i.toothNumber === n);
    const category = toothCategory(statusOf.get(n) ?? "HEALTHY", mine.map((i) => i.treatment));
    const canals = Math.max(1, ...mine.filter((i) => RE_ENDO.test(i.treatment) && !/реставрац/i.test(i.treatment)).map((i) => canalsIn(i.treatment) ?? 1));
    const sides = new Set<CariesSide>();
    for (const it of cariesItems(n)) {
      const note = `${it.internalNote ?? ""} ${it.note ?? ""} ${toothNote.get(n) ?? ""}`.toLowerCase();
      if (/дистал/.test(note)) sides.add("d");
      if (/медиал/.test(note)) sides.add("m");
      if (/контакт|апроксим/.test(note)) {
        const m = hasCaries(mesialNeighbor(n)), d = hasCaries(distalNeighbor(n));
        if (m) sides.add("m");
        if (d) sides.add("d");
        if (!m && !d) sides.add("d");
      }
      if (/жеват|окклюз/.test(note) || !/дистал|медиал|контакт|апроксим/.test(note)) sides.add("c");
    }
    if (!sides.size && category === "caries") sides.add("c");
    const info = { category, canals, caries: [...sides] };
    cache.set(n, info);
    return info;
  };
}
