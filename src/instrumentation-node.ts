import { pushTick } from "./lib/push";

const g = globalThis as unknown as { __pushTimer?: ReturnType<typeof setInterval> };
if (!g.__pushTimer) {
  const run = () => pushTick().catch((e) => console.error("push", e));
  setTimeout(run, 30_000);
  g.__pushTimer = setInterval(run, 60_000);
}
