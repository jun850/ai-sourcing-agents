import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useReducedMotion } from "framer-motion";
import {
  Alert, Avatar, Box, Button, Chip, IconButton,
  Skeleton, Stack, Typography,
} from "@mui/material";
import { AttachFile, Close, Description, InsertDriveFile, Send } from "@mui/icons-material";
import {
  cancelRfqOpsAttachmentUpload, createRfqOpsAttachmentSignedUrl,
  createRfqOpsMessageId, getRfqOpsMessage, listIntoolsBuyerConversations, listIntoolsBuyerMessages,
  listWorkspaceOpsConversations, listWorkspaceOpsMessages, markIntoolsBuyerConversationRead,
  markWorkspaceOpsConversationRead, reserveIntoolsBuyerUpload, reserveWorkspaceOpsUpload,
  sendIntoolsBuyerMessage, sendWorkspaceOpsMessage, subscribeToRfqOpsMessages, subscribeToRfqOpsPresence, getWorkspaceProfile,
  uploadRfqOpsAttachment, type RfqOpsAttachmentUpload, type RfqOpsConversation,
  type RfqOpsMessage, type RfqOpsCursor, type RfqOpsPresence,
} from "./supabase";
import { useInfiniteList } from "./use-infinite-list";

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4", "video/quicktime", "video/webm"]);
const MAX_BYTES = 25 * 1024 * 1024;

function relativeShort(value: string | null | undefined) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return "now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function conversationTitle(item: RfqOpsConversation) {
  return item.case_no ? `${item.case_no} · ${item.rfq_title}` : item.rfq_title;
}

type PendingAttachment = { id: string; file: File; upload?: RfqOpsAttachmentUpload; reservation?: { storage_path: string } };

