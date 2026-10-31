import { prisma } from "./db";

export const DEFAULT_REMINDER = `Здравствуйте! Напоминаю о приёме {дата}

Адрес: проезд Серебрякова, 2к1
8 этаж
(2 минуты от метро или МЦК)

2 выход метро
или 7 выход МЦК
https://yandex.ru/maps?text=55.846198,37.640411&si=ce55mphpurbhteev6u9rbj5fbr

Ориентир — Botanica Dental Clinic
Кабинет №1
На входе может спросить охранник — нужно сказать «в стоматологию»

Пожалуйста, подготовьте наличные`;

export async function getReminderTemplate() {
  const s = await prisma.setting.findUnique({ where: { key: "reminderTemplate" } });
  return s?.value || DEFAULT_REMINDER;
}

/** «5 ноября (среда) в 14:00» */
export function formatAppointmentDate(d: Date) {
  const day = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const wd = d.toLocaleDateString("ru-RU", { weekday: "long" });
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${day} (${wd}) в ${time}`;
}

export function reminderText(template: string, startsAt: Date) {
  return template.replace(/\{дата\}/g, formatAppointmentDate(startsAt));
}
