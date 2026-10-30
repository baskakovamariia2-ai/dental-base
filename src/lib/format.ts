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
