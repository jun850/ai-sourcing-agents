import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  createIntoolsInvoice,
  getIntoolsInvoiceDetail,
  getIntoolsOrderDetail,
  getLocalIntoolsSession,
  getSession,
  loginLocalIntools,
  listIntoolsAudit,
  listIntoolsInvoices,
  listIntoolsRegistrationRequests,
  listIntoolsOrders,
  recordIntoolsManualPayment,
  sendIntoolsInvoice,
  updateIntoolsInvoice,
  type IntoolsCreateInvoicePayload,
  type IntoolsInvoice,
  type IntoolsInvoiceAudit,
  type IntoolsInvoiceDetail,
  type IntoolsManualPaymentPayload,
  type IntoolsOrder,
  type IntoolsRegistrationRequest,
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
  shape: { borderRadius: 14 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 11, minHeight: 42, paddingInline: 16 },
      },
    },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 16, maxWidth: 560 } },
    },
  },
});

type Tab = "invoices" | "orders" | "audit" | "registrations" | "suppliers";
type ActionDialog = "cancel" | "payment" | null;
type DraftLine = {
  description: string;
  quantity: string;
  unitAmount: string;
  taxAmount: string;
};
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
        borderRadius: 3,
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
                {busy ? "Signing in…" : "Sign in locally"}
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
    <Stack
      component="ul"
      aria-label="Invoices"
      spacing={1}
      sx={{ listStyle: "none", p: 0, m: 0 }}
    >
      {invoices.map((invoice) => (
        <Box component="li" key={invoice.id}>
          <Button
            className="intools-row-button"
            onClick={() => onSelect(invoice)}
            fullWidth
            sx={{
              display: "block",
              p: 0,
              textAlign: "left",
              color: "inherit",
              borderRadius: 3,
              textTransform: "none",
              "&:hover": { backgroundColor: "transparent" },
            }}
            aria-current={selectedId === invoice.id ? "true" : undefined}
          >
            <Surface
              interactive
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "minmax(0,1fr) auto",
                  sm: "1.15fr 1.4fr .8fr .8fr auto",
                },
                alignItems: "center",
                gap: { xs: 1, sm: 1.5 },
                p: { xs: 1.5, sm: 2 },
                borderColor: selectedId === invoice.id ? "#6fae86" : "#dfe4eb",
                backgroundColor: selectedId === invoice.id ? "#f4faf5" : "#fff",
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
            </Surface>
          </Button>
        </Box>
      ))}
    </Stack>
  );
}

function InvoiceCreateForm({
  onCreated,
  onCancel,
}: {
  onCreated: (invoice: IntoolsInvoiceDetail) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(emptyForm);
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
      setError("Add a buyer profile ID, valid item values in cents, and an optional YYYY-MM-DD due date.");
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
              sx={{ p: 2, borderRadius: 2, backgroundColor: "#f6f8fa" }}
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
                    {busy ? "Saving…" : "Save draft"}
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
                    borderRadius: 2,
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
    <Box sx={{ p: 1.25, borderRadius: 2, backgroundColor: "#f6f8fa" }}>
      <Typography sx={{ color: "text.secondary", fontSize: 11 }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.3, fontSize: 15, fontWeight: 800 }}>
        {value}
      </Typography>
    </Box>
  );
}

function OrdersPanel() {
  const [orders, setOrders] = useState<IntoolsOrder[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(
    null,
  );
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
      <Surface sx={{ p: { xs: 2, sm: 3 } }}>
        <Button
          onClick={() => setSelected(null)}
          startIcon={<ArrowBack />}
          sx={{ px: 0, mb: 1 }}
        >
          Back to orders
        </Button>
        <Typography variant="h2" sx={{ fontSize: 24 }}>
          Order detail
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            mt: 2,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            font: "inherit",
            color: "text.secondary",
            fontSize: 13,
          }}
        >
          {JSON.stringify(selected, null, 2)}
        </Box>
      </Surface>
    );
  return (
    <Stack spacing={1}>
      {orders.length ? (
        orders.map((order) => (
          <Surface
            key={order.id}
            component="button"
            onClick={() =>
              void getIntoolsOrderDetail(order.order_no)
                .then(setSelected)
                .catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not load order detail.",
                  ),
                )
            }
            sx={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: {
                xs: "minmax(0,1fr) auto",
                sm: "1.1fr 1.5fr .8fr .8fr auto",
              },
              alignItems: "center",
              gap: 1.5,
              p: { xs: 1.5, sm: 2 },
              textAlign: "left",
              cursor: "pointer",
              color: "inherit",
              "&:hover": { borderColor: "#aeb9c8" },
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
          </Surface>
        ))
      ) : (
        <Surface sx={{ p: 4, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 700 }}>No orders returned</Typography>
        </Surface>
      )}
    </Stack>
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

