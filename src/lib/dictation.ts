// Распознавание надиктованной зубной формулы.
// Пример: «36 37 кариес пломба, 26 пульпит, 48 удалить, 11 наблюдение».
// Работает и в обратном порядке: «пломба 36 и 37, пульпит 26».

import type { ToothStatus } from "@prisma/client";
import { ALL_TEETH } from "./teeth";

export type DictatedItem = {
  tooth: number | null;
  status: ToothStatus | null;
  diagnosis: string | null;
  treatment: string | null;
};

type Kw = { re: RegExp; treatment?: string | ((m: RegExpExecArray) => string); status?: ToothStatus; noPlan?: boolean; noTooth?: boolean };

const CANAL_WORDS: Record<string, number> = { "1": 1, один: 1, одного: 1, одним: 1, "2": 2, два: 2, двух: 2, "3": 3, три: 3, трех: 3, "4": 4, четыре: 4, четырех: 4 };
const CANALS = "(?:\\s+(?:на|в)?\\s*(1|2|3|4|один|одного|два|двух|три|трех|четыре|четырех)\\s*-?\\s*(?:канал\\S*|канальн\\S*))?";
const withCanals = (base: string) => (m: RegExpExecArray) => {
  const n = m[1] ? CANAL_WORDS[m[1]] : undefined;
  return n ? `${base} — ${n} ${n === 1 ? "канал" : "канала"}` : base;
};

// Порядок важен: более длинные/конкретные фразы раньше
const KEYWORDS: Kw[] = [
  { re: new RegExp("^пульпит\\S*" + CANALS), treatment: withCanals("Пульпит"), status: "PLANNED" },
  { re: new RegExp("^периодонтит\\S*" + CANALS), treatment: withCanals("Периодонтит"), status: "PLANNED" },
  { re: new RegExp("^(?:лечени\\S*\\s+)?(?:канал\\S*|эндо\\S*)" + CANALS), treatment: withCanals("Пульпит"), status: "PLANNED" },
  { re: /^(стар\S*\s+пломб\S*|запломбирован\S*|стоит\s+пломб\S*|лечен\S*|вылечен\S*)/, status: "FILLING", noPlan: true },
  { re: /^((глубок|средн|начальн|вторичн)\S*\s+)?(кари\S*|реставрац\S*|пломб\S*)/, treatment: "Реставрация (кариес)", status: "PLANNED" },
  { re: /^(под\s+удаление|удал\S*|экстракц\S*)/, treatment: "Зуб под удаление", status: "PLANNED" },
  { re: /^(отсутств\S*|нет\s+зуба)/, status: "EXTRACTED", noPlan: true },
  { re: /^(коронк\S*\s+(из\s+)?)?(стекло\s*)?керамик\S*/, treatment: "Коронка стеклокерамика", status: "PLANNED" },
  { re: /^(коронк\S*\s+(из\s+)?)?циркон\S*/, treatment: "Коронка цирконий", status: "PLANNED" },
  { re: /^коронк\S*/, treatment: "Коронка", status: "PLANNED" },
  { re: /^имплант\S*/, treatment: "Имплант", status: "PLANNED" },
  { re: /^(здоров\S*|интакт\S*)/, status: "HEALTHY", noPlan: true },
  { re: /^(чистк\S*|гигиен\S*)/, treatment: "Профессиональная чистка", noTooth: true },
  { re: /^отбел\S*/, treatment: "Отбеливание", noTooth: true },
];

