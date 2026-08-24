import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme,
} from "@mui/material";
import {
  Add,
  ArrowBack,
  ArrowForward,
  Close,
  Description,
  ErrorOutlined,
  LockOutlined,
  MoreHoriz,
  Refresh,
  Send,
} from "@mui/icons-material";
import {
  cancelIntoolsInvoice,
  assertIntoolsAdmin,
  confirmIntoolsRfqOrder,
  createIntoolsInvoice,
  declineIntoolsRfqQuote,
  generateIntoolsRfqSupplierMatches,
  getIntoolsInvoiceDetail,
  getIntoolsOrderDetail,
  getIntoolsRfqOrder,
  getLocalIntoolsSession,
  getSession,
  getUserDisplayName,
  loginLocalIntools,
  listIntoolsAudit,
  listIntoolsAgentKnowledge,
  listIntoolsInvoices,
  listIntoolsRfqs,
  getIntoolsRfqDetail,
  saveIntoolsRfqQuote,
  updateIntoolsRfqStatus,
  listIntoolsRegistrationRequests,
  listIntoolsOrders,
  listIntoolsRfqCases,
  listIntoolsRfqQuotes,
  listIntoolsSuppliers,
  uploadIntoolsAgentKnowledge,
  publishIntoolsAgentKnowledge,
  archiveIntoolsAgentKnowledge,
  publishIntoolsRfqQuote,
  recordIntoolsManualPayment,
  sendIntoolsInvoice,
  setIntoolsRfqSupplierMatchStatus,
  updateIntoolsOrderStatus,
  updateIntoolsInvoice,
  updateIntoolsOrderProductionStage,
  upsertIntoolsRfqQuote,
  type IntoolsCreateInvoicePayload,
  type IntoolsInvoice,
  type IntoolsInvoiceAudit,
  type IntoolsInvoiceDetail,
  type IntoolsRfq,
  type IntoolsRfqDetail,
  type LegacyIntoolsRfqQuotePayload,
  type IntoolsManualPaymentPayload,
  type IntoolsOrder,
  type IntoolsOrderDetail,
  type IntoolsRegistrationRequest,
  type IntoolsRfqCase,
  type IntoolsRfqQuote,
  type IntoolsRfqSupplierMatch,
  type IntoolsSupplier,
  type IntoolsAgentKnowledgeDocument,
  approveRegistrationRequest,
} from "./supabase";
import { IntoolsSuppliers } from "./intools-suppliers";

const intoolsTheme = createTheme({
  typography: {
    fontFamily: "'DM Sans', Arial, sans-serif",
    h1: { fontWeight: 500, letterSpacing: "-.04em" },
    h2: { fontWeight: 600, letterSpacing: "-.03em" },
    button: { fontWeight: 700, textTransform: "none" },
  },
  palette: {
    background: { default: "#f4f6f9", paper: "#fff" },
    text: { primary: "#202936", secondary: "#758091" },
    primary: { main: "#45556b", dark: "#334256", contrastText: "#fff" },
    success: { main: "#28704b" },
    warning: { main: "#9a6a14" },
    error: { main: "#a33b36" },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, minHeight: 42, paddingInline: 16 },
      },
    },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 14, maxWidth: 560 } },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 6 } } },
  },
});

type Tab =
  | "invoices"
  | "rfq"
  | "rfqs"
  | "orders"
  | "audit"
  | "registrations"
  | "knowledge"
  | "suppliers";
type ActionDialog = "cancel" | "payment" | null;
type DraftLine = {
  description: string;
  quantity: string;
  unitAmount: string;
  taxAmount: string;
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "A"
  );
}
type InvoiceFormState = {
  buyerProfileId: string;
  rfqCaseId: string;
  orderId: string;
  dueDate: string;
  notes: string;
  line: DraftLine;
};
const emptyForm: InvoiceFormState = {
  buyerProfileId: "",
  rfqCaseId: "",
  orderId: "",
  dueDate: "",
  notes: "",
  line: { description: "", quantity: "1", unitAmount: "", taxAmount: "0" },
};

function money(cents: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number(cents) || 0) / 100);
}
function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}
function navigate(path: string) {
  history.replaceState({}, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

type IntoolsRoute = {
  tab: Tab;
  rfqId: string | null;
  requestId: string | null;
  invoiceId: string | null;
  creatingInvoice: boolean;
  supplierId: string | null;
};

function parseIntoolsRoute(pathname = location.pathname): IntoolsRoute {
  const supplier = /^\/intools\/suppliers(?:\/([^/]+))?$/.exec(pathname);
  if (supplier)
    return {
      tab: "suppliers",
      rfqId: null,
      requestId: null,
      invoiceId: null,
      creatingInvoice: false,
      supplierId: supplier[1] ? decodeURIComponent(supplier[1]) : null,
    };
  const rfq = /^\/intools\/rfq(?:\/([^/]+))?$/.exec(pathname);
  if (rfq)
    return {
      tab: "rfq",
      rfqId: rfq[1] ? decodeURIComponent(rfq[1]) : null,
      requestId: null,
      invoiceId: null,
      creatingInvoice: false,
      supplierId: null,
    };
  const invoice = /^\/intools\/invoices(?:\/([^/]+))?$/.exec(pathname);
  if (invoice) {
    const id = invoice[1] ? decodeURIComponent(invoice[1]) : null;
    return {
      tab: "invoices",
      rfqId: null,
      requestId: null,
      invoiceId: id === "new" ? null : id,
      creatingInvoice: id === "new",
      supplierId: null,
    };
  }
  const requests = /^\/intools\/requests(?:\/([^/]+))?$/.exec(pathname);
  if (requests)
    return {
      tab: "rfqs",
      rfqId: null,
      requestId: requests[1] ? decodeURIComponent(requests[1]) : null,
      invoiceId: null,
      creatingInvoice: false,
      supplierId: null,
    };
  const tab = pathname.match(/^\/intools\/(orders|audit|registrations|knowledge)$/)?.[1] as
    | Exclude<Tab, "invoices" | "rfq" | "rfqs" | "suppliers">
    | undefined;
  return {
    tab: tab || "invoices",
    rfqId: null,
    requestId: null,
    invoiceId: null,
    creatingInvoice: false,
    supplierId: null,
  };
}

function intoolsTabPath(tab: Tab) {
  if (tab === "invoices") return "/intools/invoices";
  if (tab === "rfqs") return "/intools/requests";
  return `/intools/${tab}`;
}
function displayStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusChip({ status }: { status: string }) {
  const color =
    status === "paid"
      ? "success"
      : status === "overdue"
        ? "warning"
        : status === "cancelled"
          ? "default"
          : status === "sent"
            ? "info"
            : "default";
  return (
    <Chip
      size="small"
      label={displayStatus(status)}
      color={color as "success" | "warning" | "default" | "info"}
      sx={{ textTransform: "capitalize", fontWeight: 700 }}
    />
  );
}

function Surface({
  children,
  sx = {},
  interactive: _interactive,
  ...props
}: {
  children: ReactNode;
  sx?: Record<string, unknown>;
  interactive?: boolean;
  [key: string]: unknown;
}) {
  return (
    <Paper
      elevation={0}
      {...props}
      sx={{
        border: "1px solid #dfe4eb",
        borderRadius: "14px",
        backgroundColor: "#fff",
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
}

function LoadingRows() {
  return (
    <Stack spacing={1} aria-label="Loading invoices" role="status">
      {[1, 2, 3, 4].map((key) => (
        <Surface key={key} sx={{ p: 2 }}>
          <Skeleton width="35%" />
          <Skeleton width="65%" />
          <Skeleton width="22%" />
        </Surface>
      ))}
    </Stack>
  );
}

function AccessDenied({
  kind = "permission",
  localLogin = false,
  onLoggedIn,
}: {
  kind?: "permission" | "error";
  localLogin?: boolean;
  onLoggedIn?: () => void;
}) {
  const permission = kind === "permission";
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  async function localSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      await loginLocalIntools(credentials.username, credentials.password);
      onLoggedIn?.();
    } catch (cause) {
      setLoginError(
        cause instanceof Error
          ? cause.message
          : "Local administrator sign-in failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      id="main-content"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f4f6f9",
      }}
    >
      <Surface
        sx={{
          width: "min(520px, 100%)",
          p: { xs: 3, sm: 4 },
          textAlign: "center",
        }}
      >
        <Avatar
          sx={{
            mx: "auto",
            mb: 2,
            bgcolor: permission ? "#eef1f5" : "#fff1ef",
            color: permission ? "#45556b" : "#a33b36",
          }}
        >
          {permission ? <LockOutlined /> : <ErrorOutlined />}
        </Avatar>
        <Typography variant="h1" sx={{ fontSize: { xs: 28, sm: 34 } }}>
          {permission ? "Intools access required" : "Intools is unavailable"}
        </Typography>
        <Typography sx={{ mt: 1.25, color: "text.secondary", lineHeight: 1.6 }}>
          {permission
            ? "This private workspace is available to confirmed Atelix administrators only."
            : "The workspace could not load. Try again or return to sign in."}
        </Typography>
        {localLogin && (
          <Box
            component="form"
            onSubmit={localSubmit}
            sx={{ mt: 2, textAlign: "left" }}
          >
            <Stack spacing={1.5}>
              <TextField
                required
                label="Local admin username"
                autoComplete="username"
                value={credentials.username}
                onChange={(event) =>
                  setCredentials((value) => ({
                    ...value,
                    username: event.target.value,
                  }))
                }
              />
              <TextField
                required
                label="Local admin password"
                type="password"
                autoComplete="current-password"
                value={credentials.password}
                onChange={(event) =>
                  setCredentials((value) => ({
                    ...value,
                    password: event.target.value,
                  }))
                }
              />
              {loginError && (
                <Alert severity="error" role="alert">
                  {loginError}
                </Alert>
              )}
              <Button type="submit" variant="contained" disabled={busy}>
                Sign in locally
              </Button>
            </Stack>
          </Box>
        )}
        <Stack
          direction="row"
          spacing={1}
          sx={{ mt: 2, justifyContent: "center" }}
        >
          {permission && !localLogin && (
            <Button
              variant="contained"
              onClick={() => navigate("/sign-in?next=%2Fintools")}
            >
              Sign in
            </Button>
          )}
          {!permission && (
            <Button
              variant="contained"
              onClick={() => location.reload()}
              startIcon={<Refresh />}
            >
              Try again
            </Button>
          )}
        </Stack>
      </Surface>
    </main>
  );
}

function InvoiceList({
  invoices,
  selectedId,
  onSelect,
}: {
  invoices: IntoolsInvoice[];
  selectedId: string | null;
  onSelect: (invoice: IntoolsInvoice) => void;
}) {
  if (!invoices.length)
    return (
      <Surface sx={{ p: { xs: 3, sm: 4 }, textAlign: "center" }}>
        <Description sx={{ color: "#8b96a4", fontSize: 36 }} />
        <Typography sx={{ mt: 1, fontWeight: 700 }}>
          No invoices in this view
        </Typography>
        <Typography sx={{ mt: 0.5, color: "text.secondary", fontSize: 14 }}>
          Create a draft invoice when a commercial handoff is ready.
        </Typography>
      </Surface>
    );
  return (
    <Surface sx={{ overflow: "hidden" }}>
      <Box
        aria-hidden="true"
        sx={{
          display: { xs: "none", sm: "grid" },
          gridTemplateColumns: "1.15fr 1.4fr .8fr .8fr auto",
          gap: 1.5,
          px: 2,
          py: 1.25,
          borderBottom: "1px solid #dfe4eb",
          backgroundColor: "#f6f8fa",
          color: "#526176",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: ".04em",
          textTransform: "uppercase",
        }}
      >
        <Box>Invoice</Box>
        <Box>Case</Box>
        <Box>Total</Box>
        <Box>Due</Box>
        <Box>Status</Box>
      </Box>
      <Box
        component="ul"
        aria-label="Invoices"
        sx={{ listStyle: "none", p: 0, m: 0 }}
      >
        {invoices.map((invoice) => (
          <Box
            component="li"
            key={invoice.id}
            sx={{ "&:not(:last-child)": { borderBottom: "1px solid #e8ecf1" } }}
          >
            <Button
              className="intools-row-button"
              onClick={() => onSelect(invoice)}
              fullWidth
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "minmax(0,1fr) auto",
                  sm: "1.15fr 1.4fr .8fr .8fr auto",
                },
                alignItems: "center",
                gap: { xs: 1, sm: 1.5 },
                p: { xs: 1.5, sm: 2 },
                borderRadius: 0,
                textAlign: "left",
                color: "inherit",
                textTransform: "none",
                backgroundColor: selectedId === invoice.id ? "#f1f7f2" : "#fff",
                transition: "background-color 180ms ease-out",
                "&:hover": {
                  backgroundColor:
                    selectedId === invoice.id ? "#e9f3eb" : "#f7f9fb",
                },
                "&:focus-visible": {
                  outline: "3px solid #6fae86",
                  outlineOffset: -3,
                  zIndex: 1,
                },
              }}
              aria-current={selectedId === invoice.id ? "true" : undefined}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 14,
                    fontWeight: 800,
                    overflowWrap: "anywhere",
                  }}
                >
                  {invoice.invoice_no}
                </Typography>
                <Typography
                  noWrap
                  sx={{ mt: 0.3, color: "text.secondary", fontSize: 12 }}
                >
                  {invoice.buyer_name ||
                    invoice.buyer_email ||
                    "Buyer not named"}
                </Typography>
              </Box>
              <Typography
                noWrap
                sx={{
                  display: { xs: "none", sm: "block" },
                  color: "text.secondary",
                  fontSize: 13,
                }}
              >
                {invoice.rfq_case_no || invoice.order_no || "No linked case"}
              </Typography>
              <Typography
                sx={{
                  textAlign: { xs: "right", sm: "left" },
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {money(invoice.total_cents)}
              </Typography>
              <Typography
                sx={{
                  display: { xs: "none", sm: "block" },
                  color: "text.secondary",
                  fontSize: 12,
                }}
              >
                {shortDate(invoice.due_date)}
              </Typography>
              <Box sx={{ justifySelf: { xs: "end", sm: "start" } }}>
                <StatusChip
                  status={invoice.effective_status || invoice.status}
                />
              </Box>
              <Typography
                sx={{
                  display: { xs: "block", sm: "none" },
                  gridColumn: "1 / -1",
                  color: "text.secondary",
                  fontSize: 12,
                }}
              >
                Due {shortDate(invoice.due_date)} · Balance{" "}
                {money(invoice.balance_cents)}
              </Typography>
            </Button>
          </Box>
        ))}
      </Box>
    </Surface>
  );
}

