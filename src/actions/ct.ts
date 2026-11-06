"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ToothStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { str } from "@/lib/forms";
import { isValidTooth } from "@/lib/teeth";
import { AI_STATUSES, AiError, KEY_SETTING, PROMPT_SETTING, getGigachatKey, testKey } from "@/lib/gigachat";

/** Врач подтвердил находку: записываем в карту зуба (заметка + по желанию состояние) и убираем из списка */
export async function confirmFinding(id: string, formData: FormData) {
  await requireUser();
  const f = await prisma.ctFinding.findUnique({ where: { id } });
  if (!f) return;
  const tooth = Number(str(formData, "tooth"));
  const text = str(formData, "text", 500) || f.text;
  const statusRaw = str(formData, "status");
  const status = (AI_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as ToothStatus) : null;

  if (isValidTooth(tooth)) {
    const where = { patientId_number: { patientId: f.patientId, number: tooth } };
    const line = `КТ: ${text}`;
    const existing = await prisma.tooth.findUnique({ where });
    const notes = !existing?.notes ? line : existing.notes.includes(line) ? existing.notes : `${existing.notes}\n${line}`;
    await prisma.tooth.upsert({
      where,
      create: { patientId: f.patientId, number: tooth, notes, ...(status ? { status } : {}) },
      update: { notes, ...(status ? { status } : {}) },
    });
  } else {
    // без номера зуба — в общие заметки пациента
    const p = await prisma.patient.findUnique({ where: { id: f.patientId }, select: { notes: true } });
    const line = `КТ: ${text}`;
    await prisma.patient.update({ where: { id: f.patientId }, data: { notes: p?.notes ? `${p.notes}\n${line}` : line } });
  }
  await prisma.ctFinding.delete({ where: { id } });
  revalidatePath(`/patients/${f.patientId}`);
}

export async function rejectFinding(id: string) {
  await requireUser();
  const f = await prisma.ctFinding.delete({ where: { id } }).catch(() => null);
  if (f) revalidatePath(`/patients/${f.patientId}`);
}

export async function rejectAllFindings(patientId: string) {
  await requireUser();
  await prisma.ctFinding.deleteMany({ where: { patientId } });
  revalidatePath(`/patients/${patientId}`);
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
    // при ошибке связи ключ всё равно сохраняем, чтобы не вводить заново
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

/** Инструкция для ИИ (что искать на снимке). Пусто или «Вернуть исходную» — стандартная. */
export async function saveCtPrompt(formData: FormData) {
  await requireUser();
  const value = str(formData, "prompt", 4000);
  if (formData.get("reset") === "1" || !value) await prisma.setting.deleteMany({ where: { key: PROMPT_SETTING } });
  else await prisma.setting.upsert({ where: { key: PROMPT_SETTING }, create: { key: PROMPT_SETTING, value }, update: { value } });
  redirect("/more?ai=prompt#ai");
}
