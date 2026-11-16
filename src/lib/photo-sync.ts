import { prisma } from "./db";
import { isValidTooth } from "./teeth";

/** Номер зуба из подписи: «зуб 47», «47 зуб», «4.7», или подпись — просто «47» */
export function toothFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/(\d)\.(\d)/g, "$1$2");
  const m = t.match(/зуб\w*\s*№?\s*(\d{2})\b/) ?? t.match(/\b(\d{2})\s*зуб/) ?? t.trim().match(/^№?\s*(\d{2})$/);
  const n = m ? Number(m[1]) : NaN;
  return isValidTooth(n) ? n : null;
}

export function stageFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/в процессе|процесс/.test(t)) return "DURING";
  if (/после/.test(t)) return "AFTER";
  if (/(^|\s)до(\s|$)|до лечения/.test(t)) return "BEFORE";
  return null;
}

/**
 * Фото, подписанные вручную («зуб 47», «до лечения»), но без номера зуба в карточке —
 * привязываем к зубу, чтобы они были и в «Файлах», и в карточке зуба, и в плане.
 */
export async function syncPhotoTeeth(patientId: string) {
  const files = await prisma.patientFile.findMany({
    where: { patientId, category: "PHOTO", toothNumber: null, jaw: null },
    select: { id: true, comment: true, photoTag: true, stage: true },
  });
  for (const f of files) {
    const text = `${f.photoTag ?? ""} ${f.comment ?? ""}`;
    const tooth = toothFromText(f.comment) ?? toothFromText(f.photoTag);
    const stage = f.stage ?? stageFromText(text);
    if (!tooth && stage === f.stage) continue;
    await prisma.patientFile.update({ where: { id: f.id }, data: { ...(tooth ? { toothNumber: tooth } : {}), ...(stage ? { stage } : {}) } });
  }
}
