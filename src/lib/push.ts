import { prisma } from "./db";
import { addDays, startOfDay, toISODate } from "./dates";

type Keys = { publicKey: string; privateKey: string };

async function webpush() {
  return (await import("web-push")).default;
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

export type PushPayload = { title: string; body: string; tag?: string; url?: string };

/** Отправить уведомление на все подписанные телефоны (или только одного пользователя) */
export async function sendPush(payload: PushPayload, userId?: string) {
  const wp = await webpush();
  const keys = await vapidKeys();
  wp.setVapidDetails("mailto:noreply@dental-base.local", keys.publicKey, keys.privateKey);
  const subs = await prisma.pushSubscription.findMany({ where: userId ? { userId } : {} });
  let sent = 0;
  for (const s of subs) {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
    }
  }
  return sent;
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
  const lines = aps.map((a) => {
    const who = `${a.patient.lastName} ${a.patient.firstName ? a.patient.firstName[0] + "." : ""}`.trim();
    const what = [a.procedure, a.toothNumber ? `зуб ${a.toothNumber}` : ""].filter(Boolean).join(", ");
    return `${hhmm(a.startsAt)} ${who}${what ? ` — ${what}` : ""}`;
  });
  return {
    title: `🦷 Сегодня ${n} ${word} · ${hhmm(aps[0].startsAt)}–${hhmm(end)}`,
    body: lines.join("\n"),
    tag: `day-${toISODate(from)}`,
    url: `/schedule?view=day&date=${toISODate(from)}`,
  };
}

/**
 * Раз в минуту: в день приёмов за час до первого пациента присылаем расписание дня (один раз).
 * Если пациентов дописали или перенесли до начала — уведомление обновится (тот же «tag» заменит старое).
 */
export async function pushTick() {
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
