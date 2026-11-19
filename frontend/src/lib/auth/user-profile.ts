"use client";
import { useAuth } from "./auth-provider";
import { isApiMode } from "@/lib/config/environment";
import { useDemoStore } from "@/lib/demo/store";
import { CURRENT_ADMIN_ID } from "@/lib/demo/seed";
import { TEAM_ROLE_LABEL } from "@/lib/demo/statuses";

export function accountIdentity(profile: { displayName?: string | null; email?: string | null } | null, user: { displayName?: string | null; email?: string | null; photoURL?: string | null } | null) {
  const fullName = profile?.displayName?.trim() || user?.displayName?.trim() || "";
  let photoURL: string | null = null;
  try { const url = new URL(user?.photoURL ?? ""); if (url.protocol === "https:" && (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com"))) photoURL = url.href; } catch { /* initials when no supported photo */ }
  return { fullName, firstName: fullName.split(/\s+/)[0] ?? "", email: profile?.email ?? user?.email ?? "", photoURL };
}

/** Account identity only. Official applicant names continue to come from Candidate records. */
export function useUserProfile(area: "candidate" | "admin") {
  const auth = useAuth();
  const candidate = useDemoStore(s => s.candidates.find(c => c.id === s.flow.candidateId));
  const staff = useDemoStore(s => s.team.find(t => t.id === CURRENT_ADMIN_ID));
  const demoEmail = useDemoStore(s => area === "admin" ? s.adminSession?.email : s.candidateSession?.email);
  if (!isApiMode) {
    const person = area === "admin" ? staff : candidate;
    return { ...accountIdentity({ displayName: person?.name, email: demoEmail ?? person?.email }, null), roleLabel: area === "admin" && staff ? TEAM_ROLE_LABEL[staff.role] : "Candidate" };
  }
  const role = auth.profile?.roles.find(r => r !== "CANDIDATE");
  return { ...accountIdentity(auth.profile, auth.user), roleLabel: role ? TEAM_ROLE_LABEL[role.toLowerCase() as keyof typeof TEAM_ROLE_LABEL] ?? role : "Candidate" };
}
