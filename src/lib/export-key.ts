import { randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./db";

const KEY = "exportKey";

/** Секретный ключ для ссылок, по которым Google Таблица забирает данные из базы */
export async function getExportKey(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (row?.value) return row.value;
  const value = randomBytes(24).toString("hex");
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return value;
}

export async function resetExportKeyValue() {
  const value = randomBytes(24).toString("hex");
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

export async function checkExportKey(given: string | null): Promise<boolean> {
  if (!given) return false;
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!row?.value) return false;
  const a = Buffer.from(row.value);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
