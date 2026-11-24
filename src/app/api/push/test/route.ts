import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dayScheduleMessage, sendPush } from "@/lib/push";
import { addDays, startOfDay } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Пробное уведомление: расписание ближайшего дня с приёмами */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const next = await prisma.appointment.findFirst({
    where: { startsAt: { gte: startOfDay(new Date()), lt: addDays(new Date(), 60) }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    orderBy: { startsAt: "asc" },
  });
  const msg = next ? await dayScheduleMessage(next.startsAt) : null;
  const payload = msg
    ? { ...msg, title: `Пробное · ${msg.title.replace("Сегодня", next!.startsAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }) + ":")}`, tag: "test" }
    : { title: "🦷 Пробное уведомление", body: "Уведомления работают. Записей на ближайшие дни пока нет.", tag: "test", url: "/schedule" };
  const sent = await sendPush(payload, user.id);
  return NextResponse.json({ sent });
}
