"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardCheck, LogOut, Menu, MessageSquarePlus, Search, Settings, Sparkles, Star, UserRound, Video } from "lucide-react";
import { PoweredByConnectivo } from "@/components/ui/powered-by";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { toast } from "sonner";
import { AppLogo, BrandMark } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { CandidateAvatar, Kbd, SkeletonPage } from "@/components/ui/primitives";
import { DemoBadge, EmptyState } from "@/components/ui/states";
import { Drawer, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlays";
import { PageTransition } from "@/components/motion";
import { NAV_GROUPS, isActive, pageTitle } from "./nav";
import { CommandPalette } from "./command-palette";
import { useDemoStore } from "@/lib/demo/store";
import { useNotificationFeed } from "@/lib/data/notification-feed";
import { useOpenReviewCount } from "@/lib/data/queries";
import { useAuth } from "@/lib/auth/auth-provider";
import { useAccessGate } from "@/lib/auth/use-access-gate";
import { isApiMode } from "@/lib/config/environment";
import { CURRENT_ADMIN_ID } from "@/lib/demo/seed";
import { TEAM_ROLE_LABEL } from "@/lib/demo/statuses";
import { BRAND } from "@/lib/brand";
import { cn, timeAgo } from "@/lib/utils";
import type { NotificationKind } from "@/types";

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const demoAwaiting = useDemoStore((s) => s.interviews.filter((i) => i.reviewStatus === "awaiting_review").length);
  const apiAwaiting = useOpenReviewCount();
  const awaiting = isApiMode ? apiAwaiting : demoAwaiting;
  return (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-2">
      {NAV_GROUPS.map((g) => (
        <div key={g.label} className="mb-5">
          {!collapsed && <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-disabled">{g.label}</p>}
          {collapsed && <div className="mx-auto mb-2 h-px w-6 bg-overlay/[0.06]" aria-hidden />}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(pathname, item.href);
              const badge = item.href === "/admin/interviews" && awaiting > 0 ? awaiting : undefined;
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-micro",
                    collapsed ? "justify-center px-0" : "px-3",
                    active ? "bg-gradient-to-r from-brand/20 to-brand/[0.04] text-fg" : "text-fg-muted hover:bg-overlay/[0.04] hover:text-fg",
                  )}
                >
                  {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-cyan shadow-[0_0_10px_rgba(56,189,248,0.8)]" aria-hidden />}
                  <item.icon className={cn("size-[18px] shrink-0", active ? "text-brand-cyan" : "text-fg-muted group-hover:text-fg-secondary")} aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {badge !== undefined && !collapsed && <span className="ml-auto rounded-full bg-brand/25 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-100">{badge}</span>}
                  {badge !== undefined && collapsed && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand-cyan" aria-label={`${badge} awaiting review`} />}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip content={item.label} side="right">
                      {link}
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Who is signed in: the demo team member, or the verified staff user from the backend. */
function useStaffIdentity() {
  const demoMe = useDemoStore((s) => s.team.find((t) => t.id === CURRENT_ADMIN_ID));
  const demoSession = useDemoStore((s) => s.adminSession);
  const auth = useAuth();
  if (!isApiMode) return demoMe ? { name: demoMe.name, roleLabel: TEAM_ROLE_LABEL[demoMe.role], email: demoSession?.email ?? demoMe.email } : null;
  const role = auth.profile?.roles.find((r) => r !== "CANDIDATE");
  return {
    name: auth.profile?.displayName ?? auth.user?.displayName ?? auth.profile?.email ?? "Staff member",
    roleLabel: role ? TEAM_ROLE_LABEL[role.toLowerCase() as keyof typeof TEAM_ROLE_LABEL] ?? role : "",
    email: auth.profile?.email ?? auth.user?.email ?? "",
  };
}

function SidebarUser({ collapsed }: { collapsed: boolean }) {
  const me = useStaffIdentity();
  if (!me) return null;
  return (
    <div className={cn("border-t border-subtle p-3", collapsed && "flex justify-center")}>
      <div className={cn("flex items-center gap-3 rounded-xl p-2", !collapsed && "bg-overlay/[0.03]")}>
        <CandidateAvatar name={me.name} size="sm" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{me.name}</p>
            <p className="truncate text-xs text-fg-muted">{me.roleLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const NOTIF_ICON: Record<NotificationKind, typeof Bell> = {
  interview_completed: Video,
  assessment_ready: ClipboardCheck,
  shortlisted: Star,
  awaiting_review: Bell,
  remark: MessageSquarePlus,
  system: Sparkles,
};

export function NotificationCenter() {
  const feed = useNotificationFeed();
  const { items: notifications, markRead, markAllRead, unread } = feed;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative">
          <Bell />
          {unread > 0 && <span className="absolute right-2 top-2 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-ink-950">{unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-fg-muted">{unread ? `${unread} unread` : "You're all caught up"}</p>
          </div>
          <Button variant="ghost" size="sm" disabled={!unread} onClick={() => markAllRead()}>
            <CheckCheck />Mark all read
          </Button>
        </div>
        {feed.error ? (
          <p role="alert" className="p-4 text-sm text-red-700 dark:text-red-200">Notifications couldn&apos;t be loaded. They&apos;ll refresh automatically.</p>
        ) : feed.loading ? (
          <div className="space-y-2 p-3" aria-busy="true"><div className="skeleton h-14 rounded-xl" /><div className="skeleton h-14 rounded-xl" /></div>
        ) : notifications.length === 0 ? (
          <EmptyState icon={<Bell />} title="No notifications" description="New interview submissions and review updates will appear here." className="py-10" />
        ) : (
          <ul className="max-h-[420px] overflow-y-auto p-1.5">
            {notifications.map((n) => {
              const Icon = NOTIF_ICON[n.kind];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => { markRead(n.id); setOpen(false); router.push(n.href); }}
                    className={cn("flex w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-overlay/[0.04]", !n.read && "bg-brand/[0.06]")}
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", n.read ? "bg-overlay/[0.04] text-fg-muted" : "bg-brand/15 text-brand-cyan")}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-sm", n.read ? "text-fg-secondary" : "font-medium text-fg")}>{n.title}</span>
                        <span className="shrink-0 text-[11px] text-fg-disabled">{timeAgo(n.at)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-fg-muted">{n.body}</span>
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand-cyan">View<ChevronRight className="size-3" aria-hidden /></span>
                    </span>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-cyan" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Render gate for the admin workspace (demo session or verified staff sign-in). The backend enforces permissions itself. */
export function useAdminGate() {
  return useAccessGate("admin");
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const ready = useAdminGate();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [animated, setAnimated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const endSession = useDemoStore((s) => s.endSession);
  const me = useStaffIdentity();
  const auth = useAuth();

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("ios-sidebar") === "1"); } catch { /* storage unavailable */ }
    // Enable the width animation only after the saved state is applied, so first paint does not shift.
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("ios-sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title = pageTitle(pathname);
  useEffect(() => {
    document.title = `${title} · ${BRAND.name}`;
  }, [title]);
  const crumbs = pathname.split("/").filter(Boolean).slice(1);

  return (
    <div className="app-backdrop min-h-dvh">
      {/* Desktop sidebar */}
      <aside className={cn("no-print fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-subtle bg-ink-950/80 backdrop-blur-xl lg:flex", animated && "transition-[width] duration-300 ease-premium", collapsed ? "w-[76px]" : "w-[264px]")}>
        <div className={cn("flex h-16 items-center border-b border-subtle", collapsed ? "justify-center" : "justify-between px-5")}>
          {collapsed ? <Link href="/admin" aria-label={`${BRAND.name} overview`}><BrandMark /></Link> : <AppLogo href="/admin" descriptor size="sm" />}
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className={cn("px-3 pb-2", collapsed && "flex justify-center")}>
          <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
            <button onClick={toggle} className={cn("flex h-9 items-center gap-2 rounded-lg px-3 text-xs text-fg-muted transition-colors hover:bg-overlay/[0.04] hover:text-fg", !collapsed && "w-full")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" />Collapse</>}
            </button>
          </Tooltip>
        </div>
        {!collapsed && <div className="px-5 pb-3"><PoweredByConnectivo size="sm" /></div>}
        <SidebarUser collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      <Drawer open={mobileOpen} onOpenChange={setMobileOpen} side="left" title={BRAND.name} description="Recruitment workspace">
        <div className="flex h-full flex-col">
          <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          <div className="px-5 pb-3"><PoweredByConnectivo size="sm" /></div>
          <SidebarUser collapsed={false} />
        </div>
      </Drawer>

      <div className={cn(animated && "transition-[padding] duration-300 ease-premium", collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]")}>
        {/* Topbar */}
        <header className="no-print sticky top-0 z-20 border-b border-subtle bg-ink-950/75 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu />
            </Button>
            <div className="min-w-0 flex-1">
              <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-xs text-fg-muted sm:flex">
                <Link href="/admin" className="hover:text-fg">Workspace</Link>
                {crumbs.map((c, i) => (
                  <span key={c + i} className="flex items-center gap-1.5">
                    <ChevronRight className="size-3" aria-hidden />
                    {i < crumbs.length - 1 ? (
                      <Link href={`/admin/${crumbs.slice(0, i + 1).join("/")}`} className="capitalize hover:text-fg">{c.replace(/-/g, " ")}</Link>
                    ) : (
                      <span className="truncate text-fg-secondary" aria-current="page">{/^(CND|INT|ASM)-/.test(c) ? c : c.replace(/-/g, " ").replace(/^\w/, (m) => m.toUpperCase())}</span>
                    )}
                  </span>
                ))}
              </nav>
              <p className="truncate font-display text-[15px] font-semibold text-fg sm:text-base">{title}</p>
            </div>
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden h-10 w-72 items-center gap-2.5 rounded-xl border border-subtle bg-overlay/[0.03] px-3 text-sm text-fg-muted transition-colors hover:border-slate-400/30 hover:text-fg-secondary md:flex"
              aria-label="Search candidates, interviews, and pages"
            >
              <Search className="size-4" aria-hidden />
              <span className="flex-1 text-left">Search workspace…</span>
              <Kbd>Ctrl</Kbd><Kbd>K</Kbd>
            </button>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSearchOpen(true)} aria-label="Search"><Search /></Button>
            {!isApiMode && <DemoBadge label="Interactive Demo" className="hidden xl:inline-flex" />}
            <ThemeToggle />
            <NotificationCenter />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full focus-visible:ring-2 focus-visible:ring-brand-cyan/60" aria-label="Account menu">
                  <CandidateAvatar name={me?.name ?? "HR"} size="md" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60">
                <DropdownMenuLabel>
                  <span className="block text-sm font-medium text-fg">{me?.name}</span>
                  <span className="block truncate font-normal">{me?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push("/admin/team")}><UserRound />My team</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/admin/settings")}><Settings />Settings</DropdownMenuItem>
                {!isApiMode && <DropdownMenuItem onSelect={() => router.push("/candidate/interview")}><Sparkles />Switch to candidate view</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => {
                  if (isApiMode) { void auth.signOut().then(() => { toast.success("Signed out."); router.replace("/admin/login"); }); return; }
                  endSession("admin"); toast.success("Signed out of the demo."); router.push("/admin/login");
                }}><LogOut />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto max-w-[1480px]">
            {ready ? <PageTransition key={pathname}>{children}</PageTransition> : <SkeletonPage />}
          </div>
        </main>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
