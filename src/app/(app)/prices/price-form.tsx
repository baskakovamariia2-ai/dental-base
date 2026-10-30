import type { PriceList } from "@prisma/client";
import { Field } from "@/components/ui";

export function PriceListFields({ list }: { list?: PriceList }) {
  return (
    <div className="card card-pad space-y-4">
      <Field label="Название версии">
        <input name="name" required defaultValue={list?.name ?? ""} placeholder="Например: Прайс 2 (весна 2026)" className="input" />
      </Field>
      <Field label="Текст прайса — как вы его отправляете пациентам">
        <textarea
          name="text"
          rows={14}
          defaultValue={list?.text ?? ""}
          placeholder={"Консультация — 1 500 ₽\nЛечение кариеса — 7 000 ₽\nПломба — 7 000 ₽\nЛечение каналов + пломба — 15 000 ₽\nУдаление — 4 000 ₽"}
          className="input font-mono text-[14px]"
        />
      </Field>
      <p className="text-xs text-ink-mute">Каждая услуга — с новой строки, цена в конце строки. Строки без цены сохранятся в тексте, но в план не попадут.</p>
    </div>
  );
}
