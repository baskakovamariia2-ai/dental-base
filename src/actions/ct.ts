"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { optStr, str } from "@/lib/forms";
import { removeFile } from "@/lib/storage";
import { runCtAnalysis } from "@/lib/ct";
import { AiError, KEY_SETTING, getGigachatKey, testKey } from "@/lib/gigachat";

/** Заключение врача по срезу. По желанию — записать его в карту зуба. */
export async function saveCtConclusion(noteId: string, formData: FormData) {
  await requireUser();
  const doctorText = optStr(formData, "doctorText", 3000);
  const note = await prisma.ctNote.update({ where: { id: noteId }, data: { doctorText } });
  if (doctorText && note.toothNumber && formData.get("toTooth") === "1") {
    // дописываем в заметку зуба (она видна в зубной схеме), не стирая то, что там было
    const where = { patientId_number: { patientId: note.patientId, number: note.toothNumber } };
    const line = `КТ: ${doctorText}`;
    const tooth = await prisma.tooth.findUnique({ where });
    if (!tooth) await prisma.tooth.create({ data: { patientId: note.patientId, number: note.toothNumber, notes: line } });
    else if (!(tooth.notes ?? "").includes(line)) {
      await prisma.tooth.update({ where, data: { notes: tooth.notes ? `${tooth.notes}\n${line}` : line } });
    }
  }
  revalidatePath(`/patients/${note.patientId}`);
}

export async function retryCtNote(noteId: string) {
  await requireUser();
  const note = await prisma.ctNote.findUnique({ where: { id: noteId } });
  if (!note) return;
  await runCtAnalysis(noteId);
  revalidatePath(`/patients/${note.patientId}`);
}

export async function deleteCtNote(noteId: string) {
  await requireUser();
  const note = await prisma.ctNote.findUnique({ where: { id: noteId }, include: { file: true } });
  if (!note) return;
  await prisma.patientFile.delete({ where: { id: note.fileId } }); // заметка удалится вместе с картинкой
  await removeFile(note.file.storageKey);
  revalidatePath(`/patients/${note.patientId}`);
}

/** Ключ ГигаЧата — только администратор */
export async function saveGigachatKey(formData: FormData) {
  await requireRole("OWNER");
  if (formData.get("remove") === "1") {
    await prisma.setting.deleteMany({ where: { key: KEY_SETTING } });
    redirect("/more?ai=removed#ai");
  }
  const value = str(formData, "key", 500).replace(/^Basic\s+/i, "");
  if (!value) redirect("/more?ai=empty#ai");
  try {
    await testKey(value);
  } catch (e) {
    const code = e instanceof AiError && /не подходит/.test(e.message) ? "bad" : "net";
    // ключ сохраняем даже при ошибке связи, чтобы не вводить заново
    if (code === "net") await prisma.setting.upsert({ where: { key: KEY_SETTING }, create: { key: KEY_SETTING, value }, update: { value } });
    redirect(`/more?ai=${code}#ai`);
  }
  await prisma.setting.upsert({ where: { key: KEY_SETTING }, create: { key: KEY_SETTING, value }, update: { value } });
  redirect("/more?ai=ok#ai");
}

export async function checkGigachatKey() {
  await requireRole("OWNER");
  const key = await getGigachatKey();
  if (!key) redirect("/more?ai=empty#ai");
  try {
    await testKey(key);
  } catch (e) {
    redirect(`/more?ai=${e instanceof AiError && /не подходит/.test(e.message) ? "bad" : "net"}#ai`);
  }
  redirect("/more?ai=ok#ai");
}
