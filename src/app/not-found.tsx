import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-5xl font-semibold text-ink-mute">404</div>
      <p className="text-ink-soft">Такой страницы нет или запись была удалена</p>
      <Link href="/" className="btn-primary">На главную</Link>
    </main>
  );
}
