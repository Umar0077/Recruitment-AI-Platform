/** Non-secret UID marker only. A verified registration session must still sign in again. */
const KEY = "interviewos-verification-pending";
let pendingUid: string | null = null;
export function requireFreshLogin(uid: string) {
  pendingUid = uid;
  try { localStorage.setItem(KEY, uid); } catch { /* memory fallback when storage is blocked */ }
}
export function needsFreshLogin(uid: string) {
  try { return pendingUid === uid || localStorage.getItem(KEY) === uid; } catch { return pendingUid === uid; }
}
export function clearFreshLogin(uid?: string) {
  if (!uid || pendingUid === uid) pendingUid = null;
  try { if (!uid || localStorage.getItem(KEY) === uid) localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
