import { prisma } from "./db";

/** Врачи для выбора в записи и приёме. Если врачей с ролью «Врач» нет — все активные сотрудники. */
export async function getDoctors() {
  const doctors = await prisma.user.findMany({ where: { isActive: true, role: "DOCTOR" }, orderBy: { createdAt: "asc" } });
  if (doctors.length) return doctors;
  return prisma.user.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
}
