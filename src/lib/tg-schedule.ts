import { prisma } from "./db";
import { addDays, parseISODate, startOfDay, toISODate } from "./dates";
import { freeWindows, shiftDays, type ShiftDay } from "./shifts";
import { shortParts } from "./push";

/**
 * Расписание в Telegram-чат через своего бота: на каждую смену — одно сообщение,
 * которое бот сам исправляет, когда в расписании что-то меняется (раз в минуту).
 */

const K = { token: "tg-bot-token", chat: "tg-chat-id", title: "tg-chat-title", chats: "tg-chats-found", relay: "tg-relay-url" };
const msgKey = (date: string) => `tg-msg-${date}`;

const hm = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
const price = (n: number) => n.toLocaleString("de-DE"); // 6000 → 6.000
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function get(key: string) {
  return (await prisma.setting.findUnique({ where: { key } }))?.value ?? null;
}
async function put(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function tgConfig() {
  const [token, chat, title, chats, relay] = await Promise.all([get(K.token), get(K.chat), get(K.title), get(K.chats), get(K.relay)]);
  return { token, chat, title, relay, chats: chats ? (JSON.parse(chats) as { id: string; title: string }[]) : [] };
}

/**
 * Запрос к Telegram. Из российских дата-центров api.telegram.org закрыт, поэтому, если указан
 * «передатчик» (Google Apps Script), запрос идёт через него: база → Google → Telegram.
 */
export async function tgApi<T = unknown>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const relay = await get(K.relay);
  let r: Response;
  try {
    r = relay
      ? await fetch(relay, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ token, method, body: body ?? {} }),
          redirect: "follow",
          signal: AbortSignal.timeout(30000),
        })
      : await fetch(`https://api.telegram.org/bot${token}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
          signal: AbortSignal.timeout(15000),
        });
  } catch (e) {
    // «fetch failed» сам по себе ничего не говорит — показываем настоящую причину
    const c = (e as { cause?: { code?: string; message?: string } }).cause;
    const why = c?.code ?? c?.message ?? (e as Error).message;
    throw new Error(`сервер не смог связаться с Telegram (${why})`);
  }
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(j.description || `HTTP ${r.status}`);
  return j.result as T;
}

/** Текст смены: жирный заголовок, пациенты по времени, свободные окна */
export async function dayText(date: string, shift: ShiftDay | null, html = true) {
  const day = parseISODate(date)!;
  const aps = await prisma.appointment.findMany({
    where: { startsAt: { gte: day, lt: addDays(day, 1) }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    include: { patient: { select: { id: true, lastName: true, firstName: true } } },
    orderBy: { startsAt: "asc" },
  });
  // первичный пациент — раньше не было ни приёмов, ни записей
  const firstTimers = new Set<string>();
  for (const a of aps) {
    const [visits, earlier] = await Promise.all([
      prisma.visit.count({ where: { patientId: a.patientId, date: { lt: day }, OR: [{ source: null }, { source: { not: "plan" } }] } }),
      prisma.appointment.count({ where: { patientId: a.patientId, startsAt: { lt: a.startsAt }, status: { notIn: ["CANCELLED", "NO_SHOW"] } } }),
    ]);
    if (!visits && !earlier) firstTimers.add(a.id);
  }
  const b = (s: string) => (html ? `<b>${s}</b>` : s);
  const e = (s: string) => (html ? esc(s) : s);
  const title = day.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
  const lines: string[] = [b(shift ? `${title} с ${shift.start}-${shift.end}` : title)];

  type Row = { t: number; text: string };
  const rows: Row[] = aps.map((a) => {
    const end = new Date(a.startsAt.getTime() + a.durationMin * 60_000);
    const { what, tooth } = shortParts(a.procedure, a.toothNumber);
    const detail = [firstTimers.has(a.id) ? "первичный пациент" : "", [tooth, what, a.price ? price(a.price) : ""].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return { t: a.startsAt.getTime(), text: `${hm(a.startsAt)}-${hm(end)} ${e(`${a.patient.lastName} ${a.patient.firstName}`.trim())}${detail ? ` (${e(detail)})` : ""}` };
  });
  if (shift) for (const w of freeWindows(shift, aps)) rows.push({ t: w.from.getTime(), text: `💚${hm(w.from)}-${hm(w.to)} Свободное окно` });
  rows.sort((x, y) => x.t - y.t);
  lines.push(...(rows.length ? rows.map((r) => r.text) : ["Записей нет"]));
  return lines.join("\n");
}

/**
 * Раз в минуту: для каждой смены на месяц вперёд — отправить сообщение, если его ещё нет,
 * или исправить, если расписание поменялось. Отменённая смена → «Смены нет».
 */
export async function telegramTick() {
  const { token, chat } = await tgConfig();
  if (!token || !chat) return { sent: 0, edited: 0 };
  const today = startOfDay(new Date());
  const shifts = await shiftDays(today, addDays(today, 31));
  const old = await prisma.setting.findMany({ where: { key: { startsWith: "tg-msg-", gte: msgKey(toISODate(today)) } } });
  const dates = new Set([...shifts.keys(), ...old.map((o) => o.key.slice(7))]);
  let sent = 0, edited = 0;
  for (const date of [...dates].sort()) {
    const shift = shifts.get(date) ?? null;
    const rec = old.find((o) => o.key === msgKey(date));
    const saved = rec ? (JSON.parse(rec.value) as { id: number; text: string }) : null;
    const text = shift ? await dayText(date, shift) : `<b>${parseISODate(date)!.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" })}</b>\nСмены нет`;
    if (saved?.text === text) continue;
    if (saved) {
      try {
        await tgApi(token, "editMessageText", { chat_id: chat, message_id: saved.id, text, parse_mode: "HTML" });
        await put(msgKey(date), JSON.stringify({ id: saved.id, text }));
        edited++;
        continue;
      } catch (e) {
        const m = (e as Error).message;
        if (/not modified/i.test(m)) { await put(msgKey(date), JSON.stringify({ id: saved.id, text })); continue; }
        if (!/not found|can't be edited/i.test(m)) throw e;
        // сообщение удалили в чате — пришлём заново
      }
    }
    if (!shift) { await prisma.setting.deleteMany({ where: { key: msgKey(date) } }); continue; }
    const m = await tgApi<{ message_id: number }>(token, "sendMessage", { chat_id: chat, text, parse_mode: "HTML" });
    await put(msgKey(date), JSON.stringify({ id: m.message_id, text }));
    sent++;
  }
  return { sent, edited };
}

export async function saveTgRelay(url: string) {
  await put(K.relay, url);
}

export async function saveTgToken(token: string) {
  const me = await tgApi<{ username: string }>(token, "getMe");
  await put(K.token, token);
  return me.username;
}

/** Чаты, куда добавили бота (по последним событиям бота) */
export async function findTgChats() {
  const { token } = await tgConfig();
  if (!token) throw new Error("Сначала вставьте ключ бота");
  type Chat = { id: number; title?: string; first_name?: string; type: string };
  type U = { message?: { chat: Chat }; my_chat_member?: { chat: Chat } };
  const ups = await tgApi<U[]>(token, "getUpdates", { allowed_updates: ["message", "my_chat_member"] });
  const map = new Map<string, string>();
  for (const u of ups) {
    const c = u.message?.chat ?? u.my_chat_member?.chat;
    if (c) map.set(String(c.id), c.title ?? c.first_name ?? String(c.id));
  }
  const list = [...map.entries()].map(([id, title]) => ({ id, title }));
  await put(K.chats, JSON.stringify(list));
  return list;
}

export async function chooseTgChat(id: string) {
  const { chats } = await tgConfig();
  const c = chats.find((x) => x.id === id);
  if (!c) return;
  await put(K.chat, c.id);
  await put(K.title, c.title);
  await prisma.setting.deleteMany({ where: { key: { startsWith: "tg-msg-" } } }); // новый чат — сообщения заново
}

export async function disconnectTg() {
  await prisma.setting.deleteMany({ where: { key: { in: [K.token, K.chat, K.title, K.chats] } } });
  await prisma.setting.deleteMany({ where: { key: { startsWith: "tg-msg-" } } });
}