export function Intools() {
  const [ready, setReady] = useState(false);
  const [access, setAccess] = useState<
    "loading" | "allowed" | "permission" | "error"
  >("loading");
  const supplierRoute = /^\/intools\/suppliers(?:\/([^/]+))?$/.exec(location.pathname);
  const supplierId = supplierRoute?.[1] ? decodeURIComponent(supplierRoute[1]) : null;
  const [tab, setTab] = useState<Tab>(() => (supplierRoute ? "suppliers" : "invoices"));
  const [filter, setFilter] = useState("all");
  const [invoices, setInvoices] = useState<IntoolsInvoice[]>([]);
  const [selected, setSelected] = useState<IntoolsInvoiceDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [error, setError] = useState("");
  const [localLogin, setLocalLogin] = useState(false);
  useEffect(() => {
    if (supplierRoute) setTab("suppliers");
  }, [supplierId]);
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
        setReady(true);
        if (supplierRoute) setAccess("allowed");
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
      setReady(true);
      if (supplierRoute) setAccess("allowed");
      else void loadInvoices();
    })().catch(() => {
      if (active) setAccess("error");
    });
    return () => {
      active = false;
    };
  }, []);
  async function selectInvoice(invoice: IntoolsInvoice) {
    setError("");
    try {
      setSelected(await getIntoolsInvoiceDetail(invoice.id));
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
          <Tooltip title="Private administrator workspace">
            <Avatar
              sx={{
                width: 34,
                height: 34,
                bgcolor: "#e5e7eb",
                color: "#5d6672",
              }}
            >
              <LockOutlined fontSize="small" />
            </Avatar>
          </Tooltip>
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
                Private operations for invoices, orders, and supplier records. Every consequential
                change is recorded.
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
                  ["orders", "Orders"],
                  ["audit", "Audit history"],
                  ["registrations", "Sign-up requests"],
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
                    navigate(value === "suppliers" ? "/intools/suppliers" : "/intools");
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
                    onBack={() => setSelected(null)}
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
                        onClick={() => setCreating((value) => !value)}
                        startIcon={creating ? <Close /> : <Add />}
                      >
                        {creating ? "Close new invoice" : "New invoice"}
                      </Button>
                    </Stack>
                    {creating && (
                      <InvoiceCreateForm
                        onCreated={(invoice) => {
                          setCreating(false);
                          setSelected(invoice);
                          void loadInvoices();
                        }}
                        onCancel={() => setCreating(false)}
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
            {tab === "orders" && <OrdersPanel />}
            {tab === "audit" && <AuditPanel />}
            {tab === "registrations" && <RegistrationRequestsPanel />}
            {tab === "suppliers" && (
              <IntoolsSuppliers
                supplierId={supplierId}
                onOpen={(id) => navigate(`/intools/suppliers/${encodeURIComponent(id)}`)}
                onBack={() => navigate("/intools/suppliers")}
              />
            )}
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  );
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
      setRequests(await listIntoolsRegistrationRequests(nextStatus === "all" ? null : nextStatus));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load sign-up requests.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);
  async function approve(id: string) {
    setError("");
    try {
      await approveRegistrationRequest(id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not approve this request.");
    }
  }
  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1.5 }}>
        <Typography sx={{ color: "text.secondary", fontSize: 14 }}>
          New accounts stay pending until an administrator approves them.
        </Typography>
        <Select size="small" value={status} aria-label="Filter sign-up requests by status" onChange={(event) => { setStatus(event.target.value); void load(event.target.value); }} sx={{ minWidth: 190 }}>
          <MenuItem value="pending_review">Pending review</MenuItem>
          <MenuItem value="approved">Approved</MenuItem>
          <MenuItem value="invited">Invited</MenuItem>
          <MenuItem value="declined">Declined</MenuItem>
          <MenuItem value="all">All requests</MenuItem>
        </Select>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {loading ? <LoadingRows /> : requests.length ? requests.map((request) => (
        <Surface key={request.id} sx={{ p: { xs: 1.5, sm: 2 }, display: "grid", gap: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{request.name} · {request.company_name}</Typography>
              <Typography sx={{ color: "text.secondary", fontSize: 13 }}>{request.email}{request.phone ? ` · ${request.country_code || ""} ${request.phone}` : ""}</Typography>
            </Box>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <StatusChip status={request.status} />
              {request.status === "pending_review" && <Button size="small" variant="contained" onClick={() => void approve(request.id)}>Approve</Button>}
            </Stack>
          </Stack>
          <Typography sx={{ color: "text.secondary", fontSize: 13 }}>Sourcing: {request.sourcing} · Revenue: {request.annual_revenue}</Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 12 }}>Submitted {shortDate(request.created_at)}</Typography>
        </Surface>
      )) : <Surface sx={{ p: 4, textAlign: "center" }}><Typography sx={{ fontWeight: 700 }}>No sign-up requests</Typography></Surface>}
    </Stack>
  );
}
