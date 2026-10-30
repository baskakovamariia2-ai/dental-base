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

type Kw = { re: RegExp; diagnosis?: string; treatment?: string; status?: ToothStatus; noPlan?: boolean; noTooth?: boolean };

// Порядок важен: более длинные/конкретные фразы раньше
const KEYWORDS: Kw[] = [
  { re: /^глубок\S*\s+кари\S*/, diagnosis: "Глубокий кариес", status: "CARIES" },
  { re: /^средн\S*\s+кари\S*/, diagnosis: "Средний кариес", status: "CARIES" },
  { re: /^начальн\S*\s+кари\S*/, diagnosis: "Начальный кариес", status: "CARIES" },
  { re: /^вторичн\S*\s+кари\S*/, diagnosis: "Вторичный кариес", status: "CARIES" },
  { re: /^кари\S*/, diagnosis: "Кариес", status: "CARIES" },
  { re: /^пульпит\S*/, diagnosis: "Пульпит", treatment: "Лечение каналов + пломба", status: "PLANNED" },
  { re: /^периодонтит\S*/, diagnosis: "Периодонтит", treatment: "Лечение каналов + пломба", status: "PLANNED" },
  { re: /^(перелеч\S*|перелечивание)/, treatment: "Перелечивание каналов", status: "PLANNED" },
  { re: /^(канал\S*|эндо\S*)/, treatment: "Лечение каналов", status: "PLANNED" },
  { re: /^(стар\S*\s+пломб\S*|запломбирован\S*|стоит\s+пломб\S*)/, status: "FILLING", noPlan: true },
  { re: /^(пломб\S*|запломбировать)/, treatment: "Пломба", status: "PLANNED" },
  { re: /^реставрац\S*/, treatment: "Реставрация", status: "PLANNED" },
  { re: /^(удал\S*|экстракц\S*)/, treatment: "Удаление", status: "PLANNED" },
  { re: /^(отсутств\S*|нет\s+зуба)/, status: "EXTRACTED", noPlan: true },
  { re: /^коронк\S*/, treatment: "Коронка", status: "PLANNED" },
  { re: /^(вкладк\S*)/, treatment: "Вкладка", status: "PLANNED" },
  { re: /^(имплант\S*)/, treatment: "Имплантация", status: "PLANNED" },
  { re: /^(наблюд\S*)/, status: "OBSERVATION", noPlan: true },
  { re: /^(здоров\S*|интакт\S*)/, status: "HEALTHY", noPlan: true },
  { re: /^(чистк\S*|гигиен\S*)/, treatment: "Профессиональная гигиена", noTooth: true },
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

type Tok = { kind: "tooth"; n: number } | { kind: "kw"; kw: Kw };

function tokenize(text: string): Tok[] {
  const toks: Tok[] = [];
  let s = normalize(text);
  while (s.length) {
    // ключевая фраза
    const kw = KEYWORDS.find((k) => k.re.test(s));
    if (kw) {
      const m = kw.re.exec(s)!;
      toks.push({ kind: "kw", kw });
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

type Run = { kind: "teeth"; teeth: number[] } | { kind: "kws"; kws: Kw[] };

export function parseDictation(text: string): DictatedItem[] {
  const runs: Run[] = [];
  for (const t of tokenize(text)) {
    const last = runs[runs.length - 1];
    if (t.kind === "tooth") {
      if (last?.kind === "teeth") last.teeth.push(t.n);
      else runs.push({ kind: "teeth", teeth: [t.n] });
    } else {
      if (last?.kind === "kws") last.kws.push(t.kw);
      else runs.push({ kind: "kws", kws: [t.kw] });
    }
  }
  const keywordFirst = runs[0]?.kind === "kws";
  const out: DictatedItem[] = [];
  const used = new Set<number>();

  const emit = (teeth: number[], kws: Kw[]) => {
    const diagnosis = kws.find((k) => k.diagnosis)?.diagnosis ?? null;
    const treatments = kws.filter((k) => k.treatment && !k.noTooth).map((k) => k.treatment!);
    // «кариес» без лечения → по умолчанию пломба
    if (!treatments.length && kws.some((k) => k.status === "CARIES")) treatments.push("Пломба");
    const statusKw = kws.find((k) => k.status && k.status !== "PLANNED") ?? kws.find((k) => k.status);
    const status = statusKw?.status ?? null;
    for (const tooth of teeth) {
      if (treatments.length && !kws.every((k) => k.noPlan)) {
        for (const tr of [...new Set(treatments)]) out.push({ tooth, status, diagnosis, treatment: tr });
      } else {
        out.push({ tooth, status, diagnosis, treatment: null });
      }
    }
  };

  runs.forEach((r, i) => {
    if (r.kind === "kws") {
      for (const k of r.kws.filter((k) => k.noTooth)) out.push({ tooth: null, status: null, diagnosis: null, treatment: k.treatment! });
      return;
    }
    const partner = keywordFirst ? runs[i - 1] : runs[i + 1];
    const fallback = keywordFirst ? runs[i + 1] : runs[i - 1];
    const kwRun = partner?.kind === "kws" ? partner : fallback?.kind === "kws" ? fallback : null;
    if (!kwRun) return;
    used.add(i);
    emit(r.teeth, kwRun.kws.filter((k) => !k.noTooth));
  });
  return out;
}

/** Подбор цены из прайса по названию лечения */
export function findPrice(treatment: string, items: { name: string; price: number }[]): number | null {
  const t = treatment.toLowerCase();
  const stems: [RegExp, RegExp][] = [
    [/перелеч/, /перелеч/],
    [/канал/, /канал|эндо|пульпит/],
    [/пломб/, /пломб|кариес|реставр/],
    [/реставр/, /реставр|пломб/],
    [/удален/, /удален/],
    [/коронк/, /коронк/],
    [/вкладк/, /вкладк/],
    [/имплант/, /имплант/],
    [/гигиен/, /гигиен|чистк/],
  ];
  const exact = items.find((i) => i.name.toLowerCase() === t);
  if (exact) return exact.price;
  for (const [cond, match] of stems) {
    if (cond.test(t)) {
      const hit = items.find((i) => match.test(i.name.toLowerCase()));
      if (hit) return hit.price;
    }
  }
  return null;
}
