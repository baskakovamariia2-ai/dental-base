import { requireUser } from "@/lib/auth";
import { BottomNav, MobileTopBar, SideNav } from "@/components/nav";
import { ShiftBanner } from "@/components/shift-banner";
import { pendingShiftDays } from "@/lib/shift";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pending = await pendingShiftDays();
  return (
    <div className="min-h-[100dvh]">
      <SideNav userName={user.name} />
      <div className="lg:pl-60">
        <main className="mx-auto max-w-5xl px-4 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-2 sm:px-6 lg:pb-12 lg:pt-8">
          <MobileTopBar />
          <ShiftBanner days={pending} />
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
