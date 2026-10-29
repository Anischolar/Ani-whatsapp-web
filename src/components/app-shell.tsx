"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, useApi } from "@/lib/client";
import { cn } from "./ui";
import { WaStatusBadge } from "./status";

const icons: Record<string, ReactNode> = {
  dashboard: <path d="M3 12l9-9 9 9M5 10v10h4v-6h6v6h4V10" />,
  whatsapp: <path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 15h2" />,
  contacts: <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8" />,
  templates: <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />,
  media: <path d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01" />,
  campaigns: <path d="M3 11l18-8-8 18-2-8-8-2Z" />,
  optouts: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5.6 5.6l12.8 12.8" />,
};

const nav = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/whatsapp", label: "WhatsApp", icon: "whatsapp" },
  { href: "/contacts", label: "Contacts", icon: "contacts" },
  { href: "/templates", label: "Templates", icon: "templates" },
  { href: "/media", label: "Images", icon: "media" },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/opt-outs", label: "Opt-outs", icon: "optouts" },
];

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {icons[name]}
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: wa } = useApi<{ status: string }>("/api/whatsapp", 5000);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-4 flex items-center gap-2.5 px-2 py-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z" />
          </svg>
        </div>
        <span className="font-semibold text-slate-900">Campaigns</span>
      </div>
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive(item.href) ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          <Icon name={item.icon} />
          {item.label}
        </Link>
      ))}
      <div className="mt-auto space-y-2 border-t border-slate-100 pt-3">
        <Link href="/whatsapp" onClick={() => setOpen(false)} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-50">
          WhatsApp
          <WaStatusBadge status={wa?.status ?? "stopped"} />
        </Link>
        <button onClick={logout} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100">
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span className="font-semibold">Campaigns</span>
        <WaStatusBadge status={wa?.status ?? "stopped"} />
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
