"use client";

/** select, который сразу отправляет свою форму при изменении */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  className = "",
  ariaLabel,
}: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={`cursor-pointer rounded-lg border-0 bg-zinc-100 py-1.5 pl-2.5 pr-7 text-sm ring-0 focus:ring-2 focus:ring-accent ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Кнопка с подтверждением (для удаления/архивации) */
export function ConfirmButton({
  children,
  message,
  className = "btn-danger",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
