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

const SYSTEM_PROMPT = `Ты помощник врача-стоматолога. Тебе показывают скриншот КЛКТ (конусно-лучевой компьютерной томографии): срез или панорамную реконструкцию.
Найди на снимке зубы и коротко перечисли находки по каждому зубу, где что-то есть. Это черновик для врача, он подтвердит или отклонит каждую находку.
Правила:
- Номера зубов по FDI (11–48). Если номер определить нельзя — "tooth": null.
- Отмечай: признаки кариеса, пломбы, коронки, импланты, штифты, леченые/нелеченые каналы, расширение периодонтальной щели, очаги у верхушек корней, убыль кости, отсутствующие и ретинированные зубы.
- "status" — одно из: CARIES (кариес), FILLING (пломба), CROWN (коронка), IMPLANT (имплант), EXTRACTED (зуб отсутствует), OBSERVATION (нужно понаблюдать: очаг, расширение щели и т.п.), или null.
- "confidence" — "низкая", "средняя" или "высокая".
- Обязательно перечисли все видимые пломбы, коронки, импланты, леченые каналы и отсутствующие зубы, даже если они в порядке. Полностью здоровые зубы без изменений не перечисляй.
- Ничего не выдумывай. Если снимок нечёткий или ты не видишь зубов — верни одну находку с "tooth": null и опиши, что видишь. Пустой массив не возвращай.
- Ответ — ТОЛЬКО JSON-массив, без пояснений, например:
[{"tooth":36,"text":"признаки кариеса на жевательной поверхности","status":"CARIES","confidence":"средняя"},{"tooth":46,"text":"очаг разрежения у верхушки медиального корня","status":"OBSERVATION","confidence":"низкая"}]`;

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
  const m = raw.match(/\[[\s\S]*\]/);
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
  const text = raw.replace(/```(json)?/g, "").trim();
  const shown = !text || text === "[]" ? "ИИ не нашёл на снимке ничего, о чём стоит сообщить." : `Ответ ИИ: ${text}`;
  return [{ tooth: null, text: shown.slice(0, 1000), status: null, confidence: null }];
}

/** Отправляет скриншот в ГигаЧат и возвращает список находок по зубам. Картинка нигде не сохраняется. */
export async function analyzeCtImage(image: Buffer): Promise<Finding[]> {
  const key = await getGigachatKey();
  if (!key) throw new AiError("Не указан ключ ГигаЧата. Его вводят в разделе «Ещё → ИИ для КТ».");
  const token = await getToken(key);

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
          temperature: 0.1,
          max_tokens: 1500,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: "Перечисли находки по зубам на этом снимке.", attachments: [fileId] },
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
