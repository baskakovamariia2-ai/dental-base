import Link from "next/link";
import { IconBack } from "./icons";

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  back?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start gap-3">
      {back && (
        <Link href={back} className="-ml-2 mt-0.5 rounded-xl p-2 text-ink-soft hover:bg-zinc-100" aria-label="Назад">
          <IconBack />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-ink-soft">{subtitle}</div>}
      </div>
      {action}
    </header>
  );
}

export function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`badge ${cls}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-ink-mute">{children}</p>;
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Select({
  name,
  options,
  defaultValue,
  className = "input",
  allowEmpty,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  className?: string;
  allowEmpty?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={className}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card card-pad">
      <div className="text-[13px] text-ink-soft">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-mute">{hint}</div>}
    </div>
  );
}

export function ErrorNote({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{children}</p>;
}
