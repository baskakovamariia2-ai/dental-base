import { prisma } from "./db";

/** Поиск по телефону без учёта пробелов, скобок, дефисов и +7/8 */
export async function patientIdsByPhone(input: string): Promise<string[]> {
  let digits = input.replace(/\D/g, "");
  if (digits.length >= 11) digits = digits.slice(-10);
  if (digits.length < 3) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Patient"
    WHERE regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE ${"%" + digits + "%"}
    LIMIT 200`;
  return rows.map((r) => r.id);
}
