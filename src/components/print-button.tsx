"use client";

export function PrintButton() {
  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-10 flex gap-2 bg-white/90 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur">
      <button onClick={() => window.print()} className="btn-primary flex-1">Сохранить PDF / Печать</button>
      <button onClick={() => (history.length > 1 ? history.back() : window.close())} className="btn-secondary">Назад</button>
    </div>
  );
}
