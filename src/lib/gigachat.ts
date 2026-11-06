import { randomUUID } from "crypto";
import { prisma } from "./db";

// ГигаЧат (Сбер) — российская нейросеть, данные хранятся на серверах в РФ.
// Ключ авторизации хранится в настройках (вводится в «Ещё → ИИ для КТ»).
// В нейросеть уходит ТОЛЬКО картинка и номер зуба — без ФИО и других данных пациента.

const AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
// Новый и старый адрес API — если один недоступен, пробуем второй
const API_URLS = ["https://api.giga.chat/v1", "https://gigachat.devices.sberbank.ru/api/v1"];
// Модели, которые понимают картинки (от лучшей к запасной)
const MODELS = ["GigaChat-2-Max", "GigaChat-2-Pro"];
export const KEY_SETTING = "gigachatKey";

export class AiError extends Error {}

export async function getGigachatKey(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: KEY_SETTING } });
  return row?.value?.trim() || null;
}

let cached: { key: string; token: string; until: number } | null = null;

function netError(e: unknown): AiError {
  const msg = String((e as { cause?: { code?: string } })?.cause?.code ?? (e as Error)?.message ?? e);
  if (/CERT|SSL|TLS|UNABLE_TO|SELF_SIGNED/i.test(msg)) {
    return new AiError("Сервер не доверяет сертификату Сбера. Обновите приложение командой обновления — сертификат ставится автоматически.");
  }
  return new AiError("Нет связи с ГигаЧатом. Попробуйте ещё раз через минуту.");
}

async function getToken(key: string): Promise<string> {
  if (cached && cached.key === key && cached.until > Date.now() + 60_000) return cached.token;
  let res: Response;
  try {
    res = await fetch(AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        RqUID: randomUUID(),
        Authorization: `Basic ${key.replace(/^Basic\s+/i, "")}`,
      },
      body: "scope=GIGACHAT_API_PERS",
      cache: "no-store",
    });
  } catch (e) {
    throw netError(e);
  }
  if (res.status === 400 || res.status === 401) throw new AiError("Ключ ГигаЧата не подходит. Проверьте, что скопирован «Ключ авторизации» целиком.");
  if (!res.ok) throw new AiError(`ГигаЧат не выдал доступ (код ${res.status}). Попробуйте позже.`);
  const data = (await res.json()) as { access_token: string; expires_at?: number };
  // expires_at приходит в миллисекундах; токен живёт ~30 минут
  cached = { key, token: data.access_token, until: data.expires_at ?? Date.now() + 25 * 60_000 };
  return data.access_token;
}

