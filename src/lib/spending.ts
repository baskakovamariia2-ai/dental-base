import { prisma } from "./db";

/** Сколько потратили за период: свои траты + покупки на склад (кол-во × цена) */
export async function spendingBetween(from: Date, to: Date): Promise<number> {
  const [exp, pur] = await Promise.all([
    prisma.expense.aggregate({ where: { date: { gte: from, lt: to } }, _sum: { amount: true } }),
    prisma.purchase.findMany({ where: { date: { gte: from, lt: to } }, select: { quantity: true, price: true } }),
  ]);
  return (exp._sum.amount ?? 0) + pur.reduce((s, p) => s + Math.round(p.quantity * p.price), 0);
}
