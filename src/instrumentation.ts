/** Запускается один раз при старте сервера: таймер уведомлений о расписании дня */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __pushTimer?: ReturnType<typeof setInterval> };
  if (g.__pushTimer) return;
  const { pushTick } = await import("./lib/push");
  const run = () => pushTick().catch((e) => console.error("push", e));
  setTimeout(run, 30_000);
  g.__pushTimer = setInterval(run, 60_000);
}
