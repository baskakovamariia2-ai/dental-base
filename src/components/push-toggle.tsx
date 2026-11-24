"use client";

import { useEffect, useState } from "react";

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

type State = "loading" | "unsupported" | "not-home" | "denied" | "off" | "on";

/** Включить на этом телефоне уведомление «расписание дня» за час до первого пациента */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(/iPhone|iPad/.test(navigator.userAgent) && !standalone ? "not-home" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push/key")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error();
      setState("on");
      setMsg("Готово ✓ Нажмите «Прислать пробное», чтобы проверить.");
    } catch {
      setMsg("Не получилось включить. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
    setMsg(null);
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    const r = await fetch("/api/push/test", { method: "POST" })
      .then((x) => x.json())
      .catch(() => ({ sent: 0, total: 0, errors: ["нет связи с сервером"] }));
    setMsg(
      r.sent
        ? "Отправлено — через несколько секунд придёт уведомление."
        : r.total === 0 && !r.errors?.length
          ? "Этот телефон не подписан. Нажмите «Выключить», затем «Включить на этом телефоне»."
          : `Не отправилось. Причина: ${r.errors?.[0] ?? "неизвестно"}. Пришлите это сообщение Claude.`,
    );
    setBusy(false);
  };

  return (
    <div className="card card-pad space-y-3">
      <div>
        <div className="text-[15px] font-medium">🔔 Уведомления на телефон</div>
        <div className="space-y-1 text-sm text-ink-soft">
          <p>• Накануне приёма в 15:00 — напоминание написать пациентам в Telegram (кому ещё не напомнили).</p>
          <p>• В день приёмов за час до первого пациента — расписание дня по времени.</p>
          <p>Уведомление остаётся на экране, пока вы его не смахнёте.</p>
        </div>
      </div>
      {state === "loading" && <div className="text-sm text-ink-mute">Проверяю…</div>}
      {state === "not-home" && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          На iPhone уведомления работают, только если базу открыть <b>с иконки на экране «Домой»</b>: в Safari «Поделиться» → «На экран „Домой“», откройте базу с иконки и вернитесь сюда.
        </div>
      )}
      {state === "unsupported" && <div className="text-sm text-ink-mute">Этот браузер не поддерживает уведомления. Нужен iPhone с iOS 16.4 или новее, база открыта с иконки на экране «Домой».</div>}
      {state === "denied" && <div className="text-sm text-amber-800">Уведомления запрещены. Включите: Настройки iPhone → Уведомления → Dental Base → Допуск уведомлений.</div>}
      {state === "off" && <button type="button" onClick={enable} disabled={busy} className="btn-primary w-full">{busy ? "Включаю…" : "Включить на этом телефоне"}</button>}
      {state === "on" && (
        <div className="flex gap-2">
          <button type="button" onClick={test} disabled={busy} className="btn-secondary flex-1">Прислать пробное</button>
          <button type="button" onClick={disable} disabled={busy} className="btn-ghost">Выключить</button>
        </div>
      )}
      {msg && <div className="text-sm text-ink-soft">{msg}</div>}
    </div>
  );
}
