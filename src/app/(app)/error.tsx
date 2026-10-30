"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card card-pad mx-auto mt-10 max-w-md text-center">
      <div className="mb-2 text-lg font-semibold">Что-то пошло не так</div>
      <p className="mb-4 text-sm text-ink-soft">{error.message === "Недостаточно прав" ? "У вас нет прав на это действие." : "Попробуйте ещё раз. Если ошибка повторяется — сообщите код ниже."}</p>
      {error.digest && <p className="mb-4 font-mono text-xs text-ink-mute">{error.digest}</p>}
      <button onClick={reset} className="btn-primary">Повторить</button>
    </div>
  );
}
