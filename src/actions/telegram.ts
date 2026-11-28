"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/forms";
import { chooseTgChat, disconnectTg, findTgChats, saveTgToken, telegramTick } from "@/lib/tg-schedule";

const back = (m: string) => redirect(`/more?tg=${encodeURIComponent(m)}#telegram`);

export async function tgSaveToken(formData: FormData) {
  await requireUser();
  const token = str(formData, "token", 200).replace(/\s/g, "");
  if (!/^\d+:[\w-]{30,}$/.test(token)) back("Ключ не похож на ключ бота — скопируйте его из @BotFather целиком");
  let name = "";
  try {
    name = await saveTgToken(token);
  } catch (e) {
    back(`Telegram не принял ключ: ${(e as Error).message}`);
  }
  revalidatePath("/more");
  back(`Бот @${name} подключён. Теперь добавьте его в чат с Ильёй и нажмите «Найти чат».`);
}

export async function tgFindChats() {
  await requireUser();
  let n = 0;
  try {
    n = (await findTgChats()).length;
  } catch (e) {
    back(`Ошибка: ${(e as Error).message}`);
  }
  revalidatePath("/more");
  back(n ? "Выберите чат ниже" : "Чат не найден. Добавьте бота в чат и напишите там /start, потом нажмите ещё раз.");
}

export async function tgChooseChat(formData: FormData) {
  await requireUser();
  await chooseTgChat(str(formData, "chat", 40));
  let r = { sent: 0, edited: 0 };
  try {
    r = await telegramTick();
  } catch (e) {
    back(`Чат выбран, но отправить не получилось: ${(e as Error).message}`);
  }
  revalidatePath("/more");
  back(`Готово! Отправлено сообщений: ${r.sent}. Дальше бот сам исправляет их при изменениях.`);
}

export async function tgSendNow() {
  await requireUser();
  let r = { sent: 0, edited: 0 };
  try {
    r = await telegramTick();
  } catch (e) {
    back(`Ошибка: ${(e as Error).message}`);
  }
  back(`Отправлено: ${r.sent}, обновлено: ${r.edited}`);
}

export async function tgDisconnect() {
  await requireUser();
  await disconnectTg();
  revalidatePath("/more");
  back("Бот отключён");
}
