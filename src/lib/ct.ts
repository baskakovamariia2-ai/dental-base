import { readFile } from "fs/promises";
import { prisma } from "./db";
import { filePath } from "./storage";
import { AiError, analyzeCtImage } from "./gigachat";

/** Запускает разбор одной заметки и сохраняет результат */
export async function runCtAnalysis(noteId: string) {
  const note = await prisma.ctNote.findUnique({ where: { id: noteId }, include: { file: true } });
  if (!note || !note.file.storageKey) return;
  try {
    const img = await readFile(filePath(note.file.storageKey));
    const aiText = await analyzeCtImage(img, note.toothNumber);
    await prisma.ctNote.update({ where: { id: noteId }, data: { aiText, aiError: null } });
  } catch (e) {
    const aiError = e instanceof AiError ? e.message : "Не удалось получить ответ ИИ. Попробуйте ещё раз.";
    if (!(e instanceof AiError)) console.error("CT analysis failed", e);
    await prisma.ctNote.update({ where: { id: noteId }, data: { aiError } });
  }
}
