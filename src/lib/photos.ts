export const PHOTO_STAGES = [
  { value: "BEFORE", label: "До" },
  { value: "DURING", label: "В процессе" },
  { value: "AFTER", label: "После" },
] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number]["value"];

export const PHOTO_JAWS = [
  { value: "UPPER", label: "Все зубы сверху" },
  { value: "LOWER", label: "Все зубы снизу" },
] as const;

export const stageLabel = (s: string | null | undefined) => PHOTO_STAGES.find((x) => x.value === s)?.label ?? null;
export const jawLabel = (s: string | null | undefined) => PHOTO_JAWS.find((x) => x.value === s)?.label ?? null;

/** Подпись фото: «Зуб 36 · До», «Все зубы сверху · После» */
export function photoCaption(f: { toothNumber: number | null; stage: string | null; jaw: string | null; photoTag: string | null }) {
  const where = f.toothNumber ? `Зуб ${f.toothNumber}` : jawLabel(f.jaw);
  const parts = [where, stageLabel(f.stage)].filter(Boolean);
  return parts.length ? parts.join(" · ") : f.photoTag;
}
