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

const SYSTEM_PROMPT = `Ты помощник врача-стоматолога. Тебе показывают фрагмент КЛКТ (конусно-лучевой компьютерной томографии) или панорамную реконструкцию.
Твоя задача — коротко перечислить, что видно на снимке, чтобы врач обратил на это внимание. Это черновик для врача, а не диагноз для пациента.
Правила:
- Номера зубов по FDI (11–48).
- Отмечай: признаки кариеса, пломбы, коронки, импланты, штифты, леченые/нелеченые каналы, расширение периодонтальной щели, очаги в области верхушек корней, убыль костной ткани, отсутствующие и ретинированные зубы.
- Для каждой находки укажи уверенность: низкая / средняя / высокая.
- Если что-то не видно или снимок нечёткий — так и напиши. Ничего не выдумывай.
- Формат: от 1 до 8 коротких строк вида «36 — признаки кариеса на жевательной поверхности (уверенность: средняя)».
- Без вступления, без советов по лечению, без дисклеймеров.`;

/** Отправляет картинку в ГигаЧат и возвращает короткий текст-подсказку */
export async function analyzeCtImage(image: Buffer, toothNumber: number | null): Promise<string> {
  const key = await getGigachatKey();
  if (!key) throw new AiError("Не указан ключ ГигаЧата. Его вводят в разделе «Ещё → ИИ для КТ».");
  const token = await getToken(key);

  // 1. Загружаем картинку во временное хранилище ГигаЧата
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "ct.jpg");
  fd.append("purpose", "general");
  const up = await api("/files", token, { method: "POST", body: fd });
  if (!up.ok) throw new AiError(`ГигаЧат не принял картинку (код ${up.status}).`);
  const fileId = ((await up.json()) as { id: string }).id;

  try {
    const question = toothNumber
      ? `На снимке зуб ${toothNumber} (и, возможно, соседние). Что видно?`
      : "Что видно на этом снимке по зубам?";

    // 2. Спрашиваем модель (если основная недоступна — запасная)
    let lastStatus = 0;
    for (const model of MODELS) {
      const res = await api("/chat/completions", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 600,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: question, attachments: [fileId] },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new AiError("ГигаЧат вернул пустой ответ. Попробуйте ещё раз.");
        return text.slice(0, 3000);
      }
      lastStatus = res.status;
      if (res.status === 401) {
        cached = null;
        throw new AiError("Доступ к ГигаЧату истёк. Нажмите «Повторить».");
      }
      if (res.status === 402) throw new AiError("Закончились бесплатные токены ГигаЧата. Их можно докупить на developers.sber.ru.");
      if (res.status === 429) throw new AiError("Слишком много запросов. Подождите минуту и нажмите «Повторить».");
    }
    throw new AiError(`ГигаЧат не ответил (код ${lastStatus}). Попробуйте позже.`);
  } finally {
    // 3. Удаляем картинку из хранилища ГигаЧата — там она больше не нужна
    api(`/files/${fileId}/delete`, token, { method: "POST" }).catch(() => {});
  }
}
