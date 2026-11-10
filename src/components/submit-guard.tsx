"use client";

import { useEffect } from "react";

/**
 * Защита от двойного нажатия «Сохранить / Добавить» во всех формах.
 * Пока форма отправляется, повторные нажатия игнорируются, а кнопка становится бледной.
 * Форма снова доступна, когда сохранение закончилось (React сбрасывает форму)
 * или, на всякий случай, через 8 секунд.
 * Автоотправка без кнопки (выпадающие списки) не блокируется.
 * Отключить для конкретной формы: <form data-no-guard>.
 */
const RELEASE_MS = 8000;

export function SubmitGuard() {
  useEffect(() => {
    const timers = new WeakMap<HTMLFormElement, number>();
    const buttons = new WeakMap<HTMLFormElement, HTMLButtonElement | HTMLInputElement>();

    const release = (form: HTMLFormElement) => {
      delete form.dataset.submitting;
      const t = timers.get(form);
      if (t) window.clearTimeout(t);
      const btn = buttons.get(form);
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = "";
        buttons.delete(form);
      }
    };

    const onSubmit = (e: SubmitEvent) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || "noGuard" in form.dataset) return;
      if (!e.submitter) return; // автоотправка без кнопки
      if (form.dataset.submitting) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      form.dataset.submitting = "1";
      const btn = e.submitter as HTMLButtonElement | HTMLInputElement;
      buttons.set(form, btn);
      // отключаем кнопку после того, как React прочитает форму
      window.setTimeout(() => {
        if (form.dataset.submitting && btn.isConnected) {
          btn.disabled = true;
          btn.style.opacity = "0.5";
        }
      }, 0);
      timers.set(form, window.setTimeout(() => release(form), RELEASE_MS));
    };

    const onReset = (e: Event) => {
      if (e.target instanceof HTMLFormElement) release(e.target);
    };

    window.addEventListener("submit", onSubmit, true);
    window.addEventListener("reset", onReset, true);
    return () => {
      window.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("reset", onReset, true);
    };
  }, []);

  return null;
}