function InvoiceCreateForm({
  initial,
  onCreated,
  onCancel,
}: {
  initial?: Partial<InvoiceFormState> | null;
  onCreated: (invoice: IntoolsInvoiceDetail) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...initial }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function set<K extends keyof InvoiceFormState>(
    key: K,
    value: InvoiceFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function setLine<K extends keyof DraftLine>(key: K, value: string) {
    setForm((current) => ({
      ...current,
      line: { ...current.line, [key]: value },
    }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const quantity = Number(form.line.quantity);
    const unit = Number(form.line.unitAmount);
    const tax = Number(form.line.taxAmount || 0);
    const dueDate = form.dueDate.trim();
    if (
      !form.buyerProfileId.trim() ||
      !form.line.description.trim() ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      !Number.isInteger(unit) ||
      unit < 0 ||
      !Number.isInteger(tax) ||
      tax < 0 ||
      (dueDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))
    ) {
      setError(
        "Add a buyer profile ID, valid item values in cents, and an optional YYYY-MM-DD due date.",
      );
      return;
    }
    setBusy(true);
    try {
      const payload: IntoolsCreateInvoicePayload = {
        buyerProfileId: form.buyerProfileId.trim(),
        rfqCaseId: form.rfqCaseId.trim() || null,
        orderId: form.orderId.trim() || null,
        dueDate: dueDate || null,
        notes: form.notes.trim() || null,
        items: [
          {
            description: form.line.description.trim(),
            quantity,
            unitAmountCents: unit,
            taxAmountCents: tax,
          },
        ],
      };
      onCreated(await createIntoolsInvoice(payload));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create invoice.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Surface
      component="form"
      onSubmit={submit}
      aria-labelledby="create-invoice-title"
      sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography
            id="create-invoice-title"
            variant="h2"
            sx={{ fontSize: 20 }}
          >
            New invoice
          </Typography>
          <Typography sx={{ mt: 0.35, color: "text.secondary", fontSize: 13 }}>
            Values are sent to the server in USD cents; totals and eligibility
            are server-computed.
          </Typography>
        </Box>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))" },
            gap: 1.5,
          }}
        >
          <TextField
            required
            label="Buyer profile ID"
            value={form.buyerProfileId}
            onChange={(event) => set("buyerProfileId", event.target.value)}
            helperText="Use the confirmed profile UUID."
          />
          <TextField
            label="Due date"
            type="text"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            value={form.dueDate}
            onChange={(event) => set("dueDate", event.target.value)}
            helperText="Optional. Use YYYY-MM-DD."
          />
          <TextField
            label="RFQ case ID"
            value={form.rfqCaseId}
            onChange={(event) => set("rfqCaseId", event.target.value)}
          />
          <TextField
            label="Order ID"
            value={form.orderId}
            onChange={(event) => set("orderId", event.target.value)}
          />
          <TextField label="Currency" value="USD" disabled />
          <TextField
            label="Tax (USD cents)"
            inputMode="numeric"
            value={form.line.taxAmount}
            onChange={(event) => setLine("taxAmount", event.target.value)}
          />
        </Box>
        <Divider />
        <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
          Line item
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "minmax(0,2fr) .7fr 1fr 1fr",
            },
            gap: 1.5,
          }}
        >
          <TextField
            required
            label="Description"
            value={form.line.description}
            onChange={(event) => setLine("description", event.target.value)}
          />
          <TextField
            required
            label="Quantity"
            inputMode="numeric"
            value={form.line.quantity}
            onChange={(event) => setLine("quantity", event.target.value)}
          />
          <TextField
            required
            label="Unit amount (USD cents)"
            inputMode="numeric"
            value={form.line.unitAmount}
            onChange={(event) => setLine("unitAmount", event.target.value)}
          />
          <TextField
            label="Tax (USD cents)"
            inputMode="numeric"
            value={form.line.taxAmount}
            onChange={(event) => setLine("taxAmount", event.target.value)}
          />
        </Box>
        <TextField
          label="Notes"
          multiline
          minRows={3}
          value={form.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          <Button type="button" onClick={onCancel} disabled={busy}>
            Close
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={
              busy ? <CircularProgress size={16} color="inherit" /> : <Add />
            }
          >
            {busy ? "Creating…" : "Create draft"}
          </Button>
        </Stack>
      </Stack>
    </Surface>
  );
}

function InvoiceDetail({
  invoice,
  onChanged,
  onBack,
}: {
  invoice: IntoolsInvoiceDetail;
  onChanged: (invoice: IntoolsInvoiceDetail) => void;
  onBack: () => void;
}) {
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [payment, setPayment] = useState<IntoolsManualPaymentPayload>({
    amountCents: invoice.balance_cents,
    reference: "",
  });
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(invoice.notes || "");
  useEffect(() => {
    setNotes(invoice.notes || "");
    setEditing(false);
  }, [invoice.id, invoice.updated_at, invoice.notes]);
  async function run(
    action: () => Promise<IntoolsInvoiceDetail>,
    success: string,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      onChanged(await action());
      setMessage(success);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }
  function saveDraft(event: FormEvent) {
    event.preventDefault();
    void run(
      () =>
        updateIntoolsInvoice(invoice.id, {
          notes,
          items: invoice.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitAmountCents: item.unit_amount_cents,
            taxAmountCents: item.tax_amount_cents,
          })),
        }),
      "Draft saved.",
    );
  }
  const canSend = invoice.status === "draft";
  const canCancel = invoice.status === "draft" || invoice.status === "sent";
  const canPay = invoice.status === "sent" && invoice.balance_cents > 0;
  return (
    <Box>
      <Button
        onClick={onBack}
        startIcon={<ArrowBack />}
        sx={{ mb: 1.5, px: 0 }}
      >
        Back to invoices
      </Button>
      <Surface sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2.25}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              gap: 1.5,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h2"
                sx={{ fontSize: { xs: 24, sm: 30 }, overflowWrap: "anywhere" }}
              >
                {invoice.invoice_no}
              </Typography>
              <Typography
                sx={{ mt: 0.4, color: "text.secondary", fontSize: 13 }}
              >
                {invoice.buyer_name || invoice.buyer_email || "Buyer not named"}{" "}
                · Created {shortDate(invoice.created_at)}
              </Typography>
            </Box>
            <StatusChip status={invoice.effective_status || invoice.status} />
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Button
              variant="contained"
              disabled={!canSend || busy}
              startIcon={<Send />}
              onClick={() =>
                void run(() => sendIntoolsInvoice(invoice.id), "Invoice sent.")
              }
            >
              Send invoice
            </Button>
            <Button
              disabled={!canPay || busy}
              onClick={() => setDialog("payment")}
            >
              Record payment
            </Button>
            <Button
              color="error"
              disabled={!canCancel || busy}
              onClick={() => setDialog("cancel")}
            >
              Cancel invoice
            </Button>
            {invoice.status === "draft" && (
              <Button
                onClick={() => setEditing((value) => !value)}
                startIcon={<MoreHoriz />}
              >
                {editing ? "Close edit" : "Edit draft"}
              </Button>
            )}
          </Stack>
          {(message || error) && (
            <Alert
              severity={error ? "error" : "success"}
              role={error ? "alert" : "status"}
            >
              {error || message}
            </Alert>
          )}
          {editing && (
            <Box
              component="form"
              onSubmit={saveDraft}
              sx={{ p: 2, borderRadius: "12px", backgroundColor: "#f6f8fa" }}
            >
              <Stack spacing={1.5}>
                <Typography sx={{ fontWeight: 800 }}>
                  Edit draft notes
                </Typography>
                <TextField
                  label="Notes"
                  multiline
                  minRows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
                <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                  <Button type="submit" variant="contained" disabled={busy}>
                    Save draft
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2,minmax(0,1fr))",
                sm: "repeat(4,minmax(0,1fr))",
              },
              gap: 1.5,
            }}
          >
            <Metric label="Subtotal" value={money(invoice.subtotal_cents)} />
            <Metric label="Tax" value={money(invoice.tax_cents)} />
            <Metric label="Total" value={money(invoice.total_cents)} />
            <Metric label="Balance" value={money(invoice.balance_cents)} />
          </Box>
          <Box
            component="dl"
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))" },
              gap: 1.5,
              m: 0,
            }}
          >
            {[
              ["Buyer", invoice.buyer_email || invoice.buyer_name || "—"],
              ["Due date", shortDate(invoice.due_date)],
              ["RFQ", invoice.rfq_case_no || "—"],
              ["Order", invoice.order_no || "—"],
              ["Currency", "USD"],
              ["Notes", invoice.notes || "—"],
            ].map(([label, value]) => (
              <Box key={label as string}>
                <Typography
                  component="dt"
                  sx={{ color: "text.secondary", fontSize: 12 }}
                >
                  {label}
                </Typography>
                <Typography
                  component="dd"
                  sx={{
                    m: 0,
                    mt: 0.25,
                    fontSize: 14,
                    overflowWrap: "anywhere",
                  }}
                >
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
          <Divider />
          <Typography sx={{ fontWeight: 800 }}>Items</Typography>
          <Stack
            component="ul"
            spacing={1}
            sx={{ m: 0, p: 0, listStyle: "none" }}
          >
            {invoice.items.length ? (
              invoice.items.map((item) => (
                <Box
                  component="li"
                  key={item.id}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) auto",
                    gap: 1,
                    p: 1.25,
                    borderRadius: "10px",
                    backgroundColor: "#f6f8fa",
                  }}
                >
                  <Box>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 700,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {item.description}
                    </Typography>
                    <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                      {item.quantity} × {money(item.unit_amount_cents)} · tax{" "}
                      {money(item.tax_amount_cents)}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
                    {money(item.line_total_cents)}
                  </Typography>
                </Box>
              ))
            ) : (
              <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                No line items returned.
              </Typography>
            )}
          </Stack>
          <Divider />
          <Typography sx={{ fontWeight: 800 }}>Payment activity</Typography>
          {invoice.payments.length ? (
            <Stack spacing={1}>
              {invoice.payments.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1,
                    flexWrap: "wrap",
                    fontSize: 13,
                  }}
                >
                  <span>
                    {displayStatus(item.provider)}
                    {item.reference ? ` · ${item.reference}` : ""}
                  </span>
                  <strong>
                    {money(item.amount_cents)} · {shortDate(item.recorded_at)}
                  </strong>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
              No payments recorded. Partial allocations keep the invoice in sent
              status until fully settled.
            </Typography>
          )}
          <Divider />
          <Typography sx={{ fontWeight: 800 }}>Audit history</Typography>
          {invoice.audit.length ? (
            <Stack component="ol" spacing={1} sx={{ m: 0, pl: 2.5 }}>
              {invoice.audit.map((item) => (
                <Box component="li" key={item.id}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                    {displayStatus(item.action)}
                  </Typography>
                  <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                    {item.summary || "No summary"} ·{" "}
                    {item.admin_name || "Admin"} · {shortDate(item.created_at)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
              No audit events returned.
            </Typography>
          )}
        </Stack>
      </Surface>
      <Dialog
        open={dialog === "cancel"}
        onClose={() => !busy && setDialog(null)}
        fullWidth
      >
        <DialogTitle>Cancel {invoice.invoice_no}?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5, color: "text.secondary", fontSize: 14 }}>
            This records a server-side cancellation. Paid invoices cannot be
            cancelled.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label="Reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={busy}>
            Keep invoice
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy || reason.trim().length < 3}
            onClick={() =>
              void run(
                () => cancelIntoolsInvoice(invoice.id, reason.trim()),
                "Invoice cancelled.",
              )
            }
          >
            {busy ? "Cancelling…" : "Cancel invoice"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={dialog === "payment"}
        onClose={() => !busy && setDialog(null)}
        fullWidth
      >
        <DialogTitle>Record manual payment</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography sx={{ color: "text.secondary", fontSize: 14 }}>
              The server validates the balance and allocation. Enter USD cents.
            </Typography>
            <TextField
              autoFocus
              label="Amount (USD cents)"
              inputMode="numeric"
              value={payment.amountCents}
              onChange={(event) =>
                setPayment((value) => ({
                  ...value,
                  amountCents: Number(event.target.value),
                }))
              }
            />
            <TextField
              label="Reference"
              value={payment.reference || ""}
              onChange={(event) =>
                setPayment((value) => ({
                  ...value,
                  reference: event.target.value,
                }))
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={busy}>
            Close
          </Button>
          <Button
            variant="contained"
            disabled={
              busy ||
              !Number.isInteger(payment.amountCents) ||
              payment.amountCents <= 0
            }
            onClick={() =>
              void run(
                () => recordIntoolsManualPayment(invoice.id, payment),
                "Payment recorded.",
              )
            }
          >
            {busy ? "Recording…" : "Record payment"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: "10px", backgroundColor: "#f6f8fa" }}>
      <Typography sx={{ color: "text.secondary", fontSize: 11 }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.3, fontSize: 15, fontWeight: 800 }}>
        {value}
      </Typography>
    </Box>
  );
}

