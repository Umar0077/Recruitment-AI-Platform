"use client";
/** Notification bell data: demo store in demo mode, backend notifications in API mode (no local fakes). */
import { useMemo } from "react";
import { toast } from "sonner";
import type { AppNotification, NotificationKind } from "@/types";
import { isApiMode } from "@/lib/config/environment";
import { useDemoStore } from "@/lib/demo/store";
import { errorText } from "@/components/api/query-state";
import { useMarkNotificationRead, useNotifications } from "./queries";

const KIND: Record<string, NotificationKind> = {
  INTERVIEW_COMPLETED: "interview_completed",
  REVIEW_REQUIRED: "awaiting_review",
  CANDIDATE_SHORTLISTED: "shortlisted",
  SESSION_EXPIRING: "system",
  HR_REMARK_ADDED: "remark",
};

export interface NotificationFeed {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  error: unknown;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

function useApiFeed(): NotificationFeed {
  const q = useNotifications();
  const mark = useMarkNotificationRead();
  return useMemo(() => {
    const items: AppNotification[] = (q.data?.items ?? []).map((n) => ({
      id: n.id,
      kind: KIND[n.type] ?? "system",
      title: n.title,
      body: n.message,
      at: n.createdAt,
      read: !!n.readAt,
      href: n.entityType === "interview_session" && n.entityId ? `/admin/interviews/${n.entityId}` : n.entityType === "application" && n.entityId ? `/admin/candidates/${n.entityId}` : "/admin",
    }));
    const unread = typeof q.data?.meta.unread === "number" ? (q.data.meta.unread as number) : items.filter((n) => !n.read).length;
    return {
      items,
      unread,
      loading: q.isPending,
      error: q.error,
      markRead: (id: string) => mark.mutate(id),
      markAllRead: () =>
        mark.mutate("all", {
          onSuccess: () => toast.success("All notifications marked as read."),
          onError: (e) => toast.error("Couldn't update notifications.", { description: errorText(e) }),
        }),
    };
  }, [q.data, q.isPending, q.error, mark]);
}

function useDemoFeed(): NotificationFeed {
  const notifications = useDemoStore((s) => s.notifications);
  const markRead = useDemoStore((s) => s.markRead);
  const markAll = useDemoStore((s) => s.markAllRead);
  return useMemo(
    () => ({
      items: notifications,
      unread: notifications.filter((n) => !n.read).length,
      loading: false,
      error: null,
      markRead,
      markAllRead: () => { markAll(); toast.success("All notifications marked as read."); },
    }),
    [notifications, markRead, markAll],
  );
}

export const useNotificationFeed: () => NotificationFeed = isApiMode ? useApiFeed : useDemoFeed;
