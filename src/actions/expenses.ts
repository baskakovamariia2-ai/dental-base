"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseISODate, startOfDay } from "@/lib/dates";
import { EXPENSE_CATEGORY } from "@/lib/expenses";

export async function addExpense(formData: FormData) {
  await requireUser();
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const amount = Math.round(Number(String(formData.get("amount") ?? "").replace(/[\s₽]/g, "").replace(",", ".")));
  if (!title || !Number.isFinite(amount) || amount <= 0) return;
  const cat = String(formData.get("category") ?? "OTHER");
  await prisma.expense.create({
    data: {
      title,
      amount,
      date: parseISODate(String(formData.get("date") ?? "")) ?? startOfDay(new Date()),
      category: cat in EXPENSE_CATEGORY ? cat : "OTHER",
      comment: String(formData.get("comment") ?? "").trim().slice(0, 500) || null,
    },
  });
  revalidatePath("/expenses");
}

export async function deleteExpense(id: string) {
  await requireUser();
  await prisma.expense.deleteMany({ where: { id } });
  revalidatePath("/expenses");
}