async function api(path: string, token: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown = null;
  for (const base of API_URLS) {
    try {
      return await fetch(base + path, {
        ...init,
        headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
        cache: "no-store",
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw netError(lastErr);
}

/** Проверка ключа (кнопка «Проверить» в настройках) */
export async function testKey(key: string) {
  cached = null;
  await getToken(key);
}

export type Finding = { tooth: number | null; text: string; status: string | null; confidence: string | null };

// Состояния, которые ИИ может предложить для зубной схемы (врач подтверждает)
export const AI_STATUSES = ["CARIES", "FILLING", "CROWN", "IMPLANT", "EXTRACTED", "OBSERVATION"] as const;

export const PROMPT_SETTING = "ctPrompt";

// Что искать — эту часть можно менять в «Ещё → ИИ для КТ»
export const DEFAULT_CT_PROMPT = `Ты опытный врач-рентгенолог в стоматологии. Тебе показывают скриншот КЛКТ (конусно-лучевой компьютерной томографии): срез или панорамную реконструкцию.
Внимательно посмотри на каждый видимый зуб и перечисли всё, что видишь:
- пломбы, коронки, импланты, штифты;
- леченые и нелеченые каналы;
- кариес — ищи особенно внимательно: участки затемнения (снижения плотности) в эмали и дентине, на жевательных и контактных поверхностях, у шейки зуба и под краем пломб и коронок (вторичный кариес). Даже небольшое подозрение на кариес — отдельная строка;
- расширение периодонтальной щели, очаги разрежения у верхушек корней;
- убыль костной ткани;
- отсутствующие и ретинированные зубы.
Это черновик для врача — он сам проверит каждую строку, поэтому пиши и то, в чём не уверен, с пометкой «уверенность: низкая».`;

// Формат ответа — фиксированный, чтобы программа могла разобрать строки
const FORMAT_RULES = `
Формат ответа (строго):
Первая строка: «Снимок: …» — одной фразой, что изображено (например, «панорамная реконструкция, видны оба зубных ряда»).
Дальше — по одной строке на находку: «<номер зуба по FDI> — <что видно> (уверенность: низкая/средняя/высокая)».
Пример:
Снимок: панорамная реконструкция, видны оба зубных ряда
36 — пломба на жевательной поверхности, под ней возможен вторичный кариес (уверенность: средняя)
46 — каналы запломбированы, у верхушки медиального корня очаг разрежения (уверенность: низкая)
18 — зуб отсутствует (уверенность: высокая)
Если номер зуба определить нельзя, начни строку с «?». Без вступлений и советов по лечению.`;

export async function getCtPrompt(): Promise<{ value: string; custom: boolean }> {
  const row = await prisma.setting.findUnique({ where: { key: PROMPT_SETTING } });
  return row?.value?.trim() ? { value: row.value, custom: true } : { value: DEFAULT_CT_PROMPT, custom: false };
}

/** Угадывает состояние зуба для схемы по словам в находке */
function guessStatus(t: string): string | null {
  const s = t.toLowerCase();
  if (/отсутств|удал[её]н/.test(s)) return "EXTRACTED";
  if (/имплант/.test(s)) return "IMPLANT";
  if (/коронк/.test(s)) return "CROWN";
  if (/кариес/.test(s)) return "CARIES";
  if (/очаг|разрежен|периодонт|гранулём|киста|расширен/.test(s)) return "OBSERVATION";
  if (/пломб/.test(s)) return "FILLING";
  return null;
}

/** Разбирает построчный ответ: «36 — находка (уверенность: средняя)» */
function parseLines(raw: string): Finding[] {
  const out: Finding[] = [];
  for (let line of raw.split(/\r?\n/)) {
    line = line.replace(/^[\s>*•\-–—\d.)]*?(?=(\?|\d{2}\b|снимок|зуб|[А-ЯЁа-яё]))/i, "").replace(/\*\*/g, "").trim();
    if (!line) continue;
    const conf = line.match(/\(?\s*уверенность\s*[:\-–]?\s*(низкая|средняя|высокая)\s*\)?/i);
    const clean = (str: string) => str.replace(/\(?\s*уверенность\s*[:\-–]?\s*(низкая|средняя|высокая)\s*\)?/i, "").replace(/^[\s:—–\-]+/, "").trim();
    const m = line.match(/^(?:зуб\s*)?((?:\d{2}\s*[,и]\s*)*\d{2})\s*[—–\-:]\s*(.+)$/i);
    if (m) {
      const text = clean(m[2]);
      for (const n of m[1].split(/[,и\s]+/).map(Number)) {
        if (n >= 11 && n <= 48 && text) out.push({ tooth: n, text, status: guessStatus(text), confidence: conf?.[1].toLowerCase() ?? null });
      }
      continue;
    }
    if (/^снимок\s*:/i.test(line)) {
      out.push({ tooth: null, text: line, status: null, confidence: null });
      continue;
    }
    if (line.startsWith("?")) {
      const text = clean(line.slice(1));
      if (text) out.push({ tooth: null, text, status: guessStatus(text), confidence: conf?.[1].toLowerCase() ?? null });
    }
  }
  return out.map((f) => ({ ...f, text: f.text.slice(0, 500) })).slice(0, 40);
}

/** Берёт первое непустое строковое поле из списка возможных названий */
function pickText(x: Record<string, unknown>): string {
  for (const k of ["text", "finding", "description", "находка", "описание", "comment", "note"]) {
    if (typeof x[k] === "string" && (x[k] as string).trim()) return (x[k] as string).trim();
  }
  // запасной вариант — любое строковое поле, кроме служебных
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === "string" && v.trim().length > 3 && !["status", "confidence", "уверенность"].includes(k)) return v.trim();
  }
  return "";
}

/** Разбирает ответ модели. Если находок не получилось — весь ответ ИИ становится одной находкой, чтобы врач его увидел. */
export function parseFindings(raw: string): Finding[] {
  const m = raw.trim().startsWith("[") ? raw.match(/\[[\s\S]*\]/) : null;
  if (m) {
    try {
      const arr = JSON.parse(m[0]) as Record<string, unknown>[];
      if (Array.isArray(arr)) {
        const out = arr
          .filter((x) => x && typeof x === "object")
          .map((x) => {
            const t = Number(x.tooth ?? x["зуб"] ?? x.number);
            const st = typeof x.status === "string" ? x.status.toUpperCase() : "";
            return {
              tooth: Number.isInteger(t) && t >= 11 && t <= 48 ? t : null,
              text: pickText(x).slice(0, 500),
              status: (AI_STATUSES as readonly string[]).includes(st) ? st : null,
              confidence: typeof x.confidence === "string" ? x.confidence.slice(0, 20) : null,
            };
          })
          .filter((f) => f.text)
          .slice(0, 32);
        if (out.length) return out;
      }
    } catch {
      /* ниже — запасной вариант */
    }
  }
  // строка «Снимок: …» нужна только для проверки, что ИИ видит зубы — врачу её не показываем
  const lines = parseLines(raw).filter((f) => !/^снимок\s*:/i.test(f.text));
  if (lines.length) return lines;
  const text = raw.replace(/```(json)?/g, "").trim();
  const shown = !text || text === "[]" ? "ИИ ничего не ответил по этому снимку." : `Ответ ИИ: ${text}`;
  return [{ tooth: null, text: shown.slice(0, 1000), status: null, confidence: null }];
}

/** Отправляет скриншот в ГигаЧат и возвращает список находок по зубам. Картинка нигде не сохраняется. */
export async function analyzeCtImage(image: Buffer): Promise<Finding[]> {
  const key = await getGigachatKey();
  if (!key) throw new AiError("Не указан ключ ГигаЧата. Его вводят в разделе «Ещё → ИИ для КТ».");
  const token = await getToken(key);
  const prompt = (await getCtPrompt()).value;

  // 1. Временно загружаем картинку в ГигаЧат (ниже сразу удаляем)
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "ct.jpg");
  fd.append("purpose", "general");
  const up = await api("/files", token, { method: "POST", body: fd });
  if (!up.ok) throw new AiError(`ГигаЧат не принял картинку (код ${up.status}).`);
  const fileId = ((await up.json()) as { id: string }).id;

  try {
    // 2. Спрашиваем модель (если основная недоступна — запасная)
    let lastStatus = 0;
    for (const model of MODELS) {
      const res = await api("/chat/completions", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 1500,
          messages: [
            { role: "system", content: prompt + "\n" + FORMAT_RULES },
            { role: "user", content: "Посмотри на этот снимок и перечисли находки по зубам в указанном формате.", attachments: [fileId] },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new AiError("ГигаЧат вернул пустой ответ. Попробуйте ещё раз.");
        console.log(`[КТ] ответ ${model}:`, text.slice(0, 2000));
        return parseFindings(text);
      }
      lastStatus = res.status;
      if (res.status === 401) {
        cached = null;
        throw new AiError("Доступ к ГигаЧату истёк. Отправьте ещё раз.");
      }
      if (res.status === 402) throw new AiError("Закончились бесплатные токены ГигаЧата. Их можно докупить на developers.sber.ru.");
      if (res.status === 429) throw new AiError("Слишком много запросов. Подождите минуту и отправьте ещё раз.");
    }
    throw new AiError(`ГигаЧат не ответил (код ${lastStatus}). Попробуйте позже.`);
  } finally {
    // 3. Удаляем картинку из хранилища ГигаЧата
    api(`/files/${fileId}/delete`, token, { method: "POST" }).catch(() => {});
  }
}
