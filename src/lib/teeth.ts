import type { ToothStatus } from "@prisma/client";

// FDI: верхняя челюсть справа налево для зрителя: 18…11 | 21…28; нижняя: 48…41 | 31…38
export const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const ALL_TEETH = [...UPPER, ...LOWER];

export function isValidTooth(n: number) {
  return ALL_TEETH.includes(n);
}

export type ToothLike = { number: number; status: ToothStatus };

/** Статистика пациента считается только из зубной схемы — никогда не хранится отдельно */
export function teethStats(teeth: ToothLike[]) {
  const count = (...s: ToothStatus[]) => teeth.filter((t) => s.includes(t.status)).length;
  return {
    caries: count("CARIES"),
    toTreat: count("CARIES", "PLANNED", "IN_TREATMENT"),
    inTreatment: count("IN_TREATMENT"),
    treated: count("TREATED"),
    fillings: count("FILLING"),
    crowns: count("CROWN"),
    implants: count("IMPLANT"),
    extracted: count("EXTRACTED"),
    observation: count("OBSERVATION"),
    present: 32 - count("EXTRACTED"),
  };
}
