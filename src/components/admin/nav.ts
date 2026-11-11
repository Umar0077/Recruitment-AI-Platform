import {
  BarChart3,
  Briefcase,
  ClipboardCheck,
  HelpCircle,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  match?: string[];
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard },
      { label: "Candidates", href: "/admin/candidates", icon: Users },
      { label: "Interviews", href: "/admin/interviews", icon: Video },
      { label: "Assessments", href: "/admin/assessments", icon: ClipboardCheck },
      { label: "Recruitment Pipeline", href: "/admin/pipeline", icon: KanbanSquare },
    ],
  },
  {
    label: "Management",
    items: [
      { label: "Jobs & Interview Setup", href: "/admin/interview-setup", icon: Briefcase },
      { label: "Analytics & Reports", href: "/admin/analytics", icon: BarChart3 },
      { label: "HR Team", href: "/admin/team", icon: UserCog },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", href: "/admin/settings", icon: Settings },
      { label: "Help", href: "/admin/help", icon: HelpCircle },
    ],
  },
];

export const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

export function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export function pageTitle(pathname: string) {
  const item = [...ALL_NAV].sort((a, b) => b.href.length - a.href.length).find((n) => isActive(pathname, n.href));
  return item?.label ?? "Workspace";
}
