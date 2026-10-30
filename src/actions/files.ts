"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { optStr, str } from "@/lib/forms";
import { parseISODate } from "@/lib/dates";
import { removeFile } from "@/lib/storage";

/** КТ и другие исследования — ссылкой (например, на сообщение в Telegram) */
export async function addFileLink(patientId: string, formData: FormData) {
  await requireUser();
  const url = str(formData, "url", 1000);
  if (!/^https?:\/\//i.test(url) && !/^tg:\/\//i.test(url)) return;
  await prisma.patientFile.create({
    data: {
      patientId,
      category: "CT",
      title: str(formData, "title", 200) || "КТ",
      url,
      date: parseISODate(str(formData, "date")) ?? new Date(),
      comment: optStr(formData, "comment", 1000),
    },
  });
  revalidatePath(`/patients/${patientId}`);
}

export async function deletePatientFile(id: string) {
  await requireUser();
  const f = await prisma.patientFile.delete({ where: { id } });
  await removeFile(f.storageKey);
  revalidatePath(`/patients/${f.patientId}`);
}
