import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logout, changePassword } from "@/actions/auth";
import { addUser, clearDemo, seedDemo, toggleUserActive } from "@/actions/admin";
import { saveReminderTemplate, saveSettings } from "@/actions/settings";
import { getReminderTemplate } from "@/lib/reminder";
import { getSettings } from "@/lib/settings";
import { ConfirmButton } from "@/components/auto-submit";
import { Field, PageHeader } from "@/components/ui";
import { IconChart, IconChevron, IconLogout, IconSearch, IconTag, IconUsers } from "@/components/icons";

const ROLE: Record<string, string> = { OWNER: "Администратор", DOCTOR: "Врач", ASSISTANT: "Ассистент" };
const PW: Record<string, [string, string]> = {
  ok: ["Пароль изменён", "bg-emerald-50 text-emerald-700"],
  wrong: ["Текущий пароль неверный", "bg-rose-50 text-rose-700"],
  short: ["Новый пароль — не короче 10 символов", "bg-rose-50 text-rose-700"],
};
const USERMSG: Record<string, [string, string]> = {
  ok: ["Сотрудник добавлен. Передайте ему email и пароль.", "bg-emerald-50 text-emerald-700"],
  exists: ["Такой email уже есть", "bg-rose-50 text-rose-700"],
  invalid: ["Заполните имя, email и пароль от 10 символов", "bg-rose-50 text-rose-700"],
};


export default async function MorePage({ searchParams }: { searchParams: Promise<{ pw?: string; user?: string; welcome?: string; tpl?: string; ai?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const isOwner = me.role === "OWNER";
  const tpl = await getReminderTemplate();
  const settings = await getSettings();
  const [users, demoCount] = await Promise.all([
    isOwner ? prisma.user.findMany({ orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    prisma.patient.count({ where: { isDemo: true } }),
  ]);

  const links = [
    { href: "/search", label: "Поиск", Icon: IconSearch },
    { href: "/prices", label: "Прайсы", Icon: IconTag },
    { href: "/earnings", label: "Заработок", Icon: IconChart },
    { href: "/stats", label: "Статистика", Icon: IconChart },
    { href: "/patients?filter=archived", label: "Архив пациентов", Icon: IconUsers },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Ещё" subtitle={`${me.name} · ${ROLE[me.role]}`} />

      {sp.welcome && (
        <div className="card card-pad bg-accent-soft/60">
          <div className="font-medium text-accent-ink">Добро пожаловать в Dental Base!</div>
          <p className="mt-1 text-sm text-accent-ink/80">Ниже добавьте аккаунт врача (роль «Врач» — он будет подставляться в записи и приёмы). Чтобы посмотреть, как всё работает, можно загрузить DEMO-пациентов, а потом удалить их одной кнопкой.</p>
        </div>
      )}

      <div className="card divide-y divide-zinc-100">
        {links.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50">
            <Icon className="h-5 w-5 text-ink-soft" />
            <span className="flex-1 text-[15px]">{label}</span>
            <IconChevron className="h-4 w-4 text-ink-mute" />
          </Link>
        ))}
      </div>

      {isOwner && (
        <section>
          <h2 className="section-title">Сотрудники</h2>
          {sp.user && USERMSG[sp.user] && <p className={`mb-3 rounded-xl px-3 py-2.5 text-sm ${USERMSG[sp.user][1]}`}>{USERMSG[sp.user][0]}</p>}
          <div className="card divide-y divide-zinc-100">
            {users.map((u) => (
              <div key={u.id} className={`flex items-center gap-3 px-4 py-3 ${u.isActive ? "" : "opacity-50"}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium">{u.name}</div>
                  <div className="truncate text-xs text-ink-mute">{u.email} · {ROLE[u.role]}{u.isActive ? "" : " · отключён"}</div>
                </div>
                {u.id !== me.id && (
                  <form action={toggleUserActive.bind(null, u.id)}>
                    <button className="btn-ghost btn-sm">{u.isActive ? "Отключить" : "Включить"}</button>
                  </form>
                )}
              </div>
            ))}
          </div>
          <details className="card card-pad mt-3">
            <summary className="cursor-pointer list-none font-medium">+ Добавить сотрудника</summary>
            <form action={addUser} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Имя"><input name="name" required className="input" /></Field>
              <Field label="Email"><input name="email" type="email" required className="input" autoComplete="off" /></Field>
              <Field label="Пароль (от 10 символов)"><input name="password" type="text" minLength={10} required className="input" autoComplete="new-password" /></Field>
              <Field label="Роль">
                <select name="role" defaultValue="DOCTOR" className="input">
                  <option value="DOCTOR">Врач</option>
                  <option value="OWNER">Администратор</option>
                  <option value="ASSISTANT">Ассистент</option>
                </select>
              </Field>
              <button className="btn-primary sm:col-span-2">Добавить</button>
            </form>
          </details>
        </section>
      )}


      <section>
        <h2 className="section-title">Врач в плане лечения</h2>
        <form action={saveSettings} className="card card-pad flex flex-wrap items-end gap-2">
          <input type="hidden" name="returnTo" value="/more?tpl=ok" />
          <label className="block min-w-0 flex-1"><span className="label">ФИО врача</span><input name="doctorName" defaultValue={settings.doctorName} className="input" /></label>
          <button className="btn-secondary">Сохранить</button>
        </form>
      </section>

      <section>
        <h2 className="section-title">Напоминание в Telegram</h2>
        {sp.tpl && <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">Сохранено</p>}
        <form action={saveReminderTemplate} className="card card-pad space-y-3">
          <p className="text-sm text-ink-soft">Этот текст показывается по кнопке «Напомнить» — его можно скопировать и вставить в чат. Вместо <b>{"{дата}"}</b> подставятся дата и время ближайшей записи, например «5 ноября (среда) в 14:00».</p>
          <textarea name="template" rows={14} defaultValue={tpl} className="input text-[15px]" />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary">Сохранить</button>
            <button name="reset" value="1" className="btn-ghost">Вернуть исходный</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="section-title">Смена пароля</h2>
        {sp.pw && PW[sp.pw] && <p className={`mb-3 rounded-xl px-3 py-2.5 text-sm ${PW[sp.pw][1]}`}>{PW[sp.pw][0]}</p>}
        <form action={changePassword} className="card card-pad grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Текущий пароль"><input name="current" type="password" required className="input" autoComplete="current-password" /></Field>
          <Field label="Новый пароль"><input name="next" type="password" minLength={10} required className="input" autoComplete="new-password" /></Field>
          <button className="btn-secondary">Сменить</button>
        </form>
      </section>

      {isOwner && (
        <section>
          <h2 className="section-title">Тестовые данные</h2>
          <div className="card card-pad flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-ink-soft">
              {demoCount ? `Сейчас в системе ${demoCount} DEMO-пациента (помечены жёлтой меткой DEMO).` : "Три вымышленных пациента, записи и товары, чтобы попробовать систему."}
            </p>
            {demoCount ? (
              <form action={clearDemo}><ConfirmButton message="Удалить все DEMO-данные?">Удалить DEMO</ConfirmButton></form>
            ) : (
              <form action={seedDemo}><button className="btn-secondary">Загрузить DEMO</button></form>
            )}
          </div>
        </section>
      )}

      <form action={logout}>
        <button className="btn-secondary w-full"><IconLogout /> Выйти</button>
      </form>
    </div>
  );
}
