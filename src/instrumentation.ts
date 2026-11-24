/** Запускается один раз при старте сервера: таймер уведомлений о расписании дня */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
