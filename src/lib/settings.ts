import { prisma } from "./db";

export const DEFAULTS = {
  doctorName: "Баскаков Илья Васильевич",
  rentPerDay: "5000",
  sterilizationPerDay: "1000",
} as const;

export type SettingKey = keyof typeof DEFAULTS;

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(DEFAULTS) } } });
  const out = { ...DEFAULTS } as Record<SettingKey, string>;
  for (const r of rows) if (r.value) out[r.key as SettingKey] = r.value;
  return out;
}
