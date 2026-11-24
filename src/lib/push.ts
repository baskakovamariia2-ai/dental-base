import { prisma } from "./db";
import { addDays, startOfDay, toISODate } from "./dates";

type Keys = { publicKey: string; privateKey: string };

// web-push загружаем «как есть» из node_modules во время работы, без упаковки сборщиком
async function webpush() {
  const m = (await import(/* webpackIgnore: true */ "web-push")) as { default?: unknown };
  return ((m.default ?? m) as typeof import("web-push").default);
}

/** Ключи для уведомлений — создаются один раз и хранятся в базе */
export async function vapidKeys(): Promise<Keys> {
  const s = await prisma.setting.findUnique({ where: { key: "push-vapid" } });
  if (s) return JSON.parse(s.value) as Keys;
  const keys = (await webpush()).generateVAPIDKeys();
  try {
    await prisma.setting.create({ data: { key: "push-vapid", value: JSON.stringify(keys) } });
    return keys;
  } catch {
    const again = await prisma.setting.findUniqueOrThrow({ where: { key: "push-vapid" } });
    return JSON.parse(again.value) as Keys;
  }
}

/** Запомнить адрес сайта (https://…), с которого открыта база — нужен для подписи уведомлений */
export async function rememberOrigin(req: Request) {
  const h = req.headers;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host) || /localhost|^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(host)) return;
  const value = `https://${host}`;
  await prisma.setting.upsert({ where: { key: "push-origin" }, create: { key: "push-origin", value }, update: { value } }).catch(() => {});
}

export type PushPayload = { title: string; body: string; tag?: string; url?: string };

/** Отправить уведомление на все подписанные телефоны (или только одного пользователя) */
export async function sendPush(payload: PushPayload, userId?: string) {
  const wp = await webpush();
  const keys = await vapidKeys();
  // Apple требует настоящий адрес в «sub» — берём адрес сайта базы (почту наружу не отправляем)
  const origin = (await prisma.setting.findUnique({ where: { key: "push-origin" } }))?.value;
  wp.setVapidDetails(origin && /^https:\/\/[^/]+$/.test(origin) ? origin : "mailto:admin@example.com", keys.publicKey, keys.privateKey);
  const subs = await prisma.pushSubscription.findMany({ where: userId ? { userId } : {} });
  let sent = 0;
  const errors: string[] = [];
  for (const s of subs) {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "high" });
      sent++;
    } catch (e) {
      const err = e as { statusCode?: number; body?: string; message?: string };
      const code = err.statusCode;
      errors.push(`${code ?? "—"} ${(err.body || err.message || "").toString().slice(0, 200)}`);
      console.error("push send", code, err.body || err.message);
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
    }
  }
  return { sent, errors, total: subs.length };
}

/** «37 — Реставрация (кариес)» + зуб 37 → «кариес 37» */
export function shortWhat(procedure: string | null | undefined, tooth: number | null | undefined) {
  let p = (procedure ?? "").trim();
  let t = tooth ? String(tooth) : "";
  const m = p.match(/^(\d{2})\s*[—–-]\s*/);
  if (m) { t ||= m[1]; p = p.slice(m[0].length); }
  const l = p.toLowerCase();
  let w =
    /кариес/.test(l) ? "кариес" :
    /пульпит/.test(l) ? "пульпит" :
    /периодонтит/.test(l) ? "периодонтит" :
    /после лечения каналов/.test(l) ? "реставрация" :
    /консультац|осмотр/.test(l) ? "консультация" :
    /гигиен|чистк/.test(l) ? "гигиена" :
    /удален/.test(l) ? "удаление" :
    /отбел/.test(l) ? "отбеливание" :
    /коронк/.test(l) ? "коронка" :
    /вкладк/.test(l) ? "вкладка" :
    l.replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (w.length > 20) w = w.slice(0, 19).trimEnd() + "…";
  if (t) w = w.replace(new RegExp(`\\b(зуб\\s*)?${t}\\b`), "").trim();
  return w ? [w, t].filter(Boolean).join(" ") : t ? `зуб ${t}` : "";
}

const hhmm = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

