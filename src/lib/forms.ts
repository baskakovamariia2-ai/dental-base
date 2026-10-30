// Безопасное чтение значений из FormData

export function str(fd: FormData, key: string, max = 2000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function optStr(fd: FormData, key: string, max = 2000): string | null {
  const v = str(fd, key, max);
  return v === "" ? null : v;
}

export function int(fd: FormData, key: string, fallback = 0): number {
  const v = str(fd, key).replace(/\s/g, "").replace(",", ".");
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== "" ? n : fallback;
}

export function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace(/\s/g, "").replace(",", ".");
  if (v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
}

export function num(fd: FormData, key: string, fallback = 0): number {
  const v = str(fd, key).replace(/\s/g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) && v !== "" ? n : fallback;
}

export function oneOf<T extends string>(fd: FormData, key: string, values: readonly T[], fallback: T): T {
  const v = str(fd, key);
  return (values as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Только относительные пути внутри приложения — защита от open redirect */
export function safeReturn(fd: FormData, fallback: string) {
  const v = str(fd, "returnTo");
  return v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}
