"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/forms";

export async function saveReminderTemplate(formData: FormData) {
  await requireUser();
  const value = str(formData, "template", 5000);
  if (formData.get("reset") === "1" || !value) await prisma.setting.deleteMany({ where: { key: "reminderTemplate" } });
  else await prisma.setting.upsert({ where: { key: "reminderTemplate" }, create: { key: "reminderTemplate", value }, update: { value } });
  revalidatePath("/", "layout");
  redirect("/more?tpl=ok");
}

const KEYS = ["doctorName", "rentPerDay", "sterilizationPerDay"] as const;

export async function saveSettings(formData: FormData) {
  await requireUser();
  for (const key of KEYS) {
    if (!formData.has(key)) continue;
    let value = str(formData, key, 200);
    if (key !== "doctorName") value = String(Math.max(0, Math.round(Number(value.replace(/\s/g, "")) || 0)));
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  revalidatePath("/", "layout");
  const back = str(formData, "returnTo");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/more?tpl=ok");
}