/** Текст уведомления: все пациенты дня по времени */
export async function dayScheduleMessage(day: Date): Promise<PushPayload | null> {
  const from = startOfDay(day);
  const aps = await prisma.appointment.findMany({
    where: { startsAt: { gte: from, lt: addDays(from, 1) }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    include: { patient: { select: { lastName: true, firstName: true } } },
    orderBy: { startsAt: "asc" },
  });
  if (!aps.length) return null;
  const last = aps[aps.length - 1];
  const end = new Date(last.startsAt.getTime() + last.durationMin * 60_000);
  const n = aps.length;
  const word = n % 10 === 1 && n % 100 !== 11 ? "пациент" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "пациента" : "пациентов";
  // коротко, чтобы каждый пациент помещался в одну строку на заблокированном экране
  const lines = aps.map((a) => `${hhmm(a.startsAt)} ${a.patient.lastName} · ${shortWhat(a.procedure, a.toothNumber)}`.replace(/ · $/, ""));
  return {
    title: `🦷 ${n} ${word} · ${hhmm(aps[0].startsAt)}–${hhmm(end)}`,
    body: lines.join("\n"),
    tag: `day-${toISODate(from)}`,
    url: `/schedule?view=day&date=${toISODate(from)}`,
  };
}

/**
 * Накануне приёмов в 15:00 — напоминание «напишите пациентам в Telegram» со списком тех,
 * кому ещё не напомнили. Нажатие открывает завтрашний день, где у каждого кнопка «Напомнить в Telegram».
 */
export async function remindTick() {
  const now = new Date();
  if (now.getHours() < 15 || now.getHours() >= 22) return;
  const tomorrow = addDays(startOfDay(now), 1);
  const key = `push-remind-${toISODate(tomorrow)}`;
  if (await prisma.setting.findUnique({ where: { key } })) return;
  const aps = await prisma.appointment.findMany({
    where: { startsAt: { gte: tomorrow, lt: addDays(tomorrow, 1) }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    include: { patient: { select: { lastName: true, firstName: true } } },
    orderBy: { startsAt: "asc" },
  });
  const todo = aps.filter((a) => !a.reminderSent);
  await prisma.setting.create({ data: { key, value: String(todo.length) } }).catch(() => {});
  if (!todo.length || (await prisma.pushSubscription.count()) === 0) return;
  const n = todo.length;
  const word = n % 10 === 1 && n % 100 !== 11 ? "пациенту" : "пациентам";
  await sendPush({
    title: `💬 Напомните ${n} ${word} о завтрашнем приёме`,
    body: todo.map((a) => `${hhmm(a.startsAt)} ${a.patient.lastName}`).join("\n"),
    tag: `remind-${toISODate(tomorrow)}`,
    url: `/schedule?view=day&date=${toISODate(tomorrow)}`,
  });
}

/**
 * Раз в минуту: в день приёмов за час до первого пациента присылаем расписание дня (один раз).
 * Если пациентов дописали или перенесли до начала — уведомление обновится (тот же «tag» заменит старое).
 */
export async function pushTick() {
  await remindTick().catch((e) => console.error("push remind", e));
  const now = new Date();
  const msg = await dayScheduleMessage(now);
  if (!msg) return;
  const first = await prisma.appointment.findFirst({
    where: { startsAt: { gte: startOfDay(now), lt: addDays(startOfDay(now), 1) }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    orderBy: { startsAt: "asc" },
  });
  if (!first) return;
  const sendAt = first.startsAt.getTime() - 60 * 60_000;
  if (now.getTime() < sendAt || now.getTime() > first.startsAt.getTime() + 6 * 3600_000) return;
  const key = `push-sent-${msg.tag}`;
  const prev = await prisma.setting.findUnique({ where: { key } });
  if (prev && prev.value === msg.body) return; // уже отправлено, расписание не менялось
  if (prev && now.getTime() > first.startsAt.getTime()) return; // смена уже началась — не дёргаем повторно
  await prisma.setting.upsert({ where: { key }, create: { key, value: msg.body }, update: { value: msg.body } });
  if ((await prisma.pushSubscription.count()) === 0) return;
  await sendPush(msg);
}