const orderStatuses = [
  "awaiting_payment",
  "payment_declared",
  "payment_verified",
  "fulfilling",
  "completed",
  "cancelled",
  "disputed",
  "refunded",
] as const;

function moneyValue(value: number | null | undefined) {
  return money(Math.round(Number(value || 0) * 100));
}

function OrderDetail({
  order,
  onBack,
  onChanged,
}: {
  order: IntoolsOrderDetail;
  onBack: () => void;
  onChanged: (order: IntoolsOrderDetail) => void;
}) {
  const [nextStatus, setNextStatus] = useState(order.status);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setNextStatus(order.status);
    setNote("");
  }, [order.order_no, order.status]);
  async function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nextStatus === order.status) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateIntoolsOrderStatus(
        order.order_no,
        nextStatus,
        note.trim() || null,
      );
      onChanged(await getIntoolsOrderDetail(order.order_no));
      setMessage("Order status updated and recorded in the activity history.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update the order status.",
      );
    } finally {
      setBusy(false);
    }
  }
  const buyer = order.buyer || {
    full_name: null,
    email: null,
    company_name: null,
    country: null,
  };
  const shippingEta =
    order.shipping_eta_min_days && order.shipping_eta_max_days
      ? `${order.shipping_eta_min_days}–${order.shipping_eta_max_days} days`
      : order.shipping_eta_min_days
        ? `${order.shipping_eta_min_days} days`
        : "—";
  return (
    <Box>
      <Button
        onClick={onBack}
        startIcon={<ArrowBack />}
        sx={{ mb: 1.5, px: 0 }}
      >
        Back to orders
      </Button>
      <Surface sx={{ overflow: "hidden" }}>
        <Box sx={{ p: { xs: 2, sm: 3 }, borderBottom: "1px solid #dfe4eb" }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              gap: 1.5,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h2"
                sx={{ fontSize: { xs: 24, sm: 30 }, overflowWrap: "anywhere" }}
              >
                {order.order_no}
              </Typography>
              <Typography
                sx={{ mt: 0.4, color: "text.secondary", fontSize: 13 }}
              >
                Placed {shortDate(order.placed_at)} ·{" "}
                {buyer.company_name || buyer.full_name || "Buyer not named"}
              </Typography>
            </Box>
            <StatusChip status={order.status} />
          </Stack>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 310px" },
            alignItems: "start",
          }}
        >
          <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
            <Box>
              <Typography component="h3" sx={{ fontSize: 15, fontWeight: 800 }}>
                Order items
              </Typography>
              <Stack
                component="ul"
                aria-label="Order items"
                spacing={0}
                sx={{
                  m: 0,
                  mt: 1.25,
                  p: 0,
                  listStyle: "none",
                  borderTop: "1px solid #e8ecf1",
                }}
              >
                {order.items.length ? (
                  order.items.map((item, index) => (
                    <Box
                      component="li"
                      key={`${item.sku || item.name || "item"}-${index}`}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,1fr) auto",
                        gap: 2,
                        py: 1.5,
                        borderBottom: "1px solid #e8ecf1",
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontSize: 14,
                            fontWeight: 800,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {item.name || "Unnamed item"}
                        </Typography>
                        <Typography
                          sx={{
                            mt: 0.25,
                            color: "text.secondary",
                            fontSize: 12,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {[
                            item.seller,
                            item.sku && `SKU ${item.sku}`,
                            item.qty
                              ? `${item.qty} × ${moneyValue(item.unit_price)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No item metadata returned"}
                        </Typography>
                        {(item.option_selection || item.buyer_note) && (
                          <Typography
                            sx={{
                              mt: 0.5,
                              color: "text.secondary",
                              fontSize: 12,
                              overflowWrap: "anywhere",
                            }}
                          >
                            {[item.option_selection, item.buyer_note]
                              .filter(Boolean)
                              .join(" · ")}
                          </Typography>
                        )}
                      </Box>
                      <Typography
                        sx={{
                          fontSize: 14,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {moneyValue(item.line_total)}
                      </Typography>
                    </Box>
                  ))
                ) : (
                  <Typography
                    sx={{ py: 1.5, color: "text.secondary", fontSize: 13 }}
                  >
                    No immutable line items returned.
                  </Typography>
                )}
              </Stack>
            </Box>

            <Box>
              <Typography component="h3" sx={{ fontSize: 15, fontWeight: 800 }}>
                Fulfillment
              </Typography>
              {order.fulfillments.length ? (
                <Stack
                  component="ul"
                  aria-label="Fulfillment records"
                  spacing={0}
                  sx={{
                    m: 0,
                    mt: 1.25,
                    p: 0,
                    listStyle: "none",
                    borderTop: "1px solid #e8ecf1",
                  }}
                >
                  {order.fulfillments.map((fulfillment, index) => (
                    <Box
                      component="li"
                      key={`${fulfillment.factory_name || "factory"}-${index}`}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: "1.2fr .8fr minmax(0,1fr)",
                        },
                        gap: 1,
                        py: 1.25,
                        borderBottom: "1px solid #e8ecf1",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: 700,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {fulfillment.factory_name || "Supplier not identified"}
                      </Typography>
                      <Typography
                        sx={{ color: "text.secondary", fontSize: 13 }}
                      >
                        {displayStatus(
                          fulfillment.fulfillment_status || "pending",
                        )}
                      </Typography>
                      <Typography
                        sx={{
                          color: "text.secondary",
                          fontSize: 13,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {fulfillment.tracking || "Tracking not recorded"}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography
                  sx={{ mt: 1, color: "text.secondary", fontSize: 13 }}
                >
                  No fulfillment records returned.
                </Typography>
              )}
            </Box>

            <Box>
              <Typography component="h3" sx={{ fontSize: 15, fontWeight: 800 }}>
                Activity
              </Typography>
              {order.events.length ? (
                <Stack
                  component="ol"
                  aria-label="Order activity"
                  spacing={0}
                  sx={{
                    m: 0,
                    mt: 1.25,
                    p: 0,
                    listStyle: "none",
                    borderTop: "1px solid #e8ecf1",
                  }}
                >
                  {order.events.map((event, index) => (
                    <Box
                      component="li"
                      key={`${event.created_at}-${index}`}
                      sx={{ py: 1.25, borderBottom: "1px solid #e8ecf1" }}
                    >
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        sx={{ justifyContent: "space-between", gap: 0.5 }}
                      >
                        <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
                          {displayStatus(event.status)}
                        </Typography>
                        <Typography
                          sx={{ color: "text.secondary", fontSize: 12 }}
                        >
                          {shortDate(event.created_at)}
                        </Typography>
                      </Stack>
                      <Typography
                        sx={{
                          mt: 0.25,
                          color: "text.secondary",
                          fontSize: 13,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {event.note || "No note recorded"}
                        {event.created_by_name
                          ? ` · ${event.created_by_name}`
                          : ""}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography
                  sx={{ mt: 1, color: "text.secondary", fontSize: 13 }}
                >
                  No status activity returned.
                </Typography>
              )}
            </Box>
          </Stack>

          <Box
            sx={{
              p: { xs: 2, sm: 3 },
              borderTop: { xs: "1px solid #dfe4eb", lg: 0 },
              borderLeft: { lg: "1px solid #dfe4eb" },
              backgroundColor: "#f6f8fa",
            }}
          >
            <Stack spacing={2.5}>
              <Box>
                <Typography
                  component="h3"
                  sx={{ fontSize: 15, fontWeight: 800 }}
                >
                  Order summary
                </Typography>
                <Stack spacing={0.85} sx={{ mt: 1.25 }}>
                  {[
                    ["Subtotal", moneyValue(order.subtotal)],
                    ["Service fee", moneyValue(order.fee)],
                    ["Shipping", moneyValue(order.ship)],
                    ["Quality control", moneyValue(order.qc_fee)],
                    ["Insurance", moneyValue(order.ins_fee)],
                  ].map(([label, value]) => (
                    <Stack
                      key={label}
                      direction="row"
                      sx={{ justifyContent: "space-between", gap: 2 }}
                    >
                      <Typography
                        sx={{ color: "text.secondary", fontSize: 13 }}
                      >
                        {label}
                      </Typography>
                      <Typography sx={{ fontSize: 13 }}>{value}</Typography>
                    </Stack>
                  ))}
                  <Divider sx={{ my: 0.35 }} />
                  <Stack
                    direction="row"
                    sx={{ justifyContent: "space-between", gap: 2 }}
                  >
                    <Typography sx={{ fontWeight: 800 }}>Total</Typography>
                    <Typography sx={{ fontWeight: 800 }}>
                      {moneyValue(order.total)}
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
              <Box component="dl" sx={{ m: 0, display: "grid", gap: 1.25 }}>
                {[
                  ["Buyer", buyer.company_name || buyer.full_name || "—"],
                  ["Email", buyer.email || "—"],
                  ["Country", buyer.country || "—"],
                  [
                    "Payment",
                    order.payment_verified_at
                      ? `Verified ${shortDate(order.payment_verified_at)}`
                      : order.payment_declared_at
                        ? `Declared ${shortDate(order.payment_declared_at)}`
                        : "Not recorded",
                  ],
                  ["Shipping", order.shipping_service || "—"],
                  ["Delivery estimate", shippingEta],
                  [
                    "Destination",
                    order.ship_address || order.ship_country || "—",
                  ],
                  ["Incoterms", order.incoterms || "—"],
                ].map(([label, value]) => (
                  <Box key={label}>
                    <Typography
                      component="dt"
                      sx={{
                        color: "text.secondary",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {label}
                    </Typography>
                    <Typography
                      component="dd"
                      sx={{
                        m: 0,
                        mt: 0.2,
                        fontSize: 13,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Box
                component="form"
                onSubmit={submitStatus}
                aria-labelledby="update-order-status-title"
                sx={{ pt: 2, borderTop: "1px solid #dfe4eb" }}
              >
                <Stack spacing={1.25}>
                  <Box>
                    <Typography
                      id="update-order-status-title"
                      component="h3"
                      sx={{ fontSize: 15, fontWeight: 800 }}
                    >
                      Update status
                    </Typography>
                    <Typography
                      sx={{ mt: 0.25, color: "text.secondary", fontSize: 12 }}
                    >
                      The change is added to the order history and buyer
                      notification workflow.
                    </Typography>
                  </Box>
                  <TextField
                    select
                    label="New status"
                    value={nextStatus}
                    onChange={(event) => setNextStatus(event.target.value)}
                    disabled={busy}
                  >
                    {orderStatuses.map((status) => (
                      <MenuItem key={status} value={status}>
                        {displayStatus(status)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Update note"
                    multiline
                    minRows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    disabled={busy}
                    helperText="Optional. This note is visible in the order activity."
                  />
                  {(message || error) && (
                    <Alert
                      severity={error ? "error" : "success"}
                      role={error ? "alert" : "status"}
                    >
                      {error || message}
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={busy || nextStatus === order.status}
                    startIcon={
                      busy ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <Refresh />
                      )
                    }
                  >
                    {busy ? "Updating…" : "Update order"}
                  </Button>
                </Stack>
              </Box>
            </Stack>
          </Box>
        </Box>
      </Surface>
    </Box>
  );
}

function OrdersPanel() {
  const [orders, setOrders] = useState<IntoolsOrder[]>([]);
  const [selected, setSelected] = useState<IntoolsOrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    void listIntoolsOrders()
      .then((data) => {
        if (active) setOrders(data);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not load orders.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (loading) return <LoadingRows />;
  if (error)
    return (
      <Alert
        severity="error"
        action={<Button onClick={() => location.reload()}>Retry</Button>}
      >
        {error}
      </Alert>
    );
  if (selected)
    return (
      <OrderDetail
        order={selected}
        onBack={() => setSelected(null)}
        onChanged={(updated) => {
          setSelected(updated);
          setOrders((items) =>
            items.map((item) =>
              item.id === updated.id
                ? { ...item, status: updated.status }
                : item,
            ),
          );
        }}
      />
    );
  return orders.length ? (
    <Surface sx={{ overflow: "hidden" }}>
      <Box
        aria-hidden="true"
        sx={{
          display: { xs: "none", sm: "grid" },
          gridTemplateColumns: "1.1fr 1.5fr .8fr .8fr auto",
          gap: 1.5,
          px: 2,
          py: 1.25,
          borderBottom: "1px solid #dfe4eb",
          backgroundColor: "#f6f8fa",
          color: "#526176",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: ".04em",
          textTransform: "uppercase",
        }}
      >
        <Box>Order</Box>
        <Box>Items</Box>
        <Box>Total</Box>
        <Box>Placed</Box>
        <Box>Status</Box>
      </Box>
      <Box
        component="ul"
        aria-label="Orders"
        sx={{ listStyle: "none", p: 0, m: 0 }}
      >
        {orders.map((order) => (
          <Box
            component="li"
            key={order.id}
            sx={{ "&:not(:last-child)": { borderBottom: "1px solid #e8ecf1" } }}
          >
            <Button
              key={order.id}
              disabled={loadingDetail}
              onClick={() => {
                setLoadingDetail(true);
                setError("");
                void getIntoolsOrderDetail(order.order_no)
                  .then(setSelected)
                  .catch((cause) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not load order detail.",
                    ),
                  )
                  .finally(() => setLoadingDetail(false));
              }}
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "minmax(0,1fr) auto",
                  sm: "1.1fr 1.5fr .8fr .8fr auto",
                },
                alignItems: "center",
                gap: 1.5,
                p: { xs: 1.5, sm: 2 },
                textAlign: "left",
                color: "inherit",
                borderRadius: 0,
                textTransform: "none",
                backgroundColor: "#fff",
                transition: "background-color 180ms ease-out",
                "&:hover": { backgroundColor: "#f7f9fb" },
                "&:focus-visible": {
                  outline: "3px solid #6fae86",
                  outlineOffset: -3,
                  zIndex: 1,
                },
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 14 }}>
                  {order.order_no}
                </Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                  {order.buyer_name || order.buyer_email || "Buyer not named"}
                </Typography>
              </Box>
              <Typography
                sx={{
                  display: { xs: "none", sm: "block" },
                  color: "text.secondary",
                  fontSize: 13,
                }}
              >
                {order.item_count} items
              </Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
                {money(Math.round(Number(order.total || 0) * 100))}
              </Typography>
              <Typography
                sx={{
                  display: { xs: "none", sm: "block" },
                  color: "text.secondary",
                  fontSize: 12,
                }}
              >
                {shortDate(order.placed_at)}
              </Typography>
              <StatusChip status={order.status} />
            </Button>
          </Box>
        ))}
      </Box>
    </Surface>
  ) : (
    <Surface sx={{ p: 4, textAlign: "center" }}>
      <Typography sx={{ fontWeight: 700 }}>No orders returned</Typography>
    </Surface>
  );
}

function AuditPanel() {
  const [items, setItems] = useState<IntoolsInvoiceAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void listIntoolsAudit(null, null, 100)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load audit history.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (loading) return <LoadingRows />;
  if (error) return <Alert severity="error">{error}</Alert>;
  return (
    <Surface sx={{ p: { xs: 2, sm: 3 } }}>
      {items.length ? (
        <Stack component="ol" spacing={1.5} sx={{ m: 0, pl: 2.5 }}>
          {items.map((item) => (
            <Box component="li" key={item.id}>
              <Typography sx={{ fontWeight: 700, fontSize: 13 }}>
                {displayStatus(item.action)} · {item.admin_name || "Admin"}
              </Typography>
              <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                {item.summary || "No summary"} · {shortDate(item.created_at)}
              </Typography>
            </Box>
          ))}
        </Stack>
      ) : (
        <Typography sx={{ color: "text.secondary", fontSize: 14 }}>
          No audit events returned.
        </Typography>
      )}
    </Surface>
  );
}

const knowledgeDomains: Array<[string, string]> = [
  ["rfq", "RFQ"],
  ["sourcing", "Sourcing"],
  ["operations", "Operations"],
  ["payments-orders", "Payments and orders"],
  ["policies", "Policies"],
  ["support", "Support"],
];
const knowledgeStatuses: Array<[string, string]> = [
  ["all", "All statuses"],
  ["uploaded", "Uploaded"],
  ["processing", "Processing"],
  ["ready", "Ready"],
  ["published", "Published"],
  ["failed", "Failed"],
  ["archived", "Archived"],
];
const knowledgeVisibility: Array<[string, string]> = [
  ["all", "All visibility"],
  ["buyer-safe", "Buyer-safe"],
  ["operator-only", "Operator-only"],
];
const knowledgeMaxBytes = 25 * 1024 * 1024;
const knowledgeMimeTypes = new Set([
  "text/markdown",
  "text/plain",
]);

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function KnowledgePanel() {
  const [documents, setDocuments] = useState<IntoolsAgentKnowledgeDocument[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    title: "",
    domain: "rfq",
    visibility: "buyer-safe",
    file: null as File | null,
  });

  async function loadDocuments(nextStatus = statusFilter, nextVisibility = visibilityFilter) {
    setLoading(true);
    setError("");
    try {
      setDocuments(
        await listIntoolsAgentKnowledge(
          nextStatus === "all" ? null : nextStatus,
          nextVisibility === "all" ? null : nextVisibility,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load knowledge documents.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [statusFilter, visibilityFilter]);

  function chooseFile(file: File | undefined) {
    setError("");
    setMessage("");
    if (!file) {
      setForm((current) => ({ ...current, file: null }));
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop() || "";
    const acceptedExtension = ["md", "txt"].includes(extension);
    if (!acceptedExtension || (file.type && !knowledgeMimeTypes.has(file.type))) {
      setForm((current) => ({ ...current, file: null }));
      setError("Choose a Markdown or plain-text file. PDF and DOCX extraction is not enabled yet.");
      return;
    }
    if (file.size > knowledgeMaxBytes) {
      setForm((current) => ({ ...current, file: null }));
      setError("Knowledge files must be 25 MB or smaller.");
      return;
    }
    setForm((current) => ({ ...current, file }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!form.title.trim()) {
      setError("Add a title for this knowledge document.");
      return;
    }
    if (!form.file) {
      setError("Choose a Markdown or plain-text file to upload.");
      return;
    }
    setUploading(true);
    try {
      await uploadIntoolsAgentKnowledge(form.file, {
        title: form.title.trim(),
        domain: form.domain,
        visibility: form.visibility,
      });
      setForm({ title: "", domain: "rfq", visibility: "buyer-safe", file: null });
      setMessage("Knowledge document uploaded and queued for processing.");
      await loadDocuments();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not upload the knowledge document.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function publish(document: IntoolsAgentKnowledgeDocument) {
    if (document.status !== "ready" || !document.current_version_id) return;
    setBusyAction(`${document.id}:publish`);
    setError("");
    setMessage("");
    try {
      await publishIntoolsAgentKnowledge(document.current_version_id);
      setMessage(`${document.title} is now published.`);
      await loadDocuments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish this document.");
    } finally {
      setBusyAction("");
    }
  }

  async function archive(document: IntoolsAgentKnowledgeDocument) {
    if (document.status === "archived") return;
    setBusyAction(`${document.id}:archive`);
    setError("");
    setMessage("");
    try {
      await archiveIntoolsAgentKnowledge(document.id);
      setMessage(`${document.title} was archived.`);
      await loadDocuments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not archive this document.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <Stack spacing={2}>
      <Surface component="form" onSubmit={submit} sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h2" sx={{ fontSize: 20 }}>
              Upload knowledge
            </Typography>
            <Typography sx={{ mt: 0.5, color: "text.secondary", fontSize: 13 }}>
              Add approved context for the agent. Files stay private until an administrator publishes them.
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.25}>
            <TextField
              label="Document title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
              fullWidth
            />
            <TextField
              select
              label="Domain"
              value={form.domain}
              onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))}
              sx={{ minWidth: { md: 190 } }}
            >
              {knowledgeDomains.map(([value, label]) => (
                <MenuItem key={value} value={value}>{label}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Visibility"
              value={form.visibility}
              onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))}
              sx={{ minWidth: { md: 180 } }}
            >
              {knowledgeVisibility.slice(1).map(([value, label]) => (
                <MenuItem key={value} value={value}>{label}</MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ alignItems: { sm: "center" } }}>
            <Button component="label" variant="outlined" disabled={uploading}>
              Choose file
              <input
                hidden
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                onChange={(event) => chooseFile(event.target.files?.[0])}
              />
            </Button>
            <Typography sx={{ color: form.file ? "text.primary" : "text.secondary", fontSize: 13 }}>
              {form.file ? `${form.file.name} · ${formatBytes(form.file.size)}` : "Markdown or TXT · max 25 MB"}
            </Typography>
            <Button type="submit" variant="contained" disabled={uploading} startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <Add />}>
              Upload document
            </Button>
          </Stack>
          {(error || message) && (
            <Alert severity={error ? "error" : "success"} role={error ? "alert" : "status"}>
              {error || message}
            </Alert>
          )}
        </Stack>
      </Surface>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
        <Select
          size="small"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter knowledge by status"
          sx={{ minWidth: 170 }}
        >
          {knowledgeStatuses.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </Select>
        <Select
          size="small"
          value={visibilityFilter}
          onChange={(event) => setVisibilityFilter(event.target.value)}
          aria-label="Filter knowledge by visibility"
          sx={{ minWidth: 170 }}
        >
          {knowledgeVisibility.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </Select>
      </Stack>
      {loading ? (
        <Stack spacing={1} aria-label="Loading knowledge documents" role="status">
          {[1, 2, 3].map((key) => <Surface key={key} sx={{ p: 2 }}><Skeleton width="42%" /><Skeleton width="70%" /></Surface>)}
        </Stack>
      ) : documents.length ? (
        <Surface sx={{ overflow: "hidden" }}>
          <Box
            aria-hidden="true"
            sx={{
              display: { xs: "none", sm: "grid" },
              gridTemplateColumns: "1.4fr .8fr .85fr .8fr auto",
              gap: 1.5,
              px: 2,
              py: 1.25,
              borderBottom: "1px solid #dfe4eb",
              backgroundColor: "#f6f8fa",
              color: "#526176",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".04em",
              textTransform: "uppercase",
            }}
          >
            <Box>Document</Box><Box>Domain</Box><Box>Visibility</Box><Box>Status</Box><Box>Actions</Box>
          </Box>
          <Box component="ul" aria-label="Knowledge documents" sx={{ listStyle: "none", p: 0, m: 0 }}>
            {documents.map((document) => {
              const publishing = busyAction === `${document.id}:publish`;
              const archiving = busyAction === `${document.id}:archive`;
              return (
                <Box component="li" key={document.id} sx={{ "&:not(:last-child)": { borderBottom: "1px solid #e8ecf1" } }}>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr) auto", sm: "1.4fr .8fr .85fr .8fr auto" }, alignItems: "center", gap: 1.5, p: { xs: 1.5, sm: 2 } }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 14, overflowWrap: "anywhere" }}>{document.title}</Typography>
                      <Typography sx={{ color: "text.secondary", fontSize: 12, overflowWrap: "anywhere" }}>
                        {document.original_name || "Original filename unavailable"} · {formatBytes(document.byte_size)} · updated {shortDate(document.updated_at)}
                      </Typography>
                    </Box>
                    <Typography sx={{ display: { xs: "none", sm: "block" }, color: "text.secondary", fontSize: 13 }}>{displayStatus(document.domain)}</Typography>
                    <Typography sx={{ display: { xs: "none", sm: "block" }, color: "text.secondary", fontSize: 13 }}>{displayStatus(document.visibility)}</Typography>
                    <StatusChip status={document.status} />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={0.75} sx={{ alignItems: { sm: "center" } }}>
                      <Button size="small" variant="text" disabled={document.status !== "ready" || !document.current_version_id || Boolean(busyAction)} onClick={() => void publish(document)}>
                        {publishing ? "Publishing…" : "Publish"}
                      </Button>
                      <Button size="small" variant="outlined" disabled={document.status === "archived" || Boolean(busyAction)} onClick={() => void archive(document)}>
                        {archiving ? "Archiving…" : document.status === "archived" ? "Archived" : "Archive"}
                      </Button>
                    </Stack>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Surface>
      ) : (
        <Surface sx={{ p: 4, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 700 }}>No knowledge documents returned</Typography>
          <Typography sx={{ mt: 0.5, color: "text.secondary", fontSize: 13 }}>
            Upload an approved context file to begin processing.
          </Typography>
        </Surface>
      )}
    </Stack>
  );
}

type RfqQuoteFormState = {
  matchId: string | null;
  factoryId: string;
  supplierName: string;
  supplierRegion: string;
  unitPrice: string;
  quoteTotal: string;
  quantity: string;
  moq: string;
  leadDays: string;
  certifications: string;
  quoteNotes: string;
  recommended: boolean;
};
function quoteFormFrom(
  detail: IntoolsRfqDetail,
  matchId: string | null,
): RfqQuoteFormState {
  const quote = detail.quotes.find((item) => item.id === matchId);
  return {
    matchId,
    factoryId: quote?.factory_id || "",
    supplierName: quote?.supplier_name || "",
    supplierRegion: quote?.supplier_region || "",
    unitPrice: quote ? String(quote.unit_price_cents / 100) : "",
    quoteTotal: quote?.quote_total_cents
      ? String(quote.quote_total_cents / 100)
      : "",
    quantity: quote?.quantity ? String(quote.quantity) : "",
    moq: quote?.moq ? String(quote.moq) : "",
    leadDays: quote?.lead_days != null ? String(quote.lead_days) : "",
    certifications: quote?.certifications.join(", ") || "",
    quoteNotes: quote?.quote_notes || "",
    recommended: Boolean(quote?.recommended),
  };
}

function RfqOpsPanel({
  routeCaseId,
  onSelectCase,
  onBack,
}: {
  routeCaseId: string | null;
  onSelectCase: (id: string) => void;
  onBack: () => void;
}) {
  const [rfqs, setRfqs] = useState<IntoolsRfq[]>([]);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<IntoolsRfqDetail | null>(null);
  const [suppliers, setSuppliers] = useState<
    Array<{ id: string; name: string; region: string | null }>
  >([]);
  const [form, setForm] = useState<RfqQuoteFormState | null>(null);
  const [status, setStatus] = useState("accepted");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async (nextFilter = filter) => {
    setLoading(true);
    setError("");
    try {
      setRfqs(await listIntoolsRfqs(nextFilter === "all" ? null : nextFilter));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load RFQs.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    void listIntoolsSuppliers()
      .then((rows) =>
        setSuppliers(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            region: row.region,
          })),
        ),
      )
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!routeCaseId) {
      if (selected) {
        setSelected(null);
        setForm(null);
      }
      return;
    }
    if (selected?.case.id === routeCaseId) return;
    let active = true;
    void getIntoolsRfqDetail(routeCaseId)
      .then((detail) => {
        if (!active) return;
        setSelected(detail);
        setStatus(detail.case.status);
        setForm(null);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not load this RFQ.",
          );
      });
    return () => {
      active = false;
    };
  }, [routeCaseId, selected?.case.id]);
  async function openRfq(row: IntoolsRfq) {
    setError("");
    try {
      const detail = await getIntoolsRfqDetail(row.id);
      setSelected(detail);
      setStatus(detail.case.status);
      setForm(null);
      onSelectCase(row.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load this RFQ.",
      );
    }
  }
  async function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !form) return;
    const unitPriceCents = Math.round(Number(form.unitPrice) * 100);
    if (
      !form.supplierName.trim() ||
      !Number.isInteger(unitPriceCents) ||
      unitPriceCents <= 0
    ) {
      setError("Supplier name and a positive unit price are required.");
      return;
    }
    const payload: LegacyIntoolsRfqQuotePayload = {
      factoryId: form.factoryId || null,
      supplierName: form.supplierName.trim(),
      supplierRegion: form.supplierRegion.trim() || null,
      unitPriceCents,
      quoteTotalCents: form.quoteTotal
        ? Math.round(Number(form.quoteTotal) * 100)
        : null,
      quantity: form.quantity ? Number(form.quantity) : null,
      moq: form.moq ? Number(form.moq) : null,
      leadDays: form.leadDays ? Number(form.leadDays) : null,
      certifications: form.certifications
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      quoteNotes: form.quoteNotes.trim() || null,
      recommended: form.recommended,
    };
    setBusy(true);
    setError("");
    try {
      const next = await saveIntoolsRfqQuote(
        selected.case.id,
        form.matchId,
        payload,
      );
      setSelected(next);
      setStatus(next.case.status);
      setForm(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save this quote.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const next = await updateIntoolsRfqStatus(
        selected.case.id,
        status,
        note.trim() || null,
      );
      setSelected(next);
      setForm(null);
      setNote("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update this RFQ.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (selected)
    return (
      <Stack spacing={2}>
        <Button
          onClick={() => {
            setSelected(null);
            setForm(null);
            onBack();
          }}
          startIcon={<ArrowBack />}
          sx={{ alignSelf: "flex-start", px: 0 }}
        >
          Back to RFQs
        </Button>
        <Surface sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Stack
              direction="row"
              sx={{ flexDirection: { xs: "column", sm: "row" }, justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, gap: 1 }}
            >
              <Box>
                <Typography
                  sx={{
                    color: "#8793a0",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: ".08em",
                  }}
                >
                  {selected.case.case_no}
                </Typography>
                <Typography
                  variant="h2"
                  sx={{ mt: 0.45, fontSize: { xs: 24, sm: 30 } }}
                >
                  {selected.case.title}
                </Typography>
                <Typography
                  sx={{ mt: 0.45, color: "text.secondary", fontSize: 13 }}
                >
                  {selected.buyer_name ||
                    selected.buyer_email ||
                    "Buyer not named"}{" "}
                  · {selected.buyer_email || "No email"}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.75,
                  color: "#5b8064",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#5b8064",
                  }}
                />
                {selected.case.status.replaceAll("_", " ")}
              </Box>
            </Stack>
            <Divider />
            <Box
              component="form"
              onSubmit={saveStatus}
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "180px minmax(0,1fr) auto",
                },
                gap: 1.25,
                alignItems: "end",
              }}
            >
              <TextField
                select
                label="Request status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                size="small"
              >
                <MenuItem value="accepted">Accepted by Atelix</MenuItem>
                <MenuItem value="quotes_ready">Quotes ready</MenuItem>
                <MenuItem value="awaiting_payment">Awaiting payment</MenuItem>
                <MenuItem value="sampling">Sampling</MenuItem>
                <MenuItem value="production">Production</MenuItem>
                <MenuItem value="quality">Quality & logistics</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </TextField>
              <TextField
                label="Internal status note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                size="small"
                placeholder="Optional audit note"
              />
              <Button
                type="submit"
                variant="contained"
                disabled={busy || status === selected.case.status}
              >
                Update status
              </Button>
            </Box>
          </Stack>
        </Surface>
        <Surface sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={1.5}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Typography variant="h3" sx={{ fontSize: 20 }}>
                  Supplier quotes
                </Typography>
                <Typography
                  sx={{ mt: 0.3, color: "text.secondary", fontSize: 13 }}
                >
                  Enter a reviewed factory record or a manually confirmed
                  factory name and commercial terms.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                onClick={() => setForm(quoteFormFrom(selected, null))}
                disabled={Boolean(form)}
              >
                Add quote
              </Button>
            </Stack>
            {selected.quotes.map((quote) => (
              <Box
                key={quote.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "minmax(0,1fr) 140px 120px auto",
                  },
                  alignItems: "center",
                  gap: 1.5,
                  p: 1.5,
                  borderTop: "1px solid #e8ecf1",
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 800 }}>
                    {quote.supplier_name}
                  </Typography>
                  <Typography
                    sx={{ mt: 0.3, color: "text.secondary", fontSize: 12 }}
                  >
                    {quote.supplier_region || "Region not recorded"} ·{" "}
                    {money(quote.unit_price_cents)} / unit · MOQ{" "}
                    {quote.moq || "—"}
                  </Typography>
                </Box>
                <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                  {quote.lead_days != null
                    ? `${quote.lead_days} days`
                    : "Lead time —"}
                </Typography>
                <Box sx={{ color: "#5b8064", fontSize: 12, fontWeight: 700 }}>
                  {quote.recommended ? "Recommended" : quote.status}
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setForm(quoteFormFrom(selected, quote.id))}
                >
                  Edit quote
                </Button>
              </Box>
            ))}
            {form && (
              <Box
                component="form"
                onSubmit={saveQuote}
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2,minmax(0,1fr))",
                  },
                  gap: 1.25,
                  pt: 1.5,
                  borderTop: "1px solid #e8ecf1",
                }}
              >
                <TextField
                  select
                  label="Factory record (optional)"
                  value={form.factoryId}
                  onChange={(event) => {
                    const factory = suppliers.find(
                      (item) => item.id === event.target.value,
                    );
                    setForm({
                      ...form,
                      factoryId: event.target.value,
                      supplierName: factory?.name || form.supplierName,
                      supplierRegion: factory?.region || form.supplierRegion,
                    });
                  }}
                  size="small"
                >
                  <MenuItem value="">Manual factory name</MenuItem>
                  {suppliers.map((supplier) => (
                    <MenuItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.region ? ` · ${supplier.region}` : ""}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Factory name"
                  value={form.supplierName}
                  onChange={(event) =>
                    setForm({ ...form, supplierName: event.target.value })
                  }
                  size="small"
                  required
                />
                <TextField
                  label="Region"
                  value={form.supplierRegion}
                  onChange={(event) =>
                    setForm({ ...form, supplierRegion: event.target.value })
                  }
                  size="small"
                />
                <TextField
                  label="Unit price (USD)"
                  type="number"
                  slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
                  value={form.unitPrice}
                  onChange={(event) =>
                    setForm({ ...form, unitPrice: event.target.value })
                  }
                  size="small"
                  required
                />
                <TextField
                  label="Quote total (USD)"
                  type="number"
                  slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
                  value={form.quoteTotal}
                  onChange={(event) =>
                    setForm({ ...form, quoteTotal: event.target.value })
                  }
                  size="small"
                />
                <TextField
                  label="Quantity"
                  type="number"
                  value={form.quantity}
                  onChange={(event) =>
                    setForm({ ...form, quantity: event.target.value })
                  }
                  size="small"
                />
                <TextField
                  label="MOQ"
                  type="number"
                  value={form.moq}
                  onChange={(event) =>
                    setForm({ ...form, moq: event.target.value })
                  }
                  size="small"
                />
                <TextField
                  label="Lead time (days)"
                  type="number"
                  value={form.leadDays}
                  onChange={(event) =>
                    setForm({ ...form, leadDays: event.target.value })
                  }
                  size="small"
                />
                <TextField
                  label="Certifications, comma separated"
                  value={form.certifications}
                  onChange={(event) =>
                    setForm({ ...form, certifications: event.target.value })
                  }
                  size="small"
                />
                <TextField
                  label="Quote notes"
                  value={form.quoteNotes}
                  onChange={(event) =>
                    setForm({ ...form, quoteNotes: event.target.value })
                  }
                  size="small"
                  multiline
                  minRows={2}
                  sx={{ gridColumn: { sm: "1 / -1" } }}
                />
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    gridColumn: { sm: "1 / -1" },
                  }}
                >
                  <Checkbox
                    checked={form.recommended}
                    onChange={(event) =>
                      setForm({ ...form, recommended: event.target.checked })
                    }
                    slotProps={{ input: { "aria-label": "Mark quote as recommended" } }}
                  />
                  <Typography sx={{ fontSize: 13 }}>
                    Mark as recommended
                  </Typography>
                </Box>
                <Stack direction="row" sx={{ justifyContent: "flex-end", gridColumn: { sm: "1 / -1" }, gap: 1 }}>
                  <Button type="button" onClick={() => setForm(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="contained" disabled={busy}>
                    Save quote
                  </Button>
                </Stack>
              </Box>
            )}
          </Stack>
        </Surface>
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
      </Stack>
    );
  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        sx={{ flexDirection: { xs: "column", sm: "row" }, justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" }, gap: 1.5 }}
      >
        <Select
          size="small"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            void load(event.target.value);
          }}
          aria-label="Filter RFQs by status"
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="all">All request statuses</MenuItem>
          <MenuItem value="needs_research">Awaiting Atelix review</MenuItem>
          <MenuItem value="accepted">Accepted by Atelix</MenuItem>
          <MenuItem value="quotes_ready">Quotes ready</MenuItem>
          <MenuItem value="awaiting_payment">Awaiting payment</MenuItem>
          <MenuItem value="sampling">Sampling</MenuItem>
          <MenuItem value="production">Production</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
        </Select>
        <Button variant="outlined" onClick={() => void load()}>
          Refresh requests
        </Button>
      </Stack>
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      {loading ? (
        <LoadingRows />
      ) : (
        <Surface sx={{ overflow: "hidden" }}>
          <Box
            sx={{
              display: { xs: "none", sm: "grid" },
              gridTemplateColumns: "1.2fr 1.2fr .8fr .8fr auto",
              gap: 1.5,
              px: 2,
              py: 1.25,
              backgroundColor: "#f6f8fa",
              color: "#8793a0",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".04em",
              textTransform: "uppercase",
            }}
          >
            <Box>Request</Box>
            <Box>Buyer</Box>
            <Box>Status</Box>
            <Box>Quotes</Box>
            <Box />
          </Box>
          <Box
            component="ul"
            aria-label="RFQ requests"
            sx={{ p: 0, m: 0, listStyle: "none" }}
          >
            {rfqs.map((row) => (
              <Box
                component="li"
                key={row.id}
                sx={{ borderTop: "1px solid #e8ecf1" }}
              >
                <Button
                  fullWidth
                  onClick={() => void openRfq(row)}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr auto",
                      sm: "1.2fr 1.2fr .8fr .8fr auto",
                    },
                    gap: 1.5,
                    p: 2,
                    borderRadius: 0,
                    textAlign: "left",
                    color: "inherit",
                    textTransform: "none",
                    "&:hover": { backgroundColor: "#f7faf7" },
                    "&:focus-visible": {
                      outline: "3px solid #6fae86",
                      outlineOffset: -3,
                    },
                  }}
                >
                  <Box>
                    <Typography
                      sx={{ fontWeight: 800, overflowWrap: "anywhere" }}
                    >
                      {row.case_no}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.3,
                        color: "text.secondary",
                        fontSize: 12,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {row.title}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      display: { xs: "none", sm: "block" },
                      color: "text.secondary",
                      fontSize: 13,
                    }}
                  >
                    {row.buyer_name || row.buyer_email || "Buyer not named"}
                  </Typography>
                  <Typography
                    sx={{
                      color: "#5b8064",
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "capitalize",
                    }}
                  >
                    {row.status.replaceAll("_", " ")}
                  </Typography>
                  <Typography
                    sx={{
                      display: { xs: "none", sm: "block" },
                      color: "text.secondary",
                      fontSize: 13,
                    }}
                  >
                    {row.quote_count}
                  </Typography>
                  <ArrowForward sx={{ color: "#6fae86", fontSize: 20 }} />
                </Button>
              </Box>
            ))}
          </Box>
        </Surface>
      )}
    </Stack>
  );
}

export function Intools() {
  const [, setRouteVersion] = useState(0);
  const route = parseIntoolsRoute();
  const [ready, setReady] = useState(false);
  const [access, setAccess] = useState<
    "loading" | "allowed" | "permission" | "error"
  >("loading");
  const supplierId = route.supplierId;
  const [tab, setTab] = useState<Tab>(route.tab);
  const [filter, setFilter] = useState("all");
  const [invoices, setInvoices] = useState<IntoolsInvoice[]>([]);
  const [selected, setSelected] = useState<IntoolsInvoiceDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<Partial<InvoiceFormState> | null>(() => {
    if (!route.creatingInvoice) return null;
    const params = new URLSearchParams(location.search);
    return {
      rfqCaseId: params.get("rfqCaseId") || "",
      buyerProfileId: params.get("buyerProfileId") || "",
      orderId: params.get("orderId") || "",
    };
  });
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [error, setError] = useState("");
  const [localLogin, setLocalLogin] = useState(false);
  const [operatorName, setOperatorName] = useState("");
  useEffect(() => {
    const listener = () => setRouteVersion((value) => value + 1);
    addEventListener("popstate", listener);
    return () => removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    if (location.pathname === "/intools") navigate("/intools/invoices");
  }, []);
  useEffect(() => {
    setTab(route.tab);
    if (route.creatingInvoice) {
      const params = new URLSearchParams(location.search);
      setInvoiceDraft({
        rfqCaseId: params.get("rfqCaseId") || "",
        buyerProfileId: params.get("buyerProfileId") || "",
        orderId: params.get("orderId") || "",
      });
      setCreating(true);
    } else if (route.tab !== "invoices") {
      setCreating(false);
      setInvoiceDraft(null);
    }
  }, [route.tab, route.creatingInvoice, route.invoiceId, route.rfqId, route.requestId, route.supplierId]);
  useEffect(() => {
    if (route.tab !== "invoices" || !route.invoiceId) {
      setSelected(null);
      return;
    }
    let active = true;
    void getIntoolsInvoiceDetail(route.invoiceId)
      .then((detail) => {
        if (active) setSelected(detail);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Could not load invoice detail.");
      });
    return () => {
      active = false;
    };
  }, [route.tab, route.invoiceId]);
  async function loadInvoices(status = filter) {
    setLoadingInvoices(true);
    setError("");
    try {
      const data = await listIntoolsInvoices(status === "all" ? null : status);
      setInvoices(data);
      setAccess("allowed");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not load invoices.";
      setError(message);
      if (
        /intools unavailable|not authorized|permission|unauthorized/i.test(
          message,
        )
      )
        setAccess("permission");
      else setAccess("error");
    } finally {
      setLoadingInvoices(false);
    }
  }
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    const meta = existing || document.createElement("meta");
    const previous = meta.content;
    meta.name = "robots";
    meta.content = "noindex,nofollow,noarchive";
    if (!existing) document.head.appendChild(meta);
    return () => {
      if (existing) existing.content = previous;
      else meta.remove();
    };
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      const local = await getLocalIntoolsSession();
      if (!active) return;
      if (local.authenticated) {
        setOperatorName("Local administrator");
        setReady(true);
        if (route.tab !== "invoices") setAccess("allowed");
        else void loadInvoices();
        return;
      }
      if (local.available) {
        setReady(true);
        setLocalLogin(true);
        setAccess("permission");
        return;
      }
      const session = await getSession();
      if (!active) return;
      if (!session) {
        setReady(true);
        setAccess("permission");
        return;
      }
      await assertIntoolsAdmin();
      if (!active) return;
      const name = await getUserDisplayName(session.user);
      if (!active) return;
      setOperatorName(name);
      setReady(true);
      if (route.tab !== "invoices") setAccess("allowed");
      else void loadInvoices();
    })().catch(() => {
      if (active) setAccess("error");
    });
    return () => {
      active = false;
    };
  }, []);
  function startInvoiceFromRfq(input: { rfqCaseId: string; buyerProfileId: string; orderId: string | null }) {
    const params = new URLSearchParams({
      rfqCaseId: input.rfqCaseId,
      buyerProfileId: input.buyerProfileId,
    });
    if (input.orderId) params.set("orderId", input.orderId);
    setInvoiceDraft({
      rfqCaseId: input.rfqCaseId,
      buyerProfileId: input.buyerProfileId,
      orderId: input.orderId || "",
    });
    setSelected(null);
    setCreating(true);
    setTab("invoices");
    navigate(`/intools/invoices/new?${params.toString()}`);
  }
  async function selectInvoice(invoice: IntoolsInvoice) {
    setError("");
    try {
      setSelected(await getIntoolsInvoiceDetail(invoice.id));
      navigate(`/intools/invoices/${encodeURIComponent(invoice.id)}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load invoice detail.",
      );
    }
  }
  if (access === "permission")
    return (
      <AccessDenied
        localLogin={localLogin}
        onLoggedIn={() => {
          setLocalLogin(false);
          setReady(true);
          void loadInvoices();
        }}
      />
    );
  if (access === "error" && !ready) return <AccessDenied kind="error" />;
  if (!ready || access === "loading")
    return (
      <main
        id="main-content"
        style={{ minHeight: "100vh", padding: 24, background: "#f4f6f9" }}
      >
        <LoadingRows />
      </main>
    );
  return (
    <ThemeProvider theme={intoolsTheme}>
      <Box
        className="intools-root"
        sx={{
          minHeight: "100vh",
          backgroundColor: "#f4f6f9",
          color: "text.primary",
        }}
      >
        <Box
          component="header"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 68,
            px: { xs: 2, sm: 4 },
            borderBottom: "1px solid #ececef",
            backgroundColor: "#fff",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
            <IconButton
              aria-label="Return to Atelix sign in"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowBack />
            </IconButton>
            <Typography sx={{ fontWeight: 800, fontSize: 18 }}>
              atelix<span style={{ color: "#6fae86" }}>.</span>
            </Typography>
            <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
              Intools
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.1} sx={{ alignItems: "center" }}>
            <Box sx={{ minWidth: 0, textAlign: "right" }}>
              <Typography
                sx={{
                  maxWidth: 180,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 13,
                  fontWeight: 800,
                  lineHeight: 1.25,
                }}
              >
                {operatorName || "Administrator"}
              </Typography>
              <Typography
                sx={{ color: "text.secondary", fontSize: 11, lineHeight: 1.25 }}
              >
                Administrator
              </Typography>
            </Box>
            <Tooltip
              title={`${operatorName || "Administrator"} · Private administrator workspace`}
            >
              <Avatar
                aria-label={`${operatorName || "Administrator"}, administrator`}
                sx={{
                  width: 34,
                  height: 34,
                  bgcolor: "#e5e7eb",
                  color: "#45556b",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {initials(operatorName || "Administrator")}
              </Avatar>
            </Tooltip>
          </Stack>
        </Box>
        <Box
          component="main"
          id="main-content"
          sx={{
            width: "100%",
            maxWidth: 1240,
            mx: "auto",
            px: { xs: 2, sm: 3, md: 4 },
            py: { xs: 3, sm: 4, md: 5 },
          }}
        >
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h1" sx={{ fontSize: { xs: 30, sm: 40 } }}>
                Intools
              </Typography>
              <Typography
                sx={{ mt: 0.6, color: "text.secondary", fontSize: 14 }}
              >
                Private operations for invoices, orders, and supplier records.
                Every consequential change is recorded.
              </Typography>
            </Box>
            <Stack
              direction="row"
              spacing={1}
              sx={{ flexWrap: "wrap" }}
              role="tablist"
              aria-label="Intools sections"
            >
              {(
                [
                  ["invoices", "Invoices"],
                  ["rfq", "RFQ review"],
                  ["rfqs", "Requests"],
                  ["orders", "Orders"],
                  ["audit", "Audit history"],
                  ["registrations", "Sign-up requests"],
                  ["knowledge", "Knowledge"],
                  ["suppliers", "Suppliers"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => {
                    setTab(value);
                    setSelected(null);
                    setCreating(false);
                    navigate(intoolsTabPath(value));
                  }}
                  variant={tab === value ? "contained" : "outlined"}
                >
                  {label}
                </Button>
              ))}
            </Stack>
            {tab === "invoices" && (
              <>
                    {selected ? (
                  <InvoiceDetail
                    invoice={selected}
                    onChanged={setSelected}
                    onBack={() => {
                      setSelected(null);
                      navigate("/intools/invoices");
                    }}
                  />
                ) : (
                  <>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      sx={{
                        justifyContent: "space-between",
                        alignItems: { xs: "stretch", sm: "center" },
                        gap: 1.5,
                      }}
                    >
                      <Select
                        size="small"
                        value={filter}
                        onChange={(event) => {
                          setFilter(event.target.value);
                          void loadInvoices(event.target.value);
                        }}
                        aria-label="Filter invoices by status"
                        sx={{ minWidth: 170 }}
                      >
                        <MenuItem value="all">All statuses</MenuItem>
                        <MenuItem value="draft">Draft</MenuItem>
                        <MenuItem value="sent">Sent</MenuItem>
                        <MenuItem value="paid">Paid</MenuItem>
                        <MenuItem value="cancelled">Cancelled</MenuItem>
                        <MenuItem value="overdue">Overdue</MenuItem>
                      </Select>
                      <Button
                        variant="contained"
                        onClick={() => {
                          if (creating) {
                            setCreating(false);
                            setInvoiceDraft(null);
                            navigate("/intools/invoices");
                          } else {
                            setCreating(true);
                            navigate("/intools/invoices/new");
                          }
                        }}
                        startIcon={creating ? <Close /> : <Add />}
                      >
                        {creating ? "Close new invoice" : "New invoice"}
                      </Button>
                    </Stack>
                    {creating && (
                      <InvoiceCreateForm
                        initial={invoiceDraft}
                        onCreated={(invoice) => {
                          setCreating(false);
                          setInvoiceDraft(null);
                          setSelected(invoice);
                          void loadInvoices();
                          navigate(`/intools/invoices/${encodeURIComponent(invoice.id)}`);
                        }}
                        onCancel={() => {
                          setCreating(false);
                          setInvoiceDraft(null);
                          navigate("/intools/invoices");
                        }}
                      />
                    )}
                    {error && (
                      <Alert
                        severity="error"
                        role="alert"
                        action={
                          <Button onClick={() => void loadInvoices()}>
                            Retry
                          </Button>
                        }
                      >
                        {error}
                      </Alert>
                    )}
                    {loadingInvoices ? (
                      <LoadingRows />
                    ) : (
                      <InvoiceList
                        invoices={invoices}
                        selectedId={null}
                        onSelect={(invoice) => void selectInvoice(invoice)}
                      />
                    )}
                  </>
                )}
              </>
            )}
            {tab === "rfq" && (
              <RfqReviewPanel
                routeCaseId={route.rfqId}
                onSelectCase={(id) => navigate(`/intools/rfq/${encodeURIComponent(id)}`)}
                onBack={() => navigate("/intools/rfq")}
                onCreateInvoice={startInvoiceFromRfq}
              />
            )}
            {tab === "rfqs" && (
              <RfqOpsPanel
                routeCaseId={route.requestId}
                onSelectCase={(id) =>
                  navigate(`/intools/requests/${encodeURIComponent(id)}`)
                }
                onBack={() => navigate("/intools/requests")}
              />
            )}
            {tab === "orders" && <OrdersPanel />}
            {tab === "audit" && <AuditPanel />}
            {tab === "registrations" && <RegistrationRequestsPanel />}
            {tab === "knowledge" && <KnowledgePanel />}
            {tab === "suppliers" && (
              <IntoolsSuppliers
                supplierId={supplierId}
                onOpen={(id) =>
                  navigate(`/intools/suppliers/${encodeURIComponent(id)}`)
                }
                onBack={() => navigate("/intools/suppliers")}
              />
            )}
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

const rfqStatusFilters: Array<[string, string]> = [
  ["needs_research", "Atelix review"],
  ["awaiting_supplier", "Awaiting suppliers"],
  ["supplier_replied", "Supplier replied"],
  ["buyer_review", "Buyer deciding"],
  ["quote_selected", "Confirming terms"],
  ["in_production", "In production"],
  ["draft", "Buyer drafting"],
  ["closed", "Closed"],
  ["all", "All"],
];
const productionStages: Array<[string, string]> = [
  ["sampling", "Sampling"],
  ["bulk_production", "Bulk production"],
  ["quality_inspection", "Quality inspection"],
  ["shipped", "Shipped"],
  ["delivered", "Delivered"],
];

type QuoteDraft = { unitPrice: string; moq: string; leadTimeDays: string; certifications: string; certificationNote: string; recommended: boolean; notes: string };
const emptyQuoteDraft: QuoteDraft = { unitPrice: "", moq: "", leadTimeDays: "", certifications: "", certificationNote: "", recommended: false, notes: "" };

function RfqQuoteForm({ caseId, factoryId, existing, onSaved, onMessage }: { caseId: string; factoryId: string; existing: IntoolsRfqQuote | null; onSaved: () => void; onMessage: (message: string) => void }) {
  const [draft, setDraft] = useState<QuoteDraft>(existing ? { unitPrice: (existing.unit_price_cents / 100).toFixed(2), moq: String(existing.moq), leadTimeDays: String(existing.lead_time_days), certifications: existing.certifications.join(", "), certificationNote: existing.certification_note || "", recommended: existing.recommended, notes: existing.notes || "" } : emptyQuoteDraft);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await upsertIntoolsRfqQuote(existing?.id ?? null, {
        rfqCaseId: caseId, factoryId,
        unitPriceCents: Math.round(parseFloat(draft.unitPrice || "0") * 100),
        moq: parseInt(draft.moq || "0", 10),
        leadTimeDays: parseInt(draft.leadTimeDays || "0", 10),
        certifications: draft.certifications.split(",").map((value) => value.trim()).filter(Boolean),
        certificationNote: draft.certificationNote.trim() || null,
        recommended: draft.recommended,
        notes: draft.notes.trim() || null,
      });
      onSaved();
    } catch (cause) { onMessage(cause instanceof Error ? cause.message : "Could not save this quote."); }
    finally { setBusy(false); }
  }
  return <Stack spacing={1} sx={{ p: 1.5, border: "1px dashed #cfd6df", borderRadius: 2 }}>
    <Stack direction="row" spacing={1}>
      <TextField size="small" label="Unit price (USD)" value={draft.unitPrice} onChange={(event) => setDraft((current) => ({ ...current, unitPrice: event.target.value }))} sx={{ flex: 1 }} />
      <TextField size="small" label="MOQ" value={draft.moq} onChange={(event) => setDraft((current) => ({ ...current, moq: event.target.value }))} sx={{ flex: 1 }} />
      <TextField size="small" label="Lead time (days)" value={draft.leadTimeDays} onChange={(event) => setDraft((current) => ({ ...current, leadTimeDays: event.target.value }))} sx={{ flex: 1 }} />
    </Stack>
    <TextField size="small" label="Certifications (comma-separated)" value={draft.certifications} onChange={(event) => setDraft((current) => ({ ...current, certifications: event.target.value }))} />
    <TextField size="small" label="Certification note (optional, e.g. pending renewal)" value={draft.certificationNote} onChange={(event) => setDraft((current) => ({ ...current, certificationNote: event.target.value }))} />
    <TextField size="small" label="Internal notes (optional)" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} multiline minRows={2} />
    <FormControlLabel control={<Checkbox size="small" checked={draft.recommended} onChange={(event) => setDraft((current) => ({ ...current, recommended: event.target.checked }))} />} label="Mark as recommended" />
    <Button size="small" variant="contained" disabled={busy || !draft.unitPrice || !draft.moq || !draft.leadTimeDays} onClick={() => void save()} sx={{ alignSelf: "flex-start" }}>{existing ? "Save changes" : "Save draft quote"}</Button>
  </Stack>;
}

function RfqReviewPanel({
  routeCaseId,
  onSelectCase,
  onBack,
  onCreateInvoice,
}: {
  routeCaseId: string | null;
  onSelectCase: (id: string) => void;
  onBack: () => void;
  onCreateInvoice: (input: { rfqCaseId: string; buyerProfileId: string; orderId: string | null }) => void;
}) {
  const [statusFilter, setStatusFilter] = useState("needs_research");
  const [cases, setCases] = useState<IntoolsRfqCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<IntoolsSupplier[]>([]);
  const [matches, setMatches] = useState<IntoolsRfqSupplierMatch[] | null>(null);
  const [quotes, setQuotes] = useState<IntoolsRfqQuote[] | null>(null);
  const [order, setOrder] = useState<{ id: string; order_no: string; status: string; total: number; placed_at: string | null; production_stage: string | null } | null | undefined>(undefined);
  const [detailError, setDetailError] = useState("");
  const [openQuoteFor, setOpenQuoteFor] = useState<string | null>(null);
  const [orderForm, setOrderForm] = useState({ qty: "", shipCountry: "", shipAddress: "", incoterms: "" });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [matchSearch, setMatchSearch] = useState("");
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [tableSort, setTableSort] = useState<"updated" | "title" | "buyer">("updated");

  async function loadCases(nextFilter = statusFilter) {
    setLoading(true); setError("");
    try { setCases(await listIntoolsRfqCases(routeCaseId ? null : nextFilter === "all" ? null : nextFilter)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load RFQs."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadCases(); }, [routeCaseId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void listIntoolsSuppliers().then(setSuppliers).catch(() => undefined); }, []);

  const selected = cases.find((item) => item.id === selectedId) || null;
  async function loadDetail(caseId: string) {
    setDetailError(""); setMatches(null); setQuotes(null); setOrder(undefined);
    try {
      const [nextMatches, nextQuotes, nextOrder] = await Promise.all([
        generateIntoolsRfqSupplierMatches(caseId),
        listIntoolsRfqQuotes(caseId),
        getIntoolsRfqOrder(caseId),
      ]);
      setMatches(nextMatches); setQuotes(nextQuotes); setOrder(nextOrder);
    } catch (cause) { setDetailError(cause instanceof Error ? cause.message : "Could not load this RFQ."); }
  }
  function selectCase(caseId: string) {
    setSelectedId(caseId);
    setOpenQuoteFor(null);
    setMatchSearch("");
    setShowAllMatches(false);
    onSelectCase(caseId);
    void loadDetail(caseId);
  }
  useEffect(() => {
    setSelectedId(routeCaseId);
    if (routeCaseId) void loadDetail(routeCaseId);
  }, [routeCaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  function supplierFor(factoryId: string) { return suppliers.find((item) => item.id === factoryId) || null; }
  function quoteForFactory(factoryId: string) { return (quotes || []).find((quote) => quote.factory_id === factoryId) || null; }

  async function setMatchStatus(matchId: string, status: "approved" | "rejected") {
    if (!selected) return;
    setBusyKey(matchId);
    try { await setIntoolsRfqSupplierMatchStatus(matchId, status); await loadDetail(selected.id); }
    catch (cause) { setDetailError(cause instanceof Error ? cause.message : "Could not update this match."); }
    finally { setBusyKey(null); }
  }
  async function publishQuote(quoteId: string) {
    if (!selected) return;
    setBusyKey(quoteId);
    try { await publishIntoolsRfqQuote(quoteId); await loadDetail(selected.id); await loadCases(); }
    catch (cause) { setDetailError(cause instanceof Error ? cause.message : "Could not publish this quote."); }
    finally { setBusyKey(null); }
  }
  async function declineQuote(quoteId: string) {
    if (!selected) return;
    setBusyKey(quoteId);
    try { await declineIntoolsRfqQuote(quoteId); await loadDetail(selected.id); await loadCases(); }
    catch (cause) { setDetailError(cause instanceof Error ? cause.message : "Could not decline this quote."); }
    finally { setBusyKey(null); }
  }
  const publishedQuotes = (quotes || []).filter((quote) => quote.status === "published" || quote.status === "selected");
  const quoteCapReached = publishedQuotes.length >= 3;
  const selectedQuote = (quotes || []).find((quote) => quote.status === "selected") || null;
  const matchesFiltered = (matches || []).filter((match) => {
    if (!matchSearch.trim()) return true;
    const factory = supplierFor(match.factory_id);
    const needle = matchSearch.trim().toLowerCase();
    return factory?.name.toLowerCase().includes(needle) || factory?.region?.toLowerCase().includes(needle);
  });
  const matchesApproved = matchesFiltered.filter((match) => match.status !== "suggested");
  const matchesSuggested = matchesFiltered.filter((match) => match.status === "suggested");
  const suggestedVisible = showAllMatches ? matchesSuggested : matchesSuggested.slice(0, 15);
  const matchesVisible = [...matchesApproved, ...suggestedVisible];
  const visibleCases = cases
    .filter((item) => {
      const needle = tableSearch.trim().toLowerCase();
      if (!needle) return true;
      return `${item.case_no} ${item.title} ${item.buyer_name} ${item.buyer_email} ${item.buyer_profile_id}`.toLowerCase().includes(needle);
    })
    .sort((a, b) => {
      if (tableSort === "title") return a.title.localeCompare(b.title);
      if (tableSort === "buyer") return a.buyer_name.localeCompare(b.buyer_name);
      return b.updated_at.localeCompare(a.updated_at);
    });
  async function confirmOrder() {
    if (!selected || !selectedQuote) return;
    setBusyKey("confirm-order");
    try {
      await confirmIntoolsRfqOrder({ caseId: selected.id, quoteId: selectedQuote.id, qty: parseFloat(orderForm.qty || "0"), shipCountry: orderForm.shipCountry.trim() || null, shipAddress: orderForm.shipAddress.trim() || null, incoterms: orderForm.incoterms.trim() || null });
      await loadDetail(selected.id); await loadCases();
    } catch (cause) { setDetailError(cause instanceof Error ? cause.message : "Could not confirm this order."); }
    finally { setBusyKey(null); }
  }
  async function setStage(stage: string) {
    if (!order) return;
    setBusyKey("stage");
    try { await updateIntoolsOrderProductionStage(order.id, stage); if (selected) await loadDetail(selected.id); }
    catch (cause) { setDetailError(cause instanceof Error ? cause.message : "Could not update production stage."); }
    finally { setBusyKey(null); }
  }

  return <Stack spacing={2}>
    <Typography sx={{ color: "text.secondary", fontSize: 14 }}>Keep each buyer request selected here while Atelix approves supplier matches, publishes one quote per supplier, and initiates the sample order after the buyer selects a quote.</Typography>
    <Stack spacing={2}>
      {!selected && (
        <Stack spacing={1.25}>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.25, alignItems: "center" }}>
            <TextField
              size="small"
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="Search RFQ, buyer, UUID or email"
              aria-label="Search RFQs"
              sx={{ flex: "1 1 280px", maxWidth: 420 }}
            />
            <Select size="small" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); void loadCases(event.target.value); }} aria-label="Filter RFQs by status" sx={{ minWidth: 190 }}>
              {rfqStatusFilters.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </Select>
            <Select size="small" value={tableSort} onChange={(event) => setTableSort(event.target.value as typeof tableSort)} aria-label="Sort RFQs" sx={{ minWidth: 170 }}>
              <MenuItem value="updated">Sort: Recently updated</MenuItem>
              <MenuItem value="title">Sort: RFQ title</MenuItem>
              <MenuItem value="buyer">Sort: Buyer name</MenuItem>
            </Select>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          {loading ? <LoadingRows /> : visibleCases.length ? (
            <Surface sx={{ overflow: "hidden" }}>
              <Box role="table" aria-label="RFQs" sx={{ minWidth: { xs: 0, md: 860 } }}>
                <Box role="row" sx={{ display: { xs: "none", md: "grid" }, gridTemplateColumns: "minmax(240px,1.6fr) minmax(160px,1fr) 110px 100px 150px", gap: 1.5, px: 2, py: 1.25, borderBottom: "1px solid #dfe4eb", backgroundColor: "#f6f8fa", color: "#526176", fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  <Box role="columnheader">RFQ</Box><Box role="columnheader">Buyer</Box><Box role="columnheader">Status</Box><Box role="columnheader">Quotes</Box><Box role="columnheader">Updated</Box>
                </Box>
                <Box component="ul" role="rowgroup" sx={{ listStyle: "none", p: 0, m: 0 }}>
                  {visibleCases.map((item) => (
                    <Box component="li" key={item.id} sx={{ borderBottom: "1px solid #e8ecf1", "&:last-child": { borderBottom: 0 } }}>
                      <Button fullWidth onClick={() => selectCase(item.id)} role="row" aria-current={selectedId === item.id ? "true" : undefined} sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr) auto", md: "minmax(240px,1.6fr) minmax(160px,1fr) 110px 100px 150px" }, gap: { xs: 1, md: 1.5 }, alignItems: "center", p: { xs: 1.5, md: 2 }, borderRadius: 0, textAlign: "left", color: "inherit", textTransform: "none", backgroundColor: selectedId === item.id ? "#f1f7f2" : "#fff", "&:hover": { backgroundColor: selectedId === item.id ? "#e9f3eb" : "#f7f9fb" }, "&:focus-visible": { outline: "3px solid #6fae86", outlineOffset: -3, zIndex: 1 } }}>
                        <Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: 14, fontWeight: 800, overflowWrap: "anywhere" }}>{item.title}</Typography><Typography sx={{ mt: .3, color: "text.secondary", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{item.case_no}</Typography><Typography sx={{ display: { xs: "block", md: "none" }, mt: .4, color: "text.secondary", fontSize: 12 }}>{item.buyer_name} · {item.quote_count} quotes</Typography></Box>
                        <Typography noWrap sx={{ display: { xs: "none", md: "block" }, color: "text.secondary", fontSize: 13 }}>{item.buyer_name || item.buyer_email || "Buyer not named"}</Typography>
                        <StatusChip status={item.status} />
                        <Typography sx={{ display: { xs: "none", md: "block" }, color: "text.secondary", fontSize: 13 }}>{item.quote_count}</Typography>
                        <Typography sx={{ display: { xs: "none", md: "block" }, color: "text.secondary", fontSize: 12 }}>{shortDate(item.updated_at)}</Typography>
                      </Button>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Surface>
          ) : <Surface sx={{ p: 3, textAlign: "center" }}><Typography sx={{ fontWeight: 700 }}>{cases.length ? "No RFQs match these filters" : "No RFQs in this state"}</Typography><Typography sx={{ mt: .5, color: "text.secondary", fontSize: 13 }}>Try a different search or status filter.</Typography></Surface>}
        </Stack>
      )}

      {selected && <Stack spacing={2} sx={{ flex: 1, minWidth: 0, width: "100%" }}>
        <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ alignSelf: "flex-start", px: 0 }}>Back to RFQ table</Button>
        <Surface sx={{ p: 2 }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h2" sx={{ fontSize: 20, overflowWrap: "anywhere" }}>{selected.title}</Typography>
              <Typography sx={{ mt: .3, fontSize: 12, color: "text.secondary" }}>{selected.case_no} · {selected.buyer_name} · {selected.buyer_email}</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, auto)" }, gap: { xs: .4, sm: 2 }, mt: 1 }}>
                <Typography sx={{ color: "text.secondary", fontSize: 11.5 }}>User UUID: <Box component="span" sx={{ color: "text.primary", fontFamily: "'DM Mono', monospace" }}>{selected.buyer_profile_id}</Box></Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 11.5 }}>Order ID: <Box component="span" sx={{ color: "text.primary", fontFamily: "'DM Mono', monospace" }}>{order?.id || "—"}</Box></Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 11.5 }}>Order no: <Box component="span" sx={{ color: "text.primary", fontFamily: "'DM Mono', monospace" }}>{order?.order_no || "—"}</Box></Typography>
              </Box>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() =>
                  onCreateInvoice({
                    rfqCaseId: selected.id,
                    buyerProfileId: selected.buyer_profile_id,
                    orderId: (order || null)?.id ?? null,
                  })
                }
              >
                Create invoice
              </Button>
              <StatusChip status={selected.status} />
            </Stack>
          </Stack>
          {typeof selected.brief === "object" && selected.brief && <Typography sx={{ mt: 1.25, fontSize: 12.5, color: "text.secondary", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{typeof (selected.brief as Record<string, unknown>).summary === "string" ? (selected.brief as Record<string, unknown>).summary as string : JSON.stringify(selected.brief)}</Typography>}
        </Surface>
        {detailError && <Alert severity="error">{detailError}</Alert>}

        <Surface sx={{ p: 2 }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Supplier matches</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Chip size="small" label={`Published quotes ${publishedQuotes.length}/3`} color={quoteCapReached ? "warning" : "default"} />
              <Button size="small" startIcon={<Refresh fontSize="small" />} onClick={() => void loadDetail(selected.id)}>Refresh</Button>
            </Stack>
          </Stack>
          <Typography sx={{ mt: .5, fontSize: 12, color: "text.secondary" }}>The buyer sees up to 3 published quotes side by side. Publishing a 4th is blocked — decline one first to make room.</Typography>
          {matches !== null && matches.length > 0 && <TextField size="small" placeholder="Search suppliers by name or region" value={matchSearch} onChange={(event) => setMatchSearch(event.target.value)} sx={{ mt: 1.25, width: "100%", maxWidth: 340 }} />}
          {matches === null ? <LoadingRows /> : matches.length ? <Stack spacing={1} sx={{ mt: 1.25 }}>{matchesVisible.map((match) => { const factory = supplierFor(match.factory_id); const quote = quoteForFactory(match.factory_id); const canPublishMore = !quoteCapReached; return <Box key={match.id} sx={{ p: 1.5, border: quote?.status === "selected" ? "1px solid #4b7657" : "1px solid #eef0f3", borderRadius: "10px", backgroundColor: quote?.status === "selected" ? "#f7fbf7" : "transparent" }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Box><Typography sx={{ fontWeight: 700, fontSize: 13 }}>{factory?.name || match.factory_id}</Typography><Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{factory?.region}</Typography></Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <StatusChip status={match.status} />
                {match.status === "suggested" && <><Button size="small" variant="contained" disabled={busyKey === match.id} onClick={() => void setMatchStatus(match.id, "approved")}>Approve</Button><Button size="small" color="error" disabled={busyKey === match.id} onClick={() => void setMatchStatus(match.id, "rejected")}>Reject</Button></>}
              </Stack>
            </Stack>
            {match.status === "approved" && <Box sx={{ mt: 1.25 }}>
              {quote ? <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                <Typography sx={{ fontSize: 12.5 }}>{money(quote.unit_price_cents)} · MOQ {quote.moq} · {quote.lead_time_days}d lead <StatusChip status={quote.status} /></Typography>
                <Stack direction="row" spacing={1}>
                  {quote.status === "draft" && <Button size="small" onClick={() => setOpenQuoteFor(openQuoteFor === match.factory_id ? null : match.factory_id)}>Edit</Button>}
                  {quote.status === "draft" && <Tooltip title={canPublishMore ? "" : "3 quotes already published — decline one first"}><span><Button size="small" variant="contained" disabled={busyKey === quote.id || !canPublishMore} onClick={() => void publishQuote(quote.id)}>Publish</Button></span></Tooltip>}
                  {quote.status === "published" && <Button size="small" color="error" disabled={busyKey === quote.id} onClick={() => void declineQuote(quote.id)}>Decline</Button>}
                </Stack>
              </Stack> : <Tooltip title={canPublishMore ? "" : "3 quotes already published — decline one first"}><span><Button size="small" variant="outlined" disabled={!canPublishMore} onClick={() => setOpenQuoteFor(openQuoteFor === match.factory_id ? null : match.factory_id)}>{openQuoteFor === match.factory_id ? "Close" : "Add quote"}</Button></span></Tooltip>}
              {openQuoteFor === match.factory_id && <Box sx={{ mt: 1 }}><RfqQuoteForm caseId={selected.id} factoryId={match.factory_id} existing={quote} onSaved={() => { setOpenQuoteFor(null); void loadDetail(selected.id); }} onMessage={setDetailError} /></Box>}
            </Box>}
          </Box>; })}
            {!showAllMatches && matchesSuggested.length > 15 && <Button size="small" onClick={() => setShowAllMatches(true)}>Show {matchesSuggested.length - 15} more suggested suppliers</Button>}
          </Stack> : <Typography sx={{ mt: 1.25, fontSize: 12.5, color: "text.secondary" }}>No eligible suppliers found for this brief yet.</Typography>}
        </Surface>

        {selectedQuote && <Surface sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Order</Typography>
          {order === undefined ? <LoadingRows /> : order ? <Stack spacing={1} sx={{ mt: 1.25 }}>
            <Typography sx={{ fontSize: 13 }}>{order.order_no} · {money(Math.round(order.total * 100))} · placed {shortDate(order.placed_at)}</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Select size="small" value={order.production_stage || "sampling"} onChange={(event) => void setStage(event.target.value)}>{productionStages.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select>
              {busyKey === "stage" && <CircularProgress size={16} />}
            </Stack>
          </Stack> : <Stack spacing={1} sx={{ mt: 1.25 }}>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Buyer selected {selectedQuote.factory_name}. Initiate the sample order here to create the authoritative order and sampling track visible to the buyer.</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              <TextField size="small" label="Quantity" value={orderForm.qty} onChange={(event) => setOrderForm((current) => ({ ...current, qty: event.target.value }))} sx={{ width: 120 }} />
              <TextField size="small" label="Ship country" value={orderForm.shipCountry} onChange={(event) => setOrderForm((current) => ({ ...current, shipCountry: event.target.value }))} sx={{ width: 150 }} />
              <TextField size="small" label="Incoterms" value={orderForm.incoterms} onChange={(event) => setOrderForm((current) => ({ ...current, incoterms: event.target.value }))} sx={{ width: 120 }} />
            </Stack>
            <TextField size="small" label="Ship address" value={orderForm.shipAddress} onChange={(event) => setOrderForm((current) => ({ ...current, shipAddress: event.target.value }))} />
            <Button size="small" variant="contained" disabled={busyKey === "confirm-order" || !orderForm.qty} onClick={() => void confirmOrder()} sx={{ alignSelf: "flex-start" }}>{busyKey === "confirm-order" ? "Initiating…" : "Initiate sample order"}</Button>
          </Stack>}
        </Surface>}
      </Stack>}
    </Stack>
  </Stack>;
}

function RegistrationRequestsPanel() {
  const [status, setStatus] = useState("pending_review");
  const [requests, setRequests] = useState<IntoolsRegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load(nextStatus = status) {
    setLoading(true);
    setError("");
    try {
      setRequests(
        await listIntoolsRegistrationRequests(
          nextStatus === "all" ? null : nextStatus,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load sign-up requests.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function approve(id: string) {
    setError("");
    try {
      await approveRegistrationRequest(id);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not approve this request.",
      );
    }
  }
  return (
    <Stack spacing={1.5}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ justifyContent: "space-between", gap: 1.5 }}
      >
        <Typography sx={{ color: "text.secondary", fontSize: 14 }}>
          New accounts stay pending until an administrator approves them.
        </Typography>
        <Select
          size="small"
          value={status}
          aria-label="Filter sign-up requests by status"
          onChange={(event) => {
            setStatus(event.target.value);
            void load(event.target.value);
          }}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="pending_review">Pending review</MenuItem>
          <MenuItem value="approved">Approved</MenuItem>
          <MenuItem value="invited">Invited</MenuItem>
          <MenuItem value="declined">Declined</MenuItem>
          <MenuItem value="all">All requests</MenuItem>
        </Select>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {loading ? (
        <LoadingRows />
      ) : requests.length ? (
        <Surface sx={{ overflow: "hidden" }}>
          <Box
            component="ul"
            aria-label="Sign-up requests"
            sx={{ listStyle: "none", p: 0, m: 0 }}
          >
            {requests.map((request) => (
              <Box
                component="li"
                key={request.id}
                sx={{
                  p: { xs: 1.5, sm: 2 },
                  display: "grid",
                  gap: 1,
                  "&:not(:last-child)": { borderBottom: "1px solid #e8ecf1" },
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  sx={{ justifyContent: "space-between", gap: 1 }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 14 }}>
                      {request.name} · {request.company_name}
                    </Typography>
                    <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                      {request.email}
                      {request.phone
                        ? ` · ${request.country_code || ""} ${request.phone}`
                        : ""}
                    </Typography>
                  </Box>
                  <Stack
                    direction="row"
                    sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}
                  >
                    <StatusChip status={request.status} />
                    {request.status === "pending_review" && (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => void approve(request.id)}
                      >
                        Approve
                      </Button>
                    )}
                  </Stack>
                </Stack>
                <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                  Sourcing: {request.sourcing} · Revenue:{" "}
                  {request.annual_revenue}
                </Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                  Submitted {shortDate(request.created_at)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Surface>
      ) : (
        <Surface sx={{ p: 4, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 700 }}>No sign-up requests</Typography>
        </Surface>
      )}
    </Stack>
  );
}
