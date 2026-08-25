import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, Divider, IconButton, List, ListItemButton,
  Skeleton, Stack, TextField, Typography,
} from "@mui/material";
import { AttachFile, Close, Description, InsertDriveFile, Send } from "@mui/icons-material";
import {
  cancelRfqOpsAttachmentUpload, createRfqOpsAttachmentSignedUrl,
  createRfqOpsMessageId, listIntoolsBuyerConversations, listIntoolsBuyerMessages,
  listWorkspaceOpsConversations, listWorkspaceOpsMessages, markIntoolsBuyerConversationRead,
  markWorkspaceOpsConversationRead, reserveIntoolsBuyerUpload, reserveWorkspaceOpsUpload,
  sendIntoolsBuyerMessage, sendWorkspaceOpsMessage, subscribeToRfqOpsMessages,
  uploadRfqOpsAttachment, type RfqOpsAttachmentUpload, type RfqOpsConversation,
  type RfqOpsMessage, type RfqOpsCursor,
} from "./supabase";

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 25 * 1024 * 1024;

function messageTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
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
  const [conversations, setConversations] = useState<RfqOpsConversation[]>([]);
  const conversationCursor = useRef<RfqOpsCursor | null>(null);
  const conversationHasMore = useRef(true);
  const conversationLoading = useRef(false);
  const conversationSentinel = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<RfqOpsMessage[]>([]);
  const [active, setActive] = useState<RfqOpsConversation | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [uploadMessageId, setUploadMessageId] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [newMessagesBelow, setNewMessagesBelow] = useState(false);

  const loadConversations = useCallback(async (append = false) => {
    if (conversationLoading.current || (append && !conversationHasMore.current)) return;
    conversationLoading.current = true;
    if (!append) setLoadingList(true);
    try {
      const page = await (mode === "buyer"
        ? listWorkspaceOpsConversations({ before: append ? conversationCursor.current : null, limit: 50 })
        : listIntoolsBuyerConversations({ before: append ? conversationCursor.current : null, limit: 50 }));
      setConversations((current) => append ? [...current, ...page.conversations] : page.conversations);
      conversationCursor.current = page.next_before;
      conversationHasMore.current = Boolean(page.next_before);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not load your messages."); }
    finally { conversationLoading.current = false; setLoadingList(false); }
  }, []);

  const loadThread = useCallback(async (conversation: RfqOpsConversation) => {
    setLoadingThread(true); setError(""); setActive(conversation);
    try {
      const page = await (mode === "buyer" ? listWorkspaceOpsMessages(conversation.id, { limit: 50 }) : listIntoolsBuyerMessages(conversation.id, { limit: 50 }));
      setMessages([...page.messages].reverse());
      const last = page.messages[0]?.id ?? null;
      await (mode === "buyer" ? markWorkspaceOpsConversationRead(conversation.id, last) : markIntoolsBuyerConversationRead(conversation.id, last));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not load this conversation."); }
    finally { setLoadingThread(false); }
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => {
    const node = conversationSentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadConversations(true);
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [conversations.length, loadConversations]);
  useEffect(() => {
    if (!selectedCaseId || !conversations.length) return;
    const next = conversations.find((item) => item.rfq_case_id === selectedCaseId);
    if (next && next.id !== active?.id) void loadThread(next);
  }, [active?.id, conversations, loadThread, selectedCaseId]);
  useEffect(() => {
    if (!active) return;
    const subscription = subscribeToRfqOpsMessages(active.id, () => {
      void loadThread(active); void loadConversations(); onUnreadCount?.();
    });
    return subscription.unsubscribe;
  }, [active, loadConversations, loadThread, onUnreadCount]);
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
    if (nearBottom) {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      setNewMessagesBelow(false);
    } else {
      setNewMessagesBelow(true);
    }
  }, [messages.length]);

  async function chooseFiles(files: FileList | null) {
    const values = Array.from(files || []);
    if (!values.length || !active) return;
    const invalid = values.find((file) => !ACCEPTED.has(file.type) || file.size > MAX_BYTES);
    if (invalid) { setError("Use a JPG, PNG, WebP, or PDF up to 25 MB."); return; }
    const clientMessageId = uploadMessageId || createRfqOpsMessageId();
    try {
      const next = await Promise.all(values.slice(0, 10 - attachments.length).map(async (file) => {
        const reservation = await (mode === "buyer" ? reserveWorkspaceOpsUpload({ conversationId: active.id, clientMessageId, originalName: file.name }) : reserveIntoolsBuyerUpload({ conversationId: active.id, clientMessageId, originalName: file.name }));
        return { id: reservation.id, file, reservation, upload: await uploadRfqOpsAttachment({ reservation, file }) };
      }));
      setUploadMessageId(clientMessageId);
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
      const clientMessageId = uploadMessageId || createRfqOpsMessageId();
      const input = { client_message_id: clientMessageId, body: draft, attachments: attachments.flatMap((item) => item.upload ? [item.upload] : []) };
      const sent = await (mode === "buyer" ? sendWorkspaceOpsMessage(active.id, input) : sendIntoolsBuyerMessage(active.id, input));
      setMessages((current) => current.some((item) => item.id === sent.id) ? current : [...current, sent]);
      setDraft(""); setAttachments([]); setUploadMessageId(""); void loadConversations(); onUnreadCount?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not send your message. Your draft is still here."); }
    finally { setSending(false); }
  }

  return <Box sx={{ minHeight: 560 }} aria-busy={loadingList || loadingThread}>
    <Stack spacing={0.75} sx={{ mb: 2.25 }}>
      <Typography component="h1" sx={{ color: "#202936", fontSize: { xs: 30, sm: 38 }, fontWeight: 500, letterSpacing: "-.04em" }}>Messages</Typography>
      <Typography sx={{ color: "#667384", fontSize: 14 }}>Human updates with Atelix about each sourcing request.</Typography>
    </Stack>
    {error && <Alert severity="error" sx={{ mb: 1.5 }} action={<Button color="inherit" size="small" onClick={() => { void loadConversations(); if (active) void loadThread(active); }}>Retry</Button>}>{error}</Alert>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(280px, .72fr) minmax(0,1.55fr)" }, height: { md: "calc(100dvh - 232px)" }, minHeight: 0, border: "1px solid #dfe4eb", borderRadius: "14px", overflow: "hidden", bgcolor: "#fff" }}>
      <Box sx={{ display: "flex", minHeight: 0, flexDirection: "column", borderRight: { md: "1px solid #e7ebf0" }, borderBottom: { xs: "1px solid #e7ebf0", md: 0 }, minWidth: 0 }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid #e7ebf0" }}><Typography sx={{ fontSize: 12, fontWeight: 800, color: "#526176", letterSpacing: ".04em", textTransform: "uppercase" }}>Requests {typeof unreadCount === "number" && unreadCount > 0 ? <Chip size="small" label={unreadCount} sx={{ ml: .75, height: 22, bgcolor: "#e8f2eb", color: "#326143", fontWeight: 800 }} /> : null}</Typography></Box>
        <Box sx={{ minHeight: 0, flex: 1, maxHeight: { xs: 380, md: "none" }, overflowY: "auto", overscrollBehavior: "contain" }}>
          {loadingList ? <Stack spacing={1.25} sx={{ p: 2 }}><Skeleton height={48}/><Skeleton height={48}/><Skeleton height={48}/></Stack> : conversations.length ? <List disablePadding aria-label="Request conversations">{conversations.map((item) => <ListItemButton key={item.id} selected={item.id === active?.id} onClick={() => { onSelectCase(item.rfq_case_id); void loadThread(item); }} sx={{ display: "block", px: 2, py: 1.5, borderRadius: 0, borderBottom: "1px solid #eef0f3", "&.Mui-selected": { bgcolor: "#f2f7f3", boxShadow: "inset 3px 0 #4b7657" } }}><Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}><Typography noWrap sx={{ minWidth: 0, fontSize: 13, fontWeight: 800 }}>{conversationTitle(item)}</Typography><Typography sx={{ flexShrink: 0, color: "#778191", fontSize: 11 }}>{messageTime(item.last_message_at)}</Typography></Stack><Typography noWrap sx={{ mt: .4, color: "#667384", fontSize: 12 }}>{item.last_message_body || "No messages yet"}</Typography></ListItemButton>)}<Box ref={conversationSentinel} sx={{ minHeight: 1 }} />{conversationHasMore.current && <Typography role="status" sx={{ px: 2, py: 1, color: "#778191", fontSize: 11 }}>More conversations load as you reach the end.</Typography>}</List> : <Box sx={{ p: 3 }}><Typography sx={{ fontWeight: 700 }}>No request conversations yet</Typography><Typography sx={{ mt: .5, color: "#667384", fontSize: 13 }}>Messages appear here when an Atelix team member updates a request.</Typography></Box>}
        </Box>
      </Box>
      <Stack sx={{ height: { md: "100%" }, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {!active ? <Stack sx={{ flex: 1, alignItems: "center", justifyContent: "center", p: 4, textAlign: "center" }}><Typography component="h2" sx={{ fontSize: 20, fontWeight: 700 }}>Choose a request</Typography><Typography sx={{ mt: .75, maxWidth: 360, color: "#667384", fontSize: 14 }}>Select a request to view its conversation with Atelix.</Typography></Stack> : <><Box sx={{ flexShrink: 0, px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: "1px solid #e7ebf0" }}><Typography sx={{ fontWeight: 800 }}>{conversationTitle(active)}</Typography><Typography sx={{ mt: .25, color: "#667384", fontSize: 12 }}>Atelix Operations</Typography></Box><Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", p: { xs: 2, sm: 2.5 }, bgcolor: "#fcfcfd" }}>{loadingThread ? <Stack spacing={2}><Skeleton width="58%" height={68}/><Skeleton sx={{ alignSelf: "flex-end" }} width="52%" height={62}/></Stack> : <Stack spacing={2}>{messages.map((item) => <Box key={item.id} sx={{ alignSelf: item.sender_kind === "buyer" ? "flex-end" : "flex-start", maxWidth: "78%" }}><Typography sx={{ mb: .45, color: "#667384", fontSize: 11, fontWeight: 800, textAlign: item.sender_kind === "buyer" ? "right" : "left" }}>{item.sender_label} · {messageTime(item.created_at)}</Typography><Box sx={{ px: 1.5, py: 1.25, borderRadius: item.sender_kind === "buyer" ? "14px 14px 4px 14px" : "4px 14px 14px 14px", bgcolor: item.sender_kind === "buyer" ? "#edf1ee" : "#fff", border: item.sender_kind === "buyer" ? "none" : "1px solid #e5e9ee" }}><Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 14, lineHeight: 1.55 }}>{item.body}</Typography>{item.attachments.map((attachment) => <Button key={attachment.id} size="small" startIcon={attachment.content_type === "application/pdf" ? <Description /> : <InsertDriveFile />} onClick={() => void createRfqOpsAttachmentSignedUrl(attachment).then((url) => window.open(url, "_blank", "noopener,noreferrer")).catch((cause) => setError(cause instanceof Error ? cause.message : "We could not open that attachment."))} sx={{ mt: .75, justifyContent: "flex-start", color: "#45556b" }}>{attachment.original_name}</Button>)}</Box></Box>)}</Stack>}</Box>{newMessagesBelow && <Button size="small" onClick={() => { const node = scrollRef.current; if (!node) return; node.scrollTo({ top: node.scrollHeight, behavior: "smooth" }); setNewMessagesBelow(false); }}>New messages</Button>}<Divider/><Stack spacing={1} sx={{ flexShrink: 0, p: { xs: 1.5, sm: 2 }}}>{attachments.length > 0 && <Stack direction="row" spacing={.75} sx={{ flexWrap: "wrap" }}>{attachments.map((item) => <Chip key={item.id} label={item.file.name} onDelete={() => void removeAttachment(item)} deleteIcon={<Close />} sx={{ maxWidth: "100%" }}/>)}</Stack>}<TextField multiline minRows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message to Atelix…" slotProps={{ htmlInput: { maxLength: 12000, "aria-label": "Message to Atelix" } }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} disabled={sending}/><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}><IconButton aria-label="Add an attachment" onClick={() => fileInput.current?.click()} disabled={sending || attachments.length >= 10}><AttachFile /></IconButton><input ref={fileInput} hidden type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { void chooseFiles(event.target.files); event.currentTarget.value = ""; }}/><Button variant="contained" endIcon={<Send />} disabled={sending || (!draft.trim() && !attachments.length)} onClick={() => void send()} aria-busy={sending}>{sending ? "Sending" : "Send message"}</Button></Stack></Stack></>}
      </Stack>
    </Box>
  </Box>;
}
