const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function money(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return `${rub.format(v)} ₽`;
}

export function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateLong(d: Date) {
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
}

export function fmtTime(d: Date) {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(d: Date | null | undefined) {
  if (!d) return "—";
  return `${fmtDate(d)}, ${fmtTime(d)}`;
}

export function fmtQty(v: number) {
  return Number.isInteger(v) ? String(v) : v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function fullName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function initials(p: { firstName: string; lastName: string }) {
  return `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase();
}

export function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function whatsappHref(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) digits = "7" + digits.slice(1);
  return `https://wa.me/${digits}`;
}

/** Ссылка в Telegram: по @username или по номеру телефона */
export function telegramHref(p: { telegram?: string | null; phone?: string | null }) {
  const u = p.telegram?.trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  if (u) return `https://t.me/${u}`;
  if (!p.phone) return null;
  let digits = p.phone.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) digits = "7" + digits.slice(1);
  return `https://t.me/+${digits}`;
}

export function fileSize(bytes: number | bigint | null | undefined) {
  const b = Number(bytes ?? 0);
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} КБ`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}
