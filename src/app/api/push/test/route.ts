import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dayScheduleMessage, rememberOrigin, sendPush } from "@/lib/push";
import { addDays, startOfDay } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Пробное уведомление: расписание ближайшего дня с приёмами */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  await rememberOrigin(req);
  const next = await prisma.appointment.findFirst({
    where: { startsAt: { gte: startOfDay(new Date()), lt: addDays(new Date(), 60) }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    orderBy: { startsAt: "asc" },
  });
  const msg = next ? await dayScheduleMessage(next.startsAt) : null;
  const payload = msg
    ? { ...msg, title: `Пробное · ${next!.startsAt.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" })} · ${msg.title.replace("🦷 ", "")}`, tag: "test" }
    : { title: "🦷 Пробное уведомление", body: "Уведомления работают. Записей на ближайшие дни пока нет.", tag: "test", url: "/schedule" };
  try {
    const r = await sendPush(payload, user.id);
    return NextResponse.json(r);
  } catch (e) {
    console.error("push test", e);
    return NextResponse.json({ sent: 0, total: 0, errors: [`сервер: ${(e as Error).message}`.slice(0, 300)] });
  }
}
