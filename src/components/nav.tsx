"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBox, IconCalendar, IconHome, IconMore, IconSearch, IconUsers } from "./icons";

const items = [
  { href: "/", label: "Главная", Icon: IconHome },
  { href: "/patients", label: "Пациенты", Icon: IconUsers },
  { href: "/schedule", label: "Расписание", Icon: IconCalendar },
  { href: "/inventory", label: "Склад", Icon: IconBox },
  { href: "/more", label: "Ещё", Icon: IconMore },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/70 bg-white/90 backdrop-blur-xl lg:hidden">
      <ul className="mx-auto flex max-w-lg pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, Icon }) => {
          const active = isActive(path, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-accent" : "text-ink-mute"}`}
              >
                <Icon className="h-6 w-6" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({ userName }: { userName: string }) {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-zinc-200/70 bg-white px-3 py-5 lg:flex">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-3">
        <img src="/icon.svg" alt="" className="h-8 w-8" />
        <span className="text-[17px] font-semibold tracking-tight">Dental Base</span>
      </Link>
      <Link href="/search" className="mb-4 flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-sm text-ink-mute">
        <IconSearch className="h-4 w-4" /> Поиск
      </Link>
      <ul className="space-y-0.5">
        {items.map(({ href, label, Icon }) => {
          const active = isActive(path, href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] ${active ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-soft hover:bg-zinc-50"}`}
              >
                <Icon />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto px-3 text-xs text-ink-mute">{userName}</div>
    </aside>
  );
}

export function MobileTopBar() {
  return (
    <div className="sticky top-0 z-30 -mx-4 mb-2 flex items-center justify-between bg-canvas/85 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] backdrop-blur-xl lg:hidden">
      <span className="text-[15px] font-semibold tracking-tight">Dental Base</span>
      <Link href="/search" aria-label="Поиск" className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-zinc-200">
        <IconSearch />
      </Link>
    </div>
  );
}
