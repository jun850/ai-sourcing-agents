import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box, Dialog, Skeleton, Typography } from "@mui/material";
import {
  Add,
  ChatBubbleOutlined,
  Inbox,
  ReceiptLongOutlined,
  Search,
  Settings,
} from "@mui/icons-material";
import { workspaceSearch, type WorkspaceSearchHit } from "./supabase";

type RecentRequest = { id: string; title: string; case_no: string };

type PaletteRow =
  | { type: "action"; key: string; label: string; hint: string; icon: ReactNode; run: () => void }
  | { type: "request"; key: string; label: string; hint: string; run: () => void }
  | { type: "hit"; key: string; label: string; hint: string; run: () => void };

export function WorkspaceCommandPalette({
  open,
  onClose,
  recent,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  recent: RecentRequest[];
  onNavigate: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<WorkspaceSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setSearching(false);
      setActive(0);
      return;
    }
    const handle = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(handle);
  }, [open]);

  const term = query.trim();
  useEffect(() => {
    if (!open) return;
    if (term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void workspaceSearch(term, 8).then((rows) => {
        if (cancelled) return;
        setHits(rows);
        setSearching(false);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [term, open]);

  function go(path: string) {
    onClose();
    onNavigate(path);
  }

  const rows = useMemo<PaletteRow[]>(() => {
    const actionDefs: PaletteRow[] = [
      { type: "action", key: "a-new", label: "New request", hint: "Start an RFQ draft", icon: <Add fontSize="small" />, run: () => go("/dashboard/new-rfq") },
      { type: "action", key: "a-requests", label: "Go to Requests", hint: "Every RFQ case", icon: <Inbox fontSize="small" />, run: () => go("/dashboard/requests") },
      { type: "action", key: "a-messages", label: "Go to Messages", hint: "Atelix Operations conversations", icon: <ChatBubbleOutlined fontSize="small" />, run: () => go("/dashboard/messages") },
      { type: "action", key: "a-invoices", label: "Go to Invoices", hint: "Invoices and payment", icon: <ReceiptLongOutlined fontSize="small" />, run: () => go("/dashboard/invoices") },
      { type: "action", key: "a-settings", label: "Go to Settings", hint: "Profile and workspace", icon: <Settings fontSize="small" />, run: () => go("/dashboard/settings") },
    ];
    const q = term.toLowerCase();
    const actions = q
      ? actionDefs.filter((row) => row.label.toLowerCase().includes(q) || row.hint.toLowerCase().includes(q))
      : actionDefs;

    if (q.length >= 2) {
      const hitRows: PaletteRow[] = hits.map((hit) => ({
        type: "hit",
        key: `h-${hit.kind}-${hit.id}`,
        label: hit.title,
        hint: `${hit.ref} · ${hit.kind === "invoice" ? "Invoice" : "Request"}`,
        run: () =>
          go(
            hit.kind === "invoice"
              ? `/dashboard/invoices/${encodeURIComponent(hit.id)}`
              : `/dashboard/requests/${encodeURIComponent(hit.id)}`,
          ),
      }));
      return [...actions, ...hitRows];
    }

    const recentRows: PaletteRow[] = recent.slice(0, 4).map((item) => ({
      type: "request",
      key: `r-${item.id}`,
      label: item.title,
      hint: item.case_no,
      run: () => go(`/dashboard/requests/${encodeURIComponent(item.id)}`),
    }));
    return [...actions, ...recentRows];
  }, [term, hits, recent]);

  useEffect(() => {
    setActive((current) => (current >= rows.length ? 0 : current));
  }, [rows.length]);

  const showEmpty = term.length >= 2 && !searching && rows.length === 0;
  const resultCount = term.length >= 2 ? hits.length : 0;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (rows.length ? (current + 1) % rows.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (rows.length ? (current - 1 + rows.length) % rows.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      rows[active]?.run();
    }
  }

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let renderedIndex = -1;
  const sectionsOrder =
    term.length >= 2 ? ["action", "hit"] : ["action", "request"];
  const sectionLabels: Record<string, string> = {
    action: "Quick actions",
    request: "Recent",
    hit: "Search results",
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            position: "absolute",
            top: "12vh",
            m: 0,
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 24px 64px rgba(15,18,24,.28)",
          },
        },
        backdrop: { sx: { backgroundColor: "rgba(18,20,25,.4)" } },
      }}
      aria-label="Search everything"
      onKeyDown={onKeyDown}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 2, py: 1.5, borderBottom: "1px solid #f0f0f2" }}>
        <Search sx={{ color: "#9ba1aa", fontSize: 20, flexShrink: 0 }} />
        <Box
          component="input"
          ref={inputRef}
          value={query}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="workspace-palette-results"
          aria-activedescendant={rows[active] ? `palette-opt-${active}` : undefined}
          placeholder="Search actions, requests, invoices…"
          aria-label="Search actions, requests, and invoices"
          sx={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 0,
            background: "transparent",
            font: "inherit",
            fontSize: 15,
            color: "#202936",
            "&::placeholder": { color: "#9ba1aa" },
            "&:focus, &:focus-visible": { outline: "3px solid transparent", boxShadow: "none" },
          }}
        />
      </Box>
      <Box
        ref={listRef}
        id="workspace-palette-results"
        role="listbox"
        aria-label="Results"
        sx={{ maxHeight: "56vh", overflowY: "auto", p: 1 }}
      >
        <Box aria-live="polite" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          {term.length >= 2 && !searching ? `${resultCount} result${resultCount === 1 ? "" : "s"}` : ""}
        </Box>
        {sectionsOrder.map((section) => {
          const sectionRows = rows.filter((row) => row.type === section);
          if (!sectionRows.length && !(section === "hit" && (searching || showEmpty))) return null;
          return (
            <Box key={section} sx={{ mb: 0.5 }}>
              <Typography
                sx={{
                  px: 1,
                  py: 0.75,
                  color: "#9ba1aa",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                }}
              >
                {sectionLabels[section]}
              </Typography>
              {section === "hit" && searching && (
                <Box sx={{ px: 1, py: 0.5 }}>
                  {[0, 1, 2].map((row) => (
                    <Box key={row} sx={{ display: "flex", gap: 1.25, py: 0.75 }}>
                      <Skeleton variant="rounded" width={30} height={30} />
                      <Box sx={{ flex: 1 }}>
                        <Skeleton width="60%" />
                        <Skeleton width="35%" />
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
              {section === "hit" && showEmpty && !searching && (
                <Typography sx={{ px: 1, py: 1, color: "#758091", fontSize: 13 }}>
                  No requests or invoices match “{term}”.
                </Typography>
              )}
              {sectionRows.map((row) => {
                renderedIndex += 1;
                const index = renderedIndex;
                const selected = index === active;
                return (
                  <Box
                    key={row.key}
                    id={`palette-opt-${index}`}
                    role="option"
                    aria-selected={selected}
                    data-index={index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => row.run()}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      px: 1,
                      py: 1,
                      borderRadius: "10px",
                      cursor: "pointer",
                      backgroundColor: selected ? "#f0f1f3" : "transparent",
                    }}
                  >
                    <Box
                      sx={{
                        display: "grid",
                        placeItems: "center",
                        width: 32,
                        height: 32,
                        flexShrink: 0,
                        borderRadius: "9px",
                        backgroundColor: "#f0f1f3",
                        color: "#4a5667",
                      }}
                    >
                      {row.type === "action" ? row.icon : <Inbox fontSize="small" />}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, color: "#202936" }}>
                        {row.label}
                      </Typography>
                      <Typography noWrap sx={{ fontSize: 11.5, color: "#9ba1aa" }}>
                        {row.hint}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>
    </Dialog>
  );
}
