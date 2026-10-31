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