export function RfqOpsMessagesWorkspace({
  selectedCaseId,
  onSelectCase,
  unreadCount,
  onUnreadCount,
  mode = "buyer",
}: {
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  unreadCount?: number | null;
  onUnreadCount?: () => void;
  mode?: "buyer" | "intools";
}) {
  const conversationSentinel = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const [messages, setMessages] = useState<RfqOpsMessage[]>([]);
  const [active, setActive] = useState<RfqOpsConversation | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const uploadMessageIdRef = useRef("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [newMessagesBelow, setNewMessagesBelow] = useState(false);
  const [present, setPresent] = useState<RfqOpsPresence[]>([]);

  const loadConversationPage = useCallback(async ({ cursor }: { cursor: RfqOpsCursor | null; signal: AbortSignal }) => {
    const page = await (mode === "buyer" ? listWorkspaceOpsConversations({ before: cursor, limit: 50 }) : listIntoolsBuyerConversations({ before: cursor, limit: 50 }));
    return { items: page.conversations, nextCursor: page.next_before, hasMore: Boolean(page.next_before) };
  }, [mode]);
  const { items: conversations, setItems: setConversations, loading: loadingList, hasMore: conversationHasMore, error: conversationError, reload: reloadConversations, loadMore: loadMoreConversations } = useInfiniteList<RfqOpsConversation, RfqOpsCursor>(`rfq-ops-conversations:${mode}`, loadConversationPage);

  const loadThread = useCallback(async (conversation: RfqOpsConversation, silent = false) => {
    if (!silent) setLoadingThread(true);
    setError(""); setActive(conversation);
    try {
      const page = await (mode === "buyer" ? listWorkspaceOpsMessages(conversation.id, { limit: 50 }) : listIntoolsBuyerMessages(conversation.id, { limit: 50 }));
      setMessages([...page.messages].reverse());
      const last = page.messages[0]?.id ?? null;
      await (mode === "buyer" ? markWorkspaceOpsConversationRead(conversation.id, last) : markIntoolsBuyerConversationRead(conversation.id, last));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not load this conversation."); }
    finally { if (!silent) setLoadingThread(false); }
  }, []);

  const mergeMessage = useCallback((next: RfqOpsMessage) => {
    setMessages((current) => {
      const existing = current.findIndex((item) => item.id === next.id);
      const merged = existing === -1 ? [...current, next] : current.map((item) => item.id === next.id ? { ...item, ...next } : item);
      return [...merged].sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
    });
  }, []);
  const updateConversationPreview = useCallback((message: Pick<RfqOpsMessage, "conversation_id" | "body" | "created_at" | "sender_role">) => {
    setConversations((current) => [...current.map((item) => item.id === message.conversation_id ? {
      ...item,
      last_message_body: message.body,
      last_message_at: message.created_at,
      last_message_sender_role: message.sender_role,
    } : item)].sort((left, right) => (right.last_message_at || "").localeCompare(left.last_message_at || "")));
  }, []);

  useEffect(() => {
    const node = conversationSentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMoreConversations();
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [conversations.length, loadMoreConversations]);
  useEffect(() => {
    if (!selectedCaseId || !conversations.length) return;
    const next = conversations.find((item) => item.rfq_case_id === selectedCaseId);
    if (next && next.id !== active?.id) void loadThread(next);
  }, [active?.id, conversations, loadThread, selectedCaseId]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let unsubscribe = () => {};
    void subscribeToRfqOpsMessages(active.id, (incoming) => {
      // Broadcast is the fast path: place the immutable message row directly
      // into this thread. The guarded one-message read below merely enriches
      // it with attachment metadata; it never refreshes the conversation.
      mergeMessage({
        ...incoming,
        sender_role: incoming.sender_kind === "buyer" ? "buyer" : "ops",
        attachments: [],
      });
      updateConversationPreview({
        ...incoming,
        sender_role: incoming.sender_kind === "buyer" ? "buyer" : "ops",
      });
      void getRfqOpsMessage(incoming.id).then(mergeMessage).catch(() => {
        // The text row already rendered; a failed enrichment must not interrupt live chat.
      });
      void (mode === "buyer" ? markWorkspaceOpsConversationRead(active.id, incoming.id) : markIntoolsBuyerConversationRead(active.id, incoming.id));
      onUnreadCount?.();
    }).then((subscription) => {
      if (cancelled) subscription.unsubscribe();
      else unsubscribe = subscription.unsubscribe;
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Live updates are unavailable.");
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [active, mergeMessage, mode, onUnreadCount, updateConversationPreview]);
  useEffect(() => {
    if (!active) return;
    let unsubscribe = () => {};
    void getWorkspaceProfile().then((profile) => subscribeToRfqOpsPresence(active.id, { name: profile.full_name, avatarUrl: profile.avatar_url, role: mode === "buyer" ? "buyer" : "ops" }, setPresent)).then((subscription) => { unsubscribe = subscription.unsubscribe; }).catch(() => setPresent([]));
    return () => unsubscribe();
  }, [active, mode]);
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
    if (nearBottom) {
      node.scrollTo({ top: node.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
      setNewMessagesBelow(false);
    } else {
      setNewMessagesBelow(true);
    }
  }, [active?.id, messages.length, reduceMotion]);

  async function chooseFiles(files: FileList | null) {
    const values = Array.from(files || []);
    if (!values.length || !active) return;
    const invalid = values.find((file) => !ACCEPTED.has(file.type) || file.size > MAX_BYTES);
    if (invalid) { setError("Use a JPG, PNG, WebP, PDF, MP4, MOV, or WebM file up to 25 MB."); return; }
    // Committed synchronously (not via state) so two rapid picks before the
    // first batch's upload resolves still share one client_message_id instead
    // of reserving attachments under an id that never makes it into state.
    const clientMessageId = uploadMessageIdRef.current || createRfqOpsMessageId();
    uploadMessageIdRef.current = clientMessageId;
    try {
      const next = await Promise.all(values.slice(0, 10 - attachments.length).map(async (file) => {
        const reservation = await (mode === "buyer" ? reserveWorkspaceOpsUpload({ conversationId: active.id, clientMessageId, originalName: file.name }) : reserveIntoolsBuyerUpload({ conversationId: active.id, clientMessageId, originalName: file.name }));
        return { id: reservation.id, file, reservation, upload: await uploadRfqOpsAttachment({ reservation, file }) };
      }));
      setAttachments((current) => [...current, ...next.map(({ id, file, reservation, upload }) => ({ id, file, reservation, upload }))]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not add that attachment."); }
  }

  async function removeAttachment(item: PendingAttachment) {
    setAttachments((current) => current.filter((entry) => entry.id !== item.id));
    if (item.reservation) try { await cancelRfqOpsAttachmentUpload(item.reservation); } catch { /* sent objects remain server-authoritative */ }
  }

  async function send() {
    if (!active || sending || (!draft.trim() && !attachments.length)) return;
    setSending(true); setError("");
    try {
      // Each attachment is reserved against the message id generated before upload.
      // Current UI accepts one batch, so send its reservation-compatible descriptors.
      const clientMessageId = uploadMessageIdRef.current || createRfqOpsMessageId();
      const input = { client_message_id: clientMessageId, body: draft, attachments: attachments.flatMap((item) => item.upload ? [item.upload] : []) };
      const sent = await (mode === "buyer" ? sendWorkspaceOpsMessage(active.id, input) : sendIntoolsBuyerMessage(active.id, input));
      mergeMessage(sent);
      updateConversationPreview(sent);
      setDraft(""); setAttachments([]); uploadMessageIdRef.current = ""; onUnreadCount?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not send your message. Your draft is still here."); }
    finally { setSending(false); }
  }

  const unreadFor = (item: RfqOpsConversation) =>
    mode === "buyer" ? item.buyer_unread_count ?? 0 : item.ops_unread_count ?? 0;

  return (
    <Box
      aria-busy={loadingList || loadingThread}
      sx={{
        flex: 1,
        minHeight: 0,
        height: { md: "100%" },
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        backgroundColor: "#fbfbfc",
      }}
    >
      <Box
        sx={{
          width: { xs: "100%", md: 340 },
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          borderRight: { md: "1px solid #ececef" },
          borderBottom: { xs: "1px solid #ececef", md: 0 },
          backgroundColor: "#fff",
        }}
      >
        <Box sx={{ flexShrink: 0, px: 2.5, pt: 2.5, pb: 1.75 }}>
          <Typography component="h1" sx={{ fontSize: 20, fontWeight: 500, letterSpacing: "-.03em", color: "#202936" }}>
            Messages
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: 12, color: "#9ba1aa" }}>
            Your Atelix Operations conversations.
          </Typography>
        </Box>
        {(error || conversationError) && (
          <Alert
            severity="error"
            sx={{ mx: 1.5, mb: 1, fontSize: 12 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  void reloadConversations();
                  if (active) void loadThread(active);
                }}
              >
                Retry
              </Button>
            }
          >
            {error || conversationError}
          </Alert>
        )}
        <Box sx={{ flex: 1, minHeight: 0, maxHeight: { xs: 300, md: "none" }, overflowY: "auto", overscrollBehavior: "contain" }}>
          {loadingList ? (
            <Stack spacing={1.25} sx={{ p: 2 }}>
              <Skeleton height={44} />
              <Skeleton height={44} />
              <Skeleton height={44} />
            </Stack>
          ) : conversations.length ? (
            <>
              {conversations.map((item) => {
                const unread = unreadFor(item);
                const selected = item.id === active?.id;
                return (
                  <Box
                    key={item.id}
                    component="button"
                    type="button"
                    onClick={() => {
                      onSelectCase(item.rfq_case_id);
                      void loadThread(item);
                    }}
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1.375,
                      width: "100%",
                      textAlign: "left",
                      px: 2.5,
                      py: 1.625,
                      border: 0,
                      borderBottom: "1px solid #f0f0f2",
                      background: selected ? "#f0f1f3" : "#fff",
                      cursor: "pointer",
                      "&:hover": { background: selected ? "#f0f1f3" : "#fcfdfc" },
                      "&:focus-visible": { outline: "3px solid rgba(75,118,87,.32)", outlineOffset: -3 },
                    }}
                  >
                    <Avatar
                      aria-hidden
                      sx={{ width: 34, height: 34, flexShrink: 0, bgcolor: "#eef4ee", color: "#4b7657", fontSize: 11, fontWeight: 700 }}
                    >
                      AO
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                        <Typography noWrap sx={{ minWidth: 0, fontSize: 13, fontWeight: 700, color: "#202936" }}>
                          {conversationTitle(item)}
                        </Typography>
                        <Typography sx={{ flexShrink: 0, fontSize: 10.5, color: "#9ba1aa" }}>
                          {relativeShort(item.last_message_at)}
                        </Typography>
                      </Box>
                      <Typography noWrap sx={{ mt: 0.25, fontSize: 12, color: "#9ba1aa" }}>
                        {item.last_message_body || "No messages yet"}
                      </Typography>
                    </Box>
                    {unread > 0 && (
                      <Box
                        component="span"
                        aria-label={`${unread} unread`}
                        sx={{ flexShrink: 0, mt: 0.75, width: 7, height: 7, borderRadius: "999px", backgroundColor: "#4b7657" }}
                      />
                    )}
                  </Box>
                );
              })}
              <Box ref={conversationSentinel} aria-hidden="true" sx={{ height: conversationHasMore ? 1 : 0 }} />
              {conversationHasMore && (
                <Typography role="status" sx={{ px: 2.5, py: 1.25, fontSize: 11, color: "#9ba1aa" }}>
                  More conversations load as you reach the end.
                </Typography>
              )}
            </>
          ) : (
            <Box sx={{ p: 3 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#202936" }}>No conversations yet</Typography>
              <Typography sx={{ mt: 0.5, fontSize: 12, color: "#9ba1aa", lineHeight: 1.5 }}>
                Messages appear here when Atelix Operations updates a request.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", backgroundColor: "#fbfbfc" }}>
        {!active ? (
          <Box sx={{ flex: 1, display: "grid", placeItems: "center", p: 4, textAlign: "center" }}>
            <Box>
              <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, color: "#202936" }}>
                Choose a request
              </Typography>
              <Typography sx={{ mt: 0.75, maxWidth: 340, fontSize: 13, color: "#9ba1aa" }}>
                Select a request to view its conversation with Atelix Operations.
              </Typography>
            </Box>
          </Box>
        ) : (
          <>
            <Box
              sx={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                px: 3,
                py: 2,
                borderBottom: "1px solid #ececef",
                backgroundColor: "#fff",
              }}
            >
              <Avatar aria-hidden sx={{ width: 30, height: 30, flexShrink: 0, bgcolor: "#eef4ee", color: "#4b7657", fontSize: 10.5, fontWeight: 700 }}>
                AO
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: "#202936" }}>
                  {conversationTitle(active)}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: "#9ba1aa" }}>
                  Atelix Operations{active.case_no ? ` · ${active.case_no}` : ""}
                </Typography>
              </Box>
              {present.length > 0 && (
                <Stack direction="row" spacing={-0.5} sx={{ flexShrink: 0 }} aria-label={`${present.length} active`}>
                  {present.slice(0, 3).map((person, index) => (
                    <Avatar
                      key={`${person.role}-${person.name}-${index}`}
                      src={person.avatarUrl || undefined}
                      sx={{ width: 24, height: 24, fontSize: 10, border: "2px solid #fff", bgcolor: person.role === "ops" ? "#4b7657" : "#b78a20" }}
                    >
                      {person.name.slice(0, 1).toUpperCase()}
                    </Avatar>
                  ))}
                </Stack>
              )}
            </Box>

            <Box
              ref={scrollRef}
              sx={{ flex: 1, minHeight: { xs: 320, md: 0 }, overflowY: "auto", overscrollBehavior: "contain", px: { xs: 2, sm: 3.5 }, py: 2.75, display: "flex", flexDirection: "column", gap: 1.75 }}
            >
              {loadingThread ? (
                <Stack spacing={2}>
                  <Skeleton width="58%" height={54} />
                  <Skeleton sx={{ alignSelf: "flex-end" }} width="52%" height={48} />
                </Stack>
              ) : (
                messages.map((item) => {
                  const isBuyer = item.sender_role === "buyer";
                  return (
                    <Box key={item.id} sx={{ display: "flex", justifyContent: isBuyer ? "flex-end" : "flex-start" }}>
                      <Box
                        sx={{
                          maxWidth: "76%",
                          px: 1.875,
                          py: 1.375,
                          borderRadius: isBuyer ? "14px 14px 3px 14px" : "3px 14px 14px 14px",
                          backgroundColor: isBuyer ? "#fdf3d3" : "#fff",
                          boxShadow: isBuyer ? "none" : "0 3px 8px rgba(32,41,54,.06)",
                        }}
                      >
                        <Typography sx={{ color: "#202936", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13.5, lineHeight: 1.55 }}>
                          {item.body}
                        </Typography>
                        {item.attachments.map((attachment) => (
                          <Button
                            key={attachment.id}
                            size="small"
                            startIcon={attachment.content_type === "application/pdf" ? <Description /> : <InsertDriveFile />}
                            onClick={() =>
                              void createRfqOpsAttachmentSignedUrl(attachment)
                                .then((url) => window.open(url, "_blank", "noopener,noreferrer"))
                                .catch((cause) => setError(cause instanceof Error ? cause.message : "We could not open that attachment."))
                            }
                            sx={{ mt: 0.75, justifyContent: "flex-start", color: "#45556b", textTransform: "none" }}
                          >
                            {attachment.original_name}
                          </Button>
                        ))}
                      </Box>
                    </Box>
                  );
                })
              )}
            </Box>

            {newMessagesBelow && (
              <Button
                size="small"
                onClick={() => {
                  const node = scrollRef.current;
                  if (!node) return;
                  node.scrollTo({ top: node.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
                  setNewMessagesBelow(false);
                }}
                sx={{ alignSelf: "center", mb: 0.5, textTransform: "none", fontSize: 12 }}
              >
                New messages
              </Button>
            )}

            <Box sx={{ flexShrink: 0, px: 3, pt: 2, pb: 2.75 }}>
              {attachments.length > 0 && (
                <Stack direction="row" spacing={0.75} sx={{ mb: 1, flexWrap: "wrap" }}>
                  {attachments.map((item) => (
                    <Chip key={item.id} label={item.file.name} onDelete={() => void removeAttachment(item)} deleteIcon={<Close />} sx={{ maxWidth: "100%" }} />
                  ))}
                </Stack>
              )}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 0.75,
                  p: 0.75,
                  pl: 1,
                  borderRadius: "13px",
                  backgroundColor: "#fff",
                  boxShadow: "0 3px 8px rgba(32,41,54,.06)",
                }}
              >
                <IconButton
                  aria-label="Add an attachment"
                  onClick={() => fileInput.current?.click()}
                  disabled={sending || attachments.length >= 10}
                  sx={{ flexShrink: 0, width: 34, height: 34, color: "#697586" }}
                >
                  <AttachFile sx={{ fontSize: 18 }} />
                </IconButton>
                <input
                  ref={fileInput}
                  hidden
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/quicktime,video/webm"
                  onChange={(event) => {
                    void chooseFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
                <Box
                  component="textarea"
                  rows={1}
                  value={draft}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
                  onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Message Atelix Operations…"
                  aria-label="Message to Atelix Operations"
                  maxLength={12000}
                  disabled={sending}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 34,
                    maxHeight: 132,
                    resize: "none",
                    border: 0,
                    outline: 0,
                    background: "transparent",
                    font: "inherit",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: "#202936",
                    py: 0.75,
                    "&::placeholder": { color: "#9ba1aa" },
                  }}
                />
                <IconButton
                  aria-label={sending ? "Sending" : "Send message"}
                  aria-busy={sending}
                  disabled={sending || (!draft.trim() && !attachments.length)}
                  onClick={() => void send()}
                  sx={{
                    flexShrink: 0,
                    width: 34,
                    height: 34,
                    borderRadius: "10px",
                    color: "#fff",
                    backgroundColor: !sending && (draft.trim() || attachments.length) ? "#4b7657" : "#d7dbe1",
                    "&:hover": { backgroundColor: !sending && (draft.trim() || attachments.length) ? "#3d6548" : "#d7dbe1" },
                    "&.Mui-disabled": { color: "#fff", backgroundColor: "#d7dbe1" },
                  }}
                >
                  <Send sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
