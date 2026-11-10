type P = { className?: string };
const base = (d: React.ReactNode, className = "h-5 w-5") => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {d}
  </svg>
);

export const IconHome = ({ className }: P) => base(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>, className);
export const IconUsers = ({ className }: P) => base(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2" /></>, className);
export const IconCalendar = ({ className }: P) => base(<><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>, className);
export const IconBox = ({ className }: P) => base(<><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>, className);
export const IconMore = ({ className }: P) => base(<><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>, className);
export const IconSearch = ({ className }: P) => base(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, className);
export const IconPlus = ({ className }: P) => base(<path d="M12 5v14M5 12h14" />, className);
export const IconPhone = ({ className }: P) => base(<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />, className);
export const IconChevron = ({ className }: P) => base(<path d="m9 6 6 6-6 6" />, className);
export const IconBack = ({ className }: P) => base(<path d="m15 6-6 6 6 6" />, className);
export const IconTooth = ({ className }: P) => base(<path d="M7.5 3C5 3 3.5 5 3.5 7.5c0 3 1.5 4.5 2 7.5.5 2.5 1 6 2.5 6s1.5-3.5 2.5-5.5c.4-.9.9-1.5 1.5-1.5s1.1.6 1.5 1.5c1 2 1 5.5 2.5 5.5s2-3.5 2.5-6c.5-3 2-4.5 2-7.5C20.5 5 19 3 16.5 3c-2 0-3 1-4.5 1S9.5 3 7.5 3z" />, className);
export const IconTag = ({ className }: P) => base(<><path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>, className);
export const IconChart = ({ className }: P) => base(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />, className);
export const IconLogout = ({ className }: P) => base(<><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>, className);
export const IconCart = ({ className }: P) => base(<><path d="M3 4h2l2.5 11h11L21 7H6.5" /><circle cx="9" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></>, className);
export const IconDisk = ({ className }: P) => base(<><ellipse cx="12" cy="5.5" rx="8" ry="2.5" /><path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13" /><path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" /></>, className);
