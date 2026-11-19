import {
  Activity,
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
  permission?: string;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
 { label: "Overview", items: [{label:"Dashboard",href:"/admin",icon:LayoutDashboard}] },
 { label: "Recruitment", items: [
  {label:"Candidates",href:"/admin/candidates",icon:Users,permission:"applications:read"},
  {label:"Interviews",href:"/admin/interviews",icon:Video,permission:"interviews:read"},
  {label:"Recruitment Pipeline",href:"/admin/pipeline",icon:KanbanSquare,permission:"applications:read"}] },
 { label: "Evaluation", items: [{label:"AI Assessments",href:"/admin/assessments",icon:ClipboardCheck,permission:"assessments:read"}] },
 { label: "Management", items: [
  {label:"Analytics & Reports",href:"/admin/analytics",icon:BarChart3,permission:"analytics:read"},
  {label:"Interview Setup",href:"/admin/interview-setup",icon:Briefcase,permission:"question_sets:read"},
  {label:"Settings",href:"/admin/settings",icon:Settings}] },
 { label: "Administration", items: [
  {label:"API Usage",href:"/admin/api-usage",icon:Activity,permission:"users:manage"},
  {label:"Rubric Configuration",href:"/admin/assessments/rubrics",icon:ClipboardCheck,permission:"question_sets:manage"},
  {label:"HR Accounts",href:"/admin/settings/accounts",icon:UserCog,permission:"users:manage"},
  {label:"HR Team",href:"/admin/team",icon:Users,permission:"users:manage"},
  {label:"Account Security",href:"/admin/settings/security",icon:Settings},
  {label:"Help",href:"/admin/help",icon:HelpCircle}] }
];

export const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

/** Navigation visibility only; protected APIs enforce the same permission server-side. */
export function isNavVisible(item: NavItem, permissions: readonly string[] | undefined, apiMode: boolean) {
  return !apiMode || !item.permission || !!permissions?.includes(item.permission);
}

export function isActive(pathname: string, href: string) {
  const matches = (target: string) => target === "/admin" ? pathname === target : pathname === target || pathname.startsWith(`${target}/`);
  return matches(href) && !ALL_NAV.some(item => item.href !== href && item.href.startsWith(`${href}/`) && matches(item.href));
}

export function pageTitle(pathname: string) {
  const item = [...ALL_NAV].sort((a, b) => b.href.length - a.href.length).find((n) => isActive(pathname, n.href));
  return item?.label ?? "Workspace";
}
