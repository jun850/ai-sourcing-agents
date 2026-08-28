import { useEffect, useRef, useState } from "react";
import { Box, IconButton, Menu, Skeleton, Tooltip, Typography } from "@mui/material";
import { NotificationsNone } from "@mui/icons-material";
import {
  getIntoolsNotificationCenter,
  getIntoolsNotificationUnreadCount,
  getWorkspaceNotificationCenter,
  getWorkspaceNotificationUnreadCount,
  markAllIntoolsNotificationsRead,
  markAllWorkspaceNotificationsRead,
  markNotificationsRead,
  supabase,
  type NotificationCenterItem,
} from "./supabase";

type Mode = "buyer" | "intools";

/** "2h ago" / "3d ago" style label; falls back to a short date past a week. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));
}

export function NotificationBell({ mode, onNavigate }: { mode: Mode; onNavigate: (href: string) => void }) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [items, setItems] = useState<NotificationCenterItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  const loadCount = () =>
    (mode === "buyer" ? getWorkspaceNotificationUnreadCount() : getIntoolsNotificationUnreadCount())
      .then(setCount)
      .catch(() => undefined);

  const load = () => {
    setLoading(true);
    setError("");
    const request =
      mode === "buyer"
        ? getWorkspaceNotificationCenter({ state: "all", sort: "newest" })
        : getIntoolsNotificationCenter({ state: "all", sort: "newest" });
    void request
      .then(setItems)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Notifications are unavailable."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCount();
  }, [mode]);

  useEffect(() => {
    const db = supabase;
    if (!db) return;
    const channel = db
      .channel(`notification-bell:${mode}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, loadCount)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rfq_ops_messages" }, loadCount)
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [mode]);

  useEffect(() => {
    if (anchor) load();
  }, [anchor, mode]);

  function open(event: React.MouseEvent<HTMLElement>) {
    setAnchor(event.currentTarget);
  }
  function close() {
    setAnchor(null);
    buttonRef.current?.focus();
  }

  async function markAll() {
    if (markingAll || !count) return;
    setMarkingAll(true);
    try {
      if (mode === "buyer") await markAllWorkspaceNotificationsRead();
      else await markAllIntoolsNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
      setCount(0);
    } catch {
      /* a failed bulk read leaves the authoritative unread state untouched */
    } finally {
      setMarkingAll(false);
    }
  }

  async function choose(item: NotificationCenterItem) {
    if (item.source === "notification" && !item.read_at) {
      try {
        await markNotificationsRead([item.id]);
      } catch {
        /* navigation still reaches the authoritative destination */
      }
    }
    setAnchor(null);
    onNavigate(item.href);
    loadCount();
  }

  const label = count ? `${count} unread notifications` : "Notifications";

  return (
    <>
      <Tooltip title={label}>
        <IconButton
          ref={buttonRef}
          aria-label={label}
          aria-controls={anchor ? "notification-center" : undefined}
          aria-expanded={Boolean(anchor)}
          onClick={open}
          sx={{
            position: "relative",
            width: 36,
            height: 36,
            borderRadius: "10px",
            color: "#697586",
            "&:hover": { backgroundColor: "#f7f7f8", color: "#202936" },
          }}
        >
          <NotificationsNone sx={{ fontSize: 20 }} />
          {count > 0 && (
            <Box
              component="span"
              aria-hidden="true"
              sx={{
                position: "absolute",
                top: 7,
                right: 8,
                width: 7,
                height: 7,
                borderRadius: "999px",
                backgroundColor: "#c0564a",
                border: "1.5px solid #fff",
              }}
            />
          )}
        </IconButton>
      </Tooltip>
      <Menu
        id="notification-center"
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          list: { "aria-label": "Notifications", sx: { p: 0 } },
          paper: {
            sx: {
              mt: 1.25,
              width: 340,
              maxWidth: "calc(100vw - 24px)",
              borderRadius: "14px",
              border: "1px solid #ececef",
              boxShadow: "0 16px 40px rgba(20,25,33,.16)",
              overflow: "hidden",
            },
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1.875,
            py: 1.625,
            borderBottom: "1px solid #f0f0f2",
          }}
        >
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#202936" }}>Notifications</Typography>
          <Box
            component="button"
            type="button"
            onClick={() => void markAll()}
            disabled={!count || markingAll}
            sx={{
              border: 0,
              background: "transparent",
              font: "inherit",
              fontSize: 11.5,
              fontWeight: 600,
              color: !count || markingAll ? "#c5cbd2" : "#1d5a3c",
              cursor: !count || markingAll ? "default" : "pointer",
              "&:hover": { color: !count || markingAll ? "#c5cbd2" : "#3d6548" },
            }}
          >
            Mark all as read
          </Box>
        </Box>
        <Box sx={{ maxHeight: 320, overflowY: "auto" }} aria-busy={loading}>
          {loading ? (
            <Box sx={{ p: 1.875, display: "grid", gap: 1.5 }}>
              {[0, 1, 2].map((row) => (
                <Box key={row} sx={{ display: "flex", gap: 1.25 }}>
                  <Skeleton variant="circular" width={6} height={6} sx={{ mt: 0.75 }} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton width="85%" />
                    <Skeleton width="30%" />
                  </Box>
                </Box>
              ))}
            </Box>
          ) : error ? (
            <Typography role="alert" sx={{ p: 1.875, color: "#a33b36", fontSize: 12.5 }}>
              {error}
            </Typography>
          ) : items.length ? (
            items.map((item) => (
              <Box
                key={`${item.source}:${item.id}`}
                component="button"
                type="button"
                onClick={() => void choose(item)}
                sx={{
                  display: "flex",
                  gap: 1.25,
                  width: "100%",
                  textAlign: "left",
                  px: 1.875,
                  py: 1.5,
                  border: 0,
                  borderBottom: "1px solid #f0f0f2",
                  background: "transparent",
                  cursor: "pointer",
                  "&:last-of-type": { borderBottom: 0 },
                  "&:hover": { backgroundColor: "#f7f7f8" },
                  "&:focus-visible": { outline: "3px solid rgba(75,118,87,.32)", outlineOffset: -3 },
                }}
              >
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{
                    flexShrink: 0,
                    mt: 0.75,
                    width: 6,
                    height: 6,
                    borderRadius: "999px",
                    backgroundColor: item.read_at || item.sent ? "transparent" : "#c0564a",
                  }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12.5, lineHeight: 1.5, color: "#202936" }}>
                    {item.title}
                    {item.body ? ` — ${item.body}` : ""}
                  </Typography>
                  <Typography sx={{ mt: 0.375, fontSize: 11, color: "#9ba1aa" }}>
                    {item.sent ? "Sent" : relativeTime(item.created_at)}
                  </Typography>
                </Box>
              </Box>
            ))
          ) : (
            <Box sx={{ px: 1.875, py: 4, textAlign: "center" }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#202936" }}>You are up to date</Typography>
              <Typography sx={{ mt: 0.5, fontSize: 12, color: "#9ba1aa" }}>
                New sourcing updates will appear here.
              </Typography>
            </Box>
          )}
        </Box>
      </Menu>
    </>
  );
}
