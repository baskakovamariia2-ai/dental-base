import { clearRecall, setRecall } from "@/actions/recall";
import { RECALL_NOTES, recallLabel, recallState } from "@/lib/recall";
import { toISODate } from "@/lib/dates";

const STYLE = {
  due: "bg-red-50 text-red-800 ring-red-200",
  soon: "bg-amber-50 text-amber-900 ring-amber-200",
  later: "bg-zinc-50 text-ink-soft ring-zinc-200",
};

/** Карточка пациента: «🔔 Связаться …» — когда позвать пациента снова (чистка через 6 мес и т.п.) */
export function RecallBox({ patientId, date, note }: { patientId: string; date: Date | null; note: string | null }) {
  const state = recallState(date);
  const form = (
    <form action={setRecall.bind(null, patientId)} className="mt-3 space-y-2.5">
      <div className="flex flex-wrap gap-2">
        {[1, 3, 6, 12].map((m) => (
          <button key={m} name="months" value={m} className="chip">через {m} мес.</button>
        ))}
      </div>
      <label className="block">
        <span className="label">Что сделать</span>
        <input name="note" list="recall-notes" defaultValue={note ?? "Записать на чистку"} className="input" maxLength={200} />
        <datalist id="recall-notes">{RECALL_NOTES.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <div className="flex items-end gap-2">
        <label className="block flex-1">
          <span className="label">Или к дате</span>
          <input name="date" type="date" defaultValue={date ? toISODate(date) : ""} className="input" />
        </label>
        <button className="btn-secondary">Сохранить</button>
      </div>
      <p className="text-xs text-ink-mute">Кнопки «через N мес.» сразу сохраняют вместе с текстом выше.</p>
    </form>
  );

  if (!date || !state) {
    return (
      <details className="mb-5">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm text-ink-mute">🔔 Напомнить связаться…</summary>
        <div className="card card-pad mt-2">{form}</div>
      </details>
    );
  }
  return (
    <div className={`mb-5 rounded-2xl p-3.5 ring-1 ${STYLE[state]}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">🔔 {note || "Связаться"}</div>
          <div className="text-sm opacity-80">
            {date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" })} · {recallLabel(date)}
          </div>
        </div>
        <form action={clearRecall.bind(null, patientId)}>
          <button className="btn-sm rounded-xl bg-white/80 px-3 py-1.5 text-sm font-medium ring-1 ring-black/10">✓ Готово</button>
        </form>
      </div>
      <details>
        <summary className="mt-2 cursor-pointer list-none text-sm underline decoration-dotted underline-offset-2">Изменить</summary>
        {form}
      </details>
    </div>
  );
}
