import { redirect } from "next/navigation";
import { setupOwner } from "@/actions/admin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if ((await prisma.user.count()) > 0) redirect("/login");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-4 h-14 w-14" />
          <h1 className="text-2xl font-semibold tracking-tight">Первый запуск</h1>
          <p className="mt-1 text-sm text-ink-soft">Создайте аккаунт владельца. Эта страница доступна только один раз.</p>
        </div>
        <form action={setupOwner} className="card card-pad space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">Заполните все поля. Пароль — не короче 10 символов.</p>}
          <label className="block"><span className="label">Ваше имя</span><input name="name" required className="input" /></label>
          <label className="block"><span className="label">Email</span><input name="email" type="email" autoComplete="username" required className="input" /></label>
          <label className="block"><span className="label">Пароль (от 10 символов)</span><input name="password" type="password" minLength={10} autoComplete="new-password" required className="input" /></label>
          <button className="btn-primary w-full">Создать и войти</button>
        </form>
      </div>
    </main>
  );
}
