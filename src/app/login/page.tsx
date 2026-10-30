import { redirect } from "next/navigation";
import { login } from "@/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Неверный email или пароль",
  blocked: "Слишком много попыток. Попробуйте через 15 минут",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if ((await prisma.user.count()) === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-4 h-14 w-14" />
          <h1 className="text-2xl font-semibold tracking-tight">Dental Base</h1>
          <p className="mt-1 text-sm text-ink-soft">Вход для сотрудников клиники</p>
        </div>
        <form action={login} className="card card-pad space-y-4">
          {error && ERRORS[error] && (
            <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{ERRORS[error]}</p>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Пароль</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
          <button className="btn-primary w-full">Войти</button>
        </form>
      </div>
    </main>
  );
}
