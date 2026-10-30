import type { ToothStatus } from "@prisma/client";
import { TOOTH_STATUS } from "@/lib/labels";

export const toothStatusOpt = (s: ToothStatus) => TOOTH_STATUS.find((o) => o.value === s) ?? TOOTH_STATUS[0];

export function ToothShape({ status, upper, className = "h-7 w-6" }: { status: ToothStatus; upper: boolean; className?: string }) {
  const o = toothStatusOpt(status);
  return (
    <svg viewBox="0 0 24 28" className={`${className} ${upper ? "" : "rotate-180"}`} aria-hidden>
      <path
        d="M6.5 2C4 2 2.5 4 2.5 7c0 3.5 1.6 5.2 2.1 8.6.5 3.3 1.1 9.4 3 9.4 1.6 0 1.7-4.6 2.8-7 .5-1 1-1.6 1.6-1.6s1.1.6 1.6 1.6c1.1 2.4 1.2 7 2.8 7 1.9 0 2.5-6.1 3-9.4.5-3.4 2.1-5.1 2.1-8.6C21.5 4 20 2 17.5 2c-2.2 0-3.2 1.2-5.5 1.2S8.7 2 6.5 2z"
        fill={o.fill}
        stroke={o.stroke}
        strokeWidth={1.4}
        strokeDasharray={status === "EXTRACTED" ? "2 2" : undefined}
      />
      {status === "IMPLANT" && <path d="M12 12v12M9 15h6M9.5 18h5M10 21h4" stroke={o.stroke} strokeWidth={1.2} />}
      {status === "CROWN" && <path d="M4 7.5h16" stroke={o.stroke} strokeWidth={1.4} />}
    </svg>
  );
}