const UNITS: Record<string, number> = {
  один: 1, одна: 1, первый: 1, два: 2, две: 2, второй: 2, три: 3, третий: 3, четыре: 4, четвертый: 4, четвёртый: 4,
  пять: 5, пятый: 5, шесть: 6, шестой: 6, семь: 7, седьмой: 7, восемь: 8, восьмой: 8,
};
const TEENS: Record<string, number> = {
  одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18,
};
const TENS: Record<string, number> = { двадцать: 20, тридцать: 30, сорок: 40 };

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(\d)\s*[-–—.]\s*(\d)/g, "$1 $2") // «3-6» → «3 6»
    .replace(/[,;:!?()«»"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Tok = { kind: "tooth"; n: number } | { kind: "kw"; kw: Kw; treatment: string | null };

function tokenize(text: string): Tok[] {
  const toks: Tok[] = [];
  let s = normalize(text);
  while (s.length) {
    // ключевая фраза
    const kw = KEYWORDS.find((k) => k.re.test(s));
    if (kw) {
      const m = kw.re.exec(s)!;
      const treatment = typeof kw.treatment === "function" ? kw.treatment(m) : kw.treatment ?? null;
      toks.push({ kind: "kw", kw, treatment });
      s = s.slice(m[0].length).trim();
      continue;
    }
    const word = s.split(" ")[0];
    let rest = s.slice(word.length).trim();
    // числа цифрами: «36», а также «3 6»
    if (/^\d+$/.test(word)) {
      let n = Number(word);
      if (word.length === 1) {
        const next = rest.split(" ")[0];
        if (/^\d$/.test(next)) {
          n = Number(word + next);
          rest = rest.slice(next.length).trim();
        }
      }
      if (ALL_TEETH.includes(n)) toks.push({ kind: "tooth", n });
      s = rest;
      continue;
    }
    // числа словами: «тридцать шесть», «шестнадцать»
    if (TEENS[word]) {
      toks.push({ kind: "tooth", n: TEENS[word] });
      s = rest;
      continue;
    }
    if (TENS[word]) {
      const next = rest.split(" ")[0];
      if (UNITS[next]) {
        const n = TENS[word] + UNITS[next];
        if (ALL_TEETH.includes(n)) toks.push({ kind: "tooth", n });
        s = rest.slice(next.length).trim();
        continue;
      }
    }
    s = rest; // прочие слова («зуб», «и», «нужно», «на»…) пропускаем
  }
  return toks;
}

type KwTok = { kw: Kw; treatment: string | null };
type Run = { kind: "teeth"; teeth: number[] } | { kind: "kws"; kws: KwTok[] };

export function parseDictation(text: string): DictatedItem[] {
  const runs: Run[] = [];
  for (const t of tokenize(text)) {
    const last = runs[runs.length - 1];
    if (t.kind === "tooth") {
      if (last?.kind === "teeth") last.teeth.push(t.n);
      else runs.push({ kind: "teeth", teeth: [t.n] });
    } else {
      const k = { kw: t.kw, treatment: t.treatment };
      if (last?.kind === "kws") last.kws.push(k);
      else runs.push({ kind: "kws", kws: [k] });
    }
  }
  const keywordFirst = runs[0]?.kind === "kws";
  const out: DictatedItem[] = [];

  const emit = (teeth: number[], kws: KwTok[]) => {
    // «пульпит» и «реставрация» подряд — оставляем более серьёзное лечение
    let treatments = [...new Set(kws.filter((k) => k.treatment && !k.kw.noTooth).map((k) => k.treatment!))];
    if (treatments.some((t) => /пульпит|периодонт/i.test(t))) treatments = treatments.filter((t) => !/реставрац/i.test(t));
    const statusKw = kws.find((k) => k.kw.noPlan && k.kw.status) ?? kws.find((k) => k.kw.status);
    const status = statusKw?.kw.status ?? null;
    for (const tooth of teeth) {
      if (treatments.length) for (const tr of treatments) out.push({ tooth, status, diagnosis: null, treatment: tr });
      else out.push({ tooth, status, diagnosis: null, treatment: null });
    }
  };

  runs.forEach((r, i) => {
    if (r.kind === "kws") {
      for (const k of r.kws.filter((k) => k.kw.noTooth)) out.push({ tooth: null, status: null, diagnosis: null, treatment: k.treatment });
      return;
    }
    const partner = keywordFirst ? runs[i - 1] : runs[i + 1];
    const fallback = keywordFirst ? runs[i + 1] : runs[i - 1];
    const kwRun = partner?.kind === "kws" ? partner : fallback?.kind === "kws" ? fallback : null;
    if (!kwRun) return;
    emit(r.teeth, kwRun.kws.filter((k) => !k.kw.noTooth));
  });
  return out;
}

export { findPrice } from "./treatments";
