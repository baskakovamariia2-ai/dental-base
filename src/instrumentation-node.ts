import dns from "node:dns";
import { pushTick } from "./lib/push";
import { telegramTick } from "./lib/tg-schedule";

// сначала IPv4: в контейнере нет IPv6, а Telegram и другие сайты отдают оба адреса
dns.setDefaultResultOrder("ipv4first");

const g = globalThis as unknown as { __pushTimer?: ReturnType<typeof setInterval>; __tgErr?: string };
if (!g.__pushTimer) {
  const run = async () => {
    await pushTick().catch((e) => console.error("push", e));
    await telegramTick().then(
      () => { g.__tgErr = undefined; },
      (e) => {
        const m = (e as Error).message;
        if (g.__tgErr !== m) console.error("telegram", m); // одну и ту же ошибку не повторяем каждую минуту
        g.__tgErr = m;
      },
    );
  };
  setTimeout(run, 30_000);
  g.__pushTimer = setInterval(run, 60_000);
}
