"use client";

import { useRef } from "react";
import type React from "react";
import { useRouter } from "next/navigation";

/** Листание пальцем влево / вправо между фото */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onLeft();
      else onRight();
    },
  };
}

/** Обёртка для страницы фото: свайп влево — следующее, вправо — предыдущее */
export function SwipeNav({ prevHref, nextHref, children, className }: { prevHref: string | null; nextHref: string | null; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const h = useSwipe(
    () => nextHref && router.replace(nextHref, { scroll: false }),
    () => prevHref && router.replace(prevHref, { scroll: false }),
  );
  return (
    <div {...h} className={className} style={{ touchAction: "pan-y" }}>
      {children}
    </div>
  );
}
