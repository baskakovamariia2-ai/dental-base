"use client";

import { useRef, useState } from "react";

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Диктовка через браузер (Safari/Chrome). Если недоступна — подсказываем микрофон клавиатуры. */
export function useSpeech(onText: (chunk: string) => void, newLinePerPhrase = false) {
  const [listening, setListening] = useState(false);
  const rec = useRef<SR | null>(null);
  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C) {
      alert("Здесь встроенная диктовка недоступна. Нажмите на поле и используйте микрофон на клавиатуре iPhone.");
      return;
    }
    const r = new C();
    r.lang = "ru-RU";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim() + (newLinePerPhrase ? "\n" : " "));
      }
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };
  return { listening, toggle };
}
