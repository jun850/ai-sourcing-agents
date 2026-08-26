import { useEffect, useRef, useState } from "react";
import { Badge, Box, IconButton, List, ListItemButton, Menu, MenuItem, Skeleton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { NotificationsNone, Search } from "@mui/icons-material";
import { getIntoolsNotificationCenter, getIntoolsNotificationUnreadCount, getWorkspaceNotificationCenter, getWorkspaceNotificationUnreadCount, markNotificationsRead, supabase, type NotificationCenterItem } from "./supabase";

type Mode = "buyer" | "intools";
const compactCount = (count: number) => count > 99 ? "99+" : String(count);

export function NotificationBell({ mode, onNavigate }: { mode: Mode; onNavigate: (href: string) => void }) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [items, setItems] = useState<NotificationCenterItem[]>([]);
  const [count, setCount] = useState(0);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"all" | "unread" | "read">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadCount = () => (mode === "buyer" ? getWorkspaceNotificationUnreadCount() : getIntoolsNotificationUnreadCount()).then(setCount).catch(() => undefined);
  const load = () => {
    setLoading(true); setError("");
    const request = mode === "buyer" ? getWorkspaceNotificationCenter({ query, state, sort }) : getIntoolsNotificationCenter({ query, state, sort });
    void request.then(setItems).catch((cause) => setError(cause instanceof Error ? cause.message : "Notifications are unavailable.")).finally(() => setLoading(false));
  };
  useEffect(() => { loadCount(); }, [mode]);
  useEffect(() => {
    const db = supabase;
    if (!db) return;
    const channel = db.channel(`notification-bell:${mode}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, loadCount)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rfq_ops_messages" }, loadCount)
      .subscribe();
    return () => { void db.removeChannel(channel); };
  }, [mode]);
  useEffect(() => { if (anchor) load(); }, [anchor, mode, query, state, sort]);
  function open(event: React.MouseEvent<HTMLElement>) { setAnchor(event.currentTarget); }
  function close() { setAnchor(null); buttonRef.current?.focus(); }
  async function choose(item: NotificationCenterItem) {
    if (item.source === "notification" && !item.read_at) { try { await markNotificationsRead([item.id]); } catch { /* navigation still reaches the authoritative destination */ } }
    setAnchor(null); onNavigate(item.href); loadCount();
  }
  const label = count ? `${count} unread notifications` : "Notifications";
  return <>
    <Tooltip title={label}><IconButton ref={buttonRef} aria-label={label} aria-controls={anchor ? "notification-center" : undefined} aria-expanded={Boolean(anchor)} onClick={open}>
      <Badge badgeContent={compactCount(count)} color="error" invisible={!count} max={99}><NotificationsNone /></Badge>
    </IconButton></Tooltip>
    <Menu id="notification-center" anchorEl={anchor} open={Boolean(anchor)} onClose={close}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{ list: { "aria-label": "Notifications" }, paper: { sx: { width: { xs: "calc(100vw - 24px)", sm: 430 }, maxWidth: 430, maxHeight: "min(620px, calc(100dvh - 88px))", borderRadius: 2, boxShadow: "0 12px 32px rgba(32,41,54,.16)", overflow: "hidden" } } }}>
      <Box sx={{ px: 2, pt: 1.75, pb: 1.25 }}><Typography sx={{ fontSize: 16, fontWeight: 800 }}>Notifications</Typography><Typography sx={{ mt: .25, color: "#667384", fontSize: 12 }}>{count ? `${count} unread` : "You are up to date"}</Typography></Box>
      <Box sx={{ px: 1.5, pb: 1.25 }}><TextField fullWidth size="small" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages" slotProps={{ input: { startAdornment: <Search sx={{ mr: 1, color: "#778191", fontSize: 19 }} /> }, htmlInput: { "aria-label": "Search notifications and RFQ messages" } }}/></Box>
      <Stack direction="row" spacing={.5} sx={{ px: 1.5, pb: 1.25, alignItems: "center" }}>{(["all", "unread", "read"] as const).map((value) => <MenuItem key={value} selected={state === value} onClick={() => setState(value)} sx={{ minHeight: 32, borderRadius: 1, px: 1, fontSize: 12, textTransform: "capitalize" }}>{value}</MenuItem>)}<Box sx={{ flex: 1 }}/><MenuItem selected={sort === "newest"} onClick={() => setSort((current) => current === "newest" ? "oldest" : "newest")} sx={{ minHeight: 32, borderRadius: 1, px: 1, fontSize: 12 }}>{sort === "newest" ? "Newest" : "Oldest"}</MenuItem></Stack>
      <Box sx={{ borderTop: "1px solid #edf0f3", overflowY: "auto", overscrollBehavior: "contain", maxHeight: "calc(min(620px, 100dvh - 88px) - 168px)" }} aria-busy={loading}>{loading ? <Stack spacing={1.25} sx={{ p: 2 }}><Skeleton height={52}/><Skeleton height={52}/><Skeleton height={52}/></Stack> : error ? <Typography role="alert" sx={{ p: 2, color: "#a33b36", fontSize: 13 }}>{error}</Typography> : items.length ? <List disablePadding>{items.map((item) => <ListItemButton key={`${item.source}:${item.id}`} onClick={() => void choose(item)} sx={{ alignItems: "flex-start", px: 2, py: 1.4, borderBottom: "1px solid #f0f2f4", bgcolor: !item.read_at && !item.sent ? "#f2f7f3" : "transparent" }}><Box sx={{ minWidth: 0, width: "100%" }}><Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "baseline" }}><Typography noWrap sx={{ minWidth: 0, fontSize: 13, fontWeight: item.read_at || item.sent ? 700 : 800 }}>{item.title}</Typography><Typography sx={{ flexShrink: 0, color: "#778191", fontSize: 11 }}>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.created_at))}</Typography></Stack><Typography noWrap sx={{ mt: .35, color: "#667384", fontSize: 12 }}>{item.body || (item.sent ? "Sent message" : "New update")}</Typography></Box></ListItemButton>)}</List> : <Box sx={{ p: 3, textAlign: "center" }}><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{query ? "No matching messages" : "No notifications"}</Typography><Typography sx={{ mt: .5, color: "#667384", fontSize: 12 }}>{query ? "Try a different message or RFQ reference." : "New sourcing updates will appear here."}</Typography></Box>}</Box>
    </Menu>
  </>;
}
