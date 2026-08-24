import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useForm } from "react-hook-form";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  Alert,
  Avatar,
  Box,
  Button as MuiButton,
  Checkbox,
  Chip,
  CircularProgress,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Skeleton,
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme,
  useMediaQuery,
  type SxProps,
  type Theme,
} from "@mui/material";
import {
  Add,
  ArrowBack,
  ArrowForward,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Circle,
  Description,
  EditOutlined,
  ErrorOutlined,
  FileUploadOutlined,
  FolderOpen,
  Home,
  Image,
  Inbox,
  Inventory2,
  KeyboardArrowDown,
  LibraryBooks,
  FilterList,
  LockOutlined,
  Menu as MenuIcon,
  SaveOutlined,
  Search,
  Sort,
  Settings,
  VerifiedOutlined,
  X,
} from "@mui/icons-material";
import {
  ArrowUp as PromptArrowUp,
  Plus as PromptPlus,
  Lock as ComposerLockIcon,
} from "lucide-react";
import {
  createRfqCase,
  getSession,
  getWorkspaceInvoiceDetail,
  getWorkspaceProduct,
  getWorkspaceRfqProduction,
  invokeRfqCopilot,
  listRfqAttachments,
  listRfqCases,
  listRfqMessages,
  listWorkspaceInvoices,
  listWorkspaceProducts,
  listWorkspaceRfqQuotes,
  listWorkspaceSelectedSuppliers,
  selectWorkspaceRfqQuote,
  startWorkspaceInvoiceCheckout,
  type RfqAttachment,
  type WorkspaceChatMessage,
  type WorkspaceInvoice,
  type WorkspaceInvoiceDetail,
  type WorkspaceProduct,
  type WorkspaceRfq,
  type WorkspaceRfqProduction,
  type WorkspaceRfqQuote,
  type WorkspaceSelectedSupplier,
  type CopilotAgentResponse,
  updateRfqCase,
  uploadRfqAttachment,
} from "./supabase";
import {
  MiniStageTimeline,
  nextStepOwner,
  StageTimeline,
} from "./dashboard-stage-timeline";
import "./product-workspace.css";

const dashboardTheme = createTheme({
  typography: {
    fontFamily: "'DM Sans', Arial, sans-serif",
    h1: { fontWeight: 500, letterSpacing: "-0.04em" },
    h2: { fontWeight: 600, letterSpacing: "-0.035em" },
    button: { fontWeight: 600, textTransform: "none" },
  },
  palette: {
    background: { default: "#f4f6f9", paper: "#ffffff" },
    text: { primary: "#202936", secondary: "#758091" },
    primary: { main: "#4b7657", dark: "#3d6548", contrastText: "#ffffff" },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, minHeight: 42, paddingInline: 16 },
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: 10, minHeight: 44 } },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 6 } } },
  },
});

type DashboardView =
  | "dashboard"
  | "new"
  | "requests"
  | "products"
  | "favourites"
  | "messages"
  | "invoices"
  | "settings"
  | "library";
type UploadState = "ready" | "invalid";
type UploadFile = {
  id: string;
  file: File;
  state: UploadState;
  message?: string;
};
type BriefForm = { brief: string };
type RfqPhase =
  | "idle"
  | "drafting"
  | "review"
  | "editing"
  | "submitted"
  | "matching"
  | "matched";
type RfqTab = "RFQ" | "Timeline" | "Quotes" | "Orders" | "Files";
type RfqFields = {
  product: string;
  quantity: string;
  material: string;
  certifications: string;
  colors: string;
  sizes: string;
  budget: string;
  timeline: string;
};
type StoredRfq = WorkspaceRfq;
type ConversationMessage = {
  id: string;
  from: "You" | "Atelix assistant";
  text: string;
  options?: string[] | null;
};
type AgentStatus = {
  text: string;
  tone: "success" | "info" | "warning" | "error";
};

const rfqFieldLabels: Record<keyof RfqFields, string> = {
  product: "Product",
  quantity: "Quantity",
  material: "Material",
  certifications: "Certifications",
  colors: "Colors",
  sizes: "Sizes",
  budget: "Target budget",
  timeline: "Timeline",
};

function newClientMessageId() {
  return crypto.randomUUID();
}

function remainingTurnsFromBudget(
  budgetState: CopilotAgentResponse["budgetState"],
) {
  if (typeof budgetState === "number") return budgetState;
  return typeof budgetState?.remainingTurns === "number"
    ? budgetState.remainingTurns
    : null;
}

const navItems: Array<{
  label: string;
  view: DashboardView;
  icon: typeof Home;
  href: string;
}> = [
  { label: "Dashboard", view: "dashboard", icon: Home, href: "/dashboard" },
  {
    label: "Requests",
    view: "requests",
    icon: Inbox,
    href: "/dashboard/requests",
  },
  {
    label: "Products",
    view: "products",
    icon: Inventory2,
    href: "/dashboard/products",
  },
  {
    label: "Messages",
    view: "messages",
    icon: Inbox,
    href: "/dashboard/messages",
  },
  {
    label: "Invoices",
    view: "invoices",
    icon: Description,
    href: "/dashboard/invoices",
  },
];
const acceptedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const acceptedExtensions = /\.(jpe?g|png|webp|pdf)$/i;
const maxFileSize = 25 * 1024 * 1024;
const matchingChecks = [
  "Brief saved to your Atelix workspace",
  "Reference files attached securely",
  "Atelix team review queued",
];
const defaultRfqFields: RfqFields = {
  product: "",
  quantity: "",
  material: "",
  certifications: "",
  colors: "",
  sizes: "",
  budget: "",
  timeline: "",
};

type UserProfile = { username: string; name: string; role?: string };
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0]?.slice(0, 2) || "A"
  ).toUpperCase();
}

type StackProps = {
  direction?: "row" | "column";
  spacing?: number | string;
  alignItems?: "center" | "flex-start" | "flex-end" | "stretch" | "baseline";
  justifyContent?:
    | "center"
    | "flex-start"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  flexWrap?: "wrap" | "nowrap" | "wrap-reverse";
  gap?: number | string;
  sx?: SxProps<Theme>;
  children?: ReactNode;
};
const Stack = ({
  direction = "column",
  spacing = 0,
  alignItems,
  justifyContent,
  flexWrap,
  gap,
  children,
  sx,
}: StackProps) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: direction,
      gap:
        gap ??
        (typeof spacing === "number"
          ? dashboardTheme.spacing(spacing)
          : spacing),
      alignItems,
      justifyContent,
      flexWrap,
      ...sx,
    }}
  >
    {children}
  </Box>
);

function RoundedSurface({
  children,
  translucent = false,
  interactive = false,
  sx,
  ...props
}: {
  children: ReactNode;
  translucent?: boolean;
  interactive?: boolean;
  sx?: Record<string, unknown>;
  [key: string]: unknown;
}) {
  return (
    <Paper
      elevation={0}
      {...props}
      sx={{
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid rgba(214,220,229,.85)",
        borderRadius: "14px",
        backgroundColor: translucent ? "rgba(255,255,255,.68)" : "#fff",
        backdropFilter: translucent ? "blur(18px)" : undefined,
        transition:
          "border-color 180ms ease, background-color 180ms ease, transform 180ms ease",
        ...(interactive
          ? {
              "&:hover": {
                borderColor: "#aeb9c8",
                transform: "translateY(-1px)",
              },
            }
          : {}),
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
}

function navigate(path: string) {
  history.pushState({}, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

function Sidebar({
  view,
  onNavigate,
  historyItems,
  onRestore,
  collapsed = false,
  onToggle,
  mobile = false,
}: {
  view: DashboardView;
  onNavigate: (item: (typeof navItems)[number]) => void;
  historyItems: StoredRfq[];
  onRestore: (item: StoredRfq) => void;
  collapsed?: boolean;
  onToggle?: () => void;
  mobile?: boolean;
}) {
  const compact = collapsed && !mobile;
  const [logoHovered, setLogoHovered] = useState(false);
  const itemSx = {
    color: "#697586",
    "&.Mui-selected": {
      backgroundColor: compact ? "transparent" : "#f0f1f3",
      color: "#202936",
    },
    "&.Mui-selected:hover": {
      backgroundColor: compact ? "#f7f7f8" : "#e9eaed",
    },
    "&:hover": { backgroundColor: compact ? "#f7f7f8" : "#f5f5f6" },
  };
  return (
    <Box
      component="nav"
      aria-label="Dashboard navigation"
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: compact ? "center" : "stretch",
        minHeight: 0,
        height: "100%",
        overflow: "hidden",
        p: compact ? 1.25 : mobile ? 2 : 2.25,
        transition: "padding 220ms ease",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: compact ? "center" : "space-between",
          gap: 1,
          width: compact ? 48 : "100%",
          minHeight: 44,
          mb: 2,
        }}
      >
        <Box
          component={compact ? "button" : "a"}
          href={compact ? undefined : "/"}
          type={compact ? "button" : undefined}
          aria-label={compact ? "Expand sidebar" : "Atelix home"}
          onClick={compact ? onToggle : undefined}
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
          onFocus={() => setLogoHovered(true)}
          onBlur={() => setLogoHovered(false)}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: compact ? "center" : "flex-start",
            gap: 1.1,
            width: compact ? 36 : "auto",
            height: compact ? 36 : "auto",
            p: 0,
            border: 0,
            borderRadius: "10px",
            backgroundColor: compact && logoHovered ? "#f0f1f3" : "transparent",
            color: "#16181c",
            textDecoration: "none",
            minWidth: 0,
            cursor: "pointer",
            transition: "background-color 160ms ease",
          }}
        >
          {compact ? (
            logoHovered ? (
              <ChevronRight sx={{ color: "#68717d", fontSize: 23 }} />
            ) : (
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  display: "grid",
                  placeItems: "center",
                  width: 28,
                  height: 28,
                  color: "#6fae86",
                  fontSize: 21,
                }}
              >
                ✦
              </Box>
            )
          ) : (
            <>
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  display: "grid",
                  placeItems: "center",
                  width: 28,
                  height: 28,
                  color: "#6fae86",
                  fontSize: 21,
                }}
              >
                ✦
              </Box>
              <Typography
                sx={{
                  color: "inherit",
                  fontSize: 19,
                  fontWeight: 700,
                  letterSpacing: "-.045em",
                }}
              >
                atelix<span style={{ color: "#6fae86" }}>.</span>
              </Typography>
            </>
          )}
        </Box>
        {!mobile && !compact && (
          <IconButton
            onClick={onToggle}
            aria-label="Collapse sidebar"
            size="small"
            sx={{ color: "#68717d", borderRadius: "8px" }}
          >
            <ChevronLeft fontSize="small" />
          </IconButton>
        )}
      </Box>
      <MuiButton
        onClick={() =>
          onNavigate({
            label: "New request",
            view: "new",
            icon: EditOutlined,
            href: "/dashboard/new-product-request",
          })
        }
        aria-label="New request"
        startIcon={!compact ? <EditOutlined /> : undefined}
        sx={{
          justifyContent: compact ? "center" : "flex-start",
          alignSelf: compact ? "center" : "stretch",
          minWidth: 0,
          px: compact ? 0 : 1.25,
          mb: 2.25,
          borderRadius: "10px",
          width: compact ? 48 : "auto",
          height: compact ? 48 : "auto",
          position: "sticky",
          top: 0,
          zIndex: 1,
          color: "#202936",
          backgroundColor: "#fff",
          "&:hover": { backgroundColor: "#f7f7f8" },
          "& .MuiButton-startIcon": { margin: 0, mr: 1 },
        }}
      >
        {compact ? <Add fontSize="small" /> : "New request"}
      </MuiButton>
      <List disablePadding sx={{ display: "grid", gap: 0.35, width: "100%" }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <ListItemButton
              key={item.view}
              selected={view === item.view}
              onClick={() => onNavigate(item)}
              component="a"
              href={item.href}
              aria-label={item.label}
              sx={{
                ...itemSx,
                justifyContent: compact ? "center" : "flex-start",
                alignSelf: compact ? "center" : "stretch",
                width: compact ? 48 : "100%",
                minHeight: 42,
                px: compact ? 0 : 1,
                borderRadius: "10px",
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: compact ? 0 : 32,
                  color: "inherit",
                  justifyContent: "center",
                }}
              >
                <Icon fontSize="small" />
              </ListItemIcon>
              {!compact && (
                <ListItemText
                  primary={
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: view === item.view ? 700 : 500,
                      }}
                    >
                      {item.label}
                    </Typography>
                  }
                />
              )}
            </ListItemButton>
          );
        })}
      </List>
      {!compact && (
        <Box
          sx={{
            mt: 2.5,
            minHeight: 0,
            flex: 1,
            overflowY: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <Typography
            sx={{
              px: 1,
              mb: 0.75,
              color: "#9ba1aa",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            Recent requests
          </Typography>
          {historyItems.length ? (
            <Box sx={{ display: "grid", gap: 0.25 }}>
              {historyItems.map((item) => (
                <ListItemButton
                  key={item.id}
                  onClick={() => onRestore(item)}
                  sx={{
                    display: "block",
                    px: 1,
                    py: 0.75,
                    borderRadius: "8px",
                    color: "#697586",
                    minWidth: 0,
                  }}
                >
                  <Typography noWrap sx={{ fontSize: 12, fontWeight: 600 }}>
                    {item.title}
                  </Typography>
                  <Typography
                    noWrap
                    sx={{ mt: 0.2, color: "#a0a7b0", fontSize: 10 }}
                  >
                    {new Date(item.updated_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {item.status}
                  </Typography>
                </ListItemButton>
              ))}
            </Box>
          ) : (
            <Typography
              sx={{ px: 1, color: "#9ea5ad", fontSize: 11, lineHeight: 1.45 }}
            >
              Your saved RFQs will appear here.
            </Typography>
          )}
        </Box>
      )}
      <Box sx={{ mt: 2.5, width: compact ? 48 : "100%", flexShrink: 0 }}>
        <Divider sx={{ mb: 1.25, borderColor: "#ececef" }} />
        <ListItemButton
          selected={view === "library"}
          component="a"
          href="/dashboard/library"
          onClick={(event) => {
            event.preventDefault();
            navigate("/dashboard/library");
          }}
          aria-label="Library"
          sx={{
            ...itemSx,
            justifyContent: compact ? "center" : "flex-start",
            alignSelf: compact ? "center" : "stretch",
            width: compact ? 48 : "100%",
            px: compact ? 0 : 1,
            borderRadius: "10px",
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: compact ? 0 : 32,
              color: "inherit",
              justifyContent: "center",
            }}
          >
            <LibraryBooks fontSize="small" />
          </ListItemIcon>
          {!compact && (
            <ListItemText
              primary={<Typography sx={{ fontSize: 13 }}>Library</Typography>}
            />
          )}
        </ListItemButton>
        <ListItemButton
          selected={view === "settings"}
          component="a"
          href="/dashboard/settings"
          onClick={(event) => {
            event.preventDefault();
            navigate("/dashboard/settings");
          }}
          aria-label="Settings"
          sx={{
            ...itemSx,
            justifyContent: compact ? "center" : "flex-start",
            alignSelf: compact ? "center" : "stretch",
            width: compact ? 48 : "100%",
            px: compact ? 0 : 1,
            borderRadius: "10px",
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: compact ? 0 : 32,
              color: "inherit",
              justifyContent: "center",
            }}
          >
            <Settings fontSize="small" />
          </ListItemIcon>
          {!compact && (
            <ListItemText
              primary={<Typography sx={{ fontSize: 13 }}>Settings</Typography>}
            />
          )}
        </ListItemButton>
      </Box>
    </Box>
  );
}

function UploadTray({
  files,
  onFiles,
  onRemove,
  compact = false,
  inputId = "product-reference-upload",
}: {
  files: UploadFile[];
  onFiles: (files: UploadFile[]) => void;
  onRemove: (id: string) => void;
  compact?: boolean;
  inputId?: string;
}) {
  function validate(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    const next = selected.map((file) => {
      const validType =
        acceptedTypes.has(file.type) || acceptedExtensions.test(file.name);
      const validSize = file.size <= maxFileSize;
      const uniqueId =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      return {
        id: `${file.name}-${file.lastModified}-${uniqueId}`,
        file,
        state: validType && validSize ? "ready" : "invalid",
        message: !validType
          ? "Use JPG, PNG, WebP, or PDF."
          : "Files must be 25 MB or smaller.",
      } satisfies UploadFile;
    });
    onFiles([...files, ...next]);
    event.target.value = "";
  }
  return (
    <Stack spacing={1.25} sx={{ mt: compact ? 0 : 1.5 }}>
      <Box
        component="label"
        htmlFor={inputId}
        sx={{
          display: compact ? "none" : "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer",
          color: "#6f7782",
          fontSize: 13,
          "&:hover": { color: "#202936" },
        }}
      >
        <input
          id={inputId}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          onChange={validate}
          style={{ display: "none" }}
        />
        <FileUploadOutlined sx={{ fontSize: 18 }} aria-hidden="true" /> Upload
        files{" "}
        <Typography component="span" sx={{ color: "#a1a7af", fontSize: 12 }}>
          JPG, PNG, WebP, PDF tech pack · 25 MB max
        </Typography>
      </Box>
      <AnimatePresence initial={false}>
        {files.map(({ id, file, state, message }) => (
          <motion.div
            key={id}
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.25,
                py: 0.75,
                borderRadius: 2,
                backgroundColor: state === "ready" ? "#f0f2f4" : "#fff0ee",
                color: state === "ready" ? "#46515f" : "#9a4f47",
              }}
            >
              <Image
                sx={{
                  display: file.type === "application/pdf" ? "none" : "block",
                  fontSize: 18,
                }}
              />
              <Description
                sx={{
                  display: file.type === "application/pdf" ? "block" : "none",
                  fontSize: 18,
                }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontSize: 12 }}>
                  {file.name}
                </Typography>
                <Typography
                  sx={{ color: "inherit", opacity: 0.68, fontSize: 10 }}
                >
                  {state === "ready"
                    ? `${(file.size / 1024 / 1024).toFixed(1)} MB${file.type === "application/pdf" ? " · Tech pack" : ""}`
                    : message}
                </Typography>
              </Box>
              <IconButton
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemove(id)}
                size="small"
                sx={{ color: "inherit" }}
              >
                <X fontSize="small" />
              </IconButton>
            </Box>
          </motion.div>
        ))}
      </AnimatePresence>
    </Stack>
  );
}

function CleanPromptComposer({
  onStart,
  onMessage,
}: {
  onStart: (brief: string, files: UploadFile[]) => void;
  onMessage: (message: string) => void;
}) {
  const { register, handleSubmit, watch, reset } = useForm<BriefForm>({
    defaultValues: { brief: "" },
  });
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [expanded, setExpanded] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const promptRegistration = register("brief");
  const brief = watch("brief");
  function resizePrompt(target: HTMLTextAreaElement) {
    target.style.height = "auto";
    const nextHeight = Math.min(target.scrollHeight, 248);
    target.style.height = `${nextHeight}px`;
    target.style.overflowY = target.scrollHeight > 248 ? "auto" : "hidden";
    setExpanded(nextHeight > 88);
  }
  function submit(values: BriefForm) {
    if (!values.brief.trim()) {
      onMessage("Describe what you need before creating a product request.");
      return;
    }
    if (files.some((file) => file.state === "invalid")) {
      onMessage(
        "Remove unsupported or oversized files before starting the request.",
      );
      return;
    }
    onStart(values.brief.trim(), files);
    reset();
    setFiles([]);
    setExpanded(false);
    requestAnimationFrame(() => {
      if (promptRef.current) {
        promptRef.current.style.height = "";
        promptRef.current.style.overflowY = "hidden";
      }
    });
  }
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    void handleSubmit(submit)();
  }
  return (
    <motion.form
      className="clean-prompt-form"
      style={{
        width: "100%",
        maxWidth: "100%",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
      onSubmit={handleSubmit(submit)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <motion.div
        animate={{ scale: brief.trim() ? 1.002 : 1 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: "100%" }}
      >
        <RoundedSurface
          sx={{
            display: "flex",
            alignItems: expanded ? "flex-end" : "center",
            gap: { xs: 0.25, sm: 0.5 },
            width: "100%",
            minHeight: { xs: 68, sm: 74 },
            p: { xs: 0.5, sm: 0.75 },
            pl: { xs: 0.75, sm: 1 },
            border: 0,
            borderRadius: expanded ? "18px" : "16px",
            backgroundColor: "#fff",
            boxShadow: "0 12px 30px rgba(32,41,54,.10)",
            transition:
              "box-shadow 180ms ease, border-radius 220ms cubic-bezier(.22,1,.36,1)",
            "&:focus-within": {
              border: 0,
              boxShadow: "0 12px 30px rgba(32,41,54,.10)",
            },
          }}
        >
          <Tooltip title="Add reference files">
            <IconButton
              type="button"
              component="label"
              htmlFor="product-reference-upload"
              aria-label="Add reference files"
              sx={{
                flex: "0 0 auto",
                width: 48,
                height: 48,
                color: "#202936",
                borderRadius: "12px",
                "&:hover": { backgroundColor: "#f2f3f4" },
              }}
            >
              <PromptPlus size={23} strokeWidth={1.8} />
            </IconButton>
          </Tooltip>
          <Box
            component="textarea"
            rows={1}
            aria-label="Product request"
            placeholder="Start sourcing with Atelix"
            {...promptRegistration}
            ref={(node: HTMLTextAreaElement | null) => {
              promptRegistration.ref(node);
              promptRef.current = node;
            }}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              promptRegistration.onChange(event);
              resizePrompt(event.currentTarget);
            }}
            onKeyDown={handleComposerKeyDown}
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: { xs: 56, sm: 42 },
              maxHeight: 248,
              resize: "none",
              overflowY: "hidden",
              border: 0,
              outline: 0,
              background: "transparent",
              color: "#202936",
              font: "inherit",
              fontSize: { xs: 15, sm: 17 },
              lineHeight: 1.4,
              py: { xs: 0.75, sm: 1.15 },
              "&::placeholder": { color: "#66717f" },
            }}
          />
          <Tooltip title="Start RFQ draft">
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                flex: "0 0 auto",
                alignSelf: expanded ? "flex-end" : "center",
              }}
            >
              <IconButton
                type="submit"
                aria-label="Start RFQ draft"
                disabled={!brief.trim()}
                sx={{
                  flex: "0 0 auto",
                  width: 44,
                  height: 44,
                  p: 0,
                  border: 0,
                  borderRadius: "12px",
                  boxShadow: "none",
                  color: "#fff",
                  backgroundColor: "#4b7657",
                  "&:hover": {
                    backgroundColor: "#3d6548",
                    transform: "scale(1.04)",
                  },
                  "&.Mui-disabled": {
                    color: "#c5cbd2",
                    backgroundColor: "#f1f2f3",
                  },
                  transition:
                    "background-color 150ms ease, transform 150ms ease",
                }}
              >
                <PromptArrowUp size={23} strokeWidth={1.9} />
              </IconButton>
            </Box>
          </Tooltip>
        </RoundedSurface>
      </motion.div>
      <UploadTray
        compact
        files={files}
        onFiles={setFiles}
        onRemove={(id) =>
          setFiles((current) => current.filter((item) => item.id !== id))
        }
      />
    </motion.form>
  );
}

function ConversationChatPanel({
  messages: conversationMessages,
  onSend,
  busy,
  status,
  remainingTurns,
  onUndo,
  canUndo,
}: {
  messages: ConversationMessage[];
  onSend: (message: string) => Promise<void>;
  busy: boolean;
  status: AgentStatus | null;
  remainingTurns: number | null;
  onUndo: () => Promise<void>;
  canUndo: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const hasDraft = Boolean(draft.trim());
  const messages: ConversationMessage[] = conversationMessages;
  const messageListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = messageListRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, busy]);
  function resizeConversation(target: HTMLTextAreaElement) {
    target.style.height = "auto";
    const nextHeight = Math.min(target.scrollHeight, 180);
    target.style.height = `${nextHeight}px`;
    target.style.overflowY = target.scrollHeight > 180 ? "auto" : "hidden";
    setExpanded(nextHeight > 52);
  }
  async function sendCurrentDraft() {
    const message = draft.trim();
    if (!message || busy) return;
    setDraft("");
    setExpanded(false);
    await onSend(message);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendCurrentDraft();
  }
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    event.preventDefault();
    void sendCurrentDraft();
  }
  return (
    <RoundedSurface
      sx={{
        display: "flex",
        alignSelf: "stretch",
        flexDirection: "column",
        height: {
          xs: "min(440px, calc(100dvh - 120px))",
          md: "min(610px, calc(100dvh - 200px))",
        },
        minHeight: { xs: 340, md: 480 },
        overflow: "hidden",
        border: 0,
        borderRadius: 0,
        backgroundColor: "transparent",
      }}
    >
      <Box
        ref={messageListRef}
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: { xs: 2.25, md: 3 },
          p: { xs: 0, md: 1.25 },
          pt: { xs: 1.5, md: 1.75 },
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          scrollbarWidth: "thin",
          scrollbarColor: "#c7cdd6 transparent",
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "#c7cdd6",
            borderRadius: 999,
          },
          "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "#aeb6c1" },
        }}
      >
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.24,
                delay: index === messages.length - 1 ? 0.08 : 0,
              }}
            >
              <Box
                sx={{
                  alignSelf: message.from === "You" ? "flex-end" : "flex-start",
                  maxWidth: message.from === "You" ? "88%" : "100%",
                  ml: message.from === "You" ? "auto" : 0,
                  px: message.from === "You" ? { xs: 1.75, md: 2.25 } : 0,
                  py: message.from === "You" ? { xs: 1.25, md: 1.5 } : 0,
                  borderRadius:
                    message.from === "You" ? "16px 16px 4px 16px" : 0,
                  backgroundColor:
                    message.from === "You" ? "#f0f1f3" : "transparent",
                  color: "#202936",
                }}
              >
                <Typography
                  sx={{
                    display: message.from === "You" ? "none" : "block",
                    mb: 0.7,
                    color: "#8a95a3",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {message.from}
                </Typography>
                <Typography
                  sx={{
                    fontSize: { xs: 14, md: 16 },
                    lineHeight: 1.65,
                    color: "inherit",
                  }}
                >
                  {message.text}
                </Typography>
                {message.from === "Atelix assistant" &&
                  index === messages.length - 1 &&
                  Boolean(message.options?.length) && (
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.75,
                        mt: 1.25,
                      }}
                    >
                      {message.options!.map((option, optionIndex) => (
                        <MuiButton
                          key={option}
                          size="small"
                          disabled={busy}
                          onClick={() => void onSend(option)}
                          sx={{
                            minHeight: 34,
                            px: 1.5,
                            borderRadius: "999px",
                            fontSize: 13,
                            fontWeight: 600,
                            textTransform: "none",
                            border: "1px solid",
                            borderColor: optionIndex === 0 ? "#4b7657" : "#d7dce2",
                            color: optionIndex === 0 ? "#fff" : "#3d4652",
                            backgroundColor:
                              optionIndex === 0 ? "#4b7657" : "transparent",
                            "&:hover": {
                              backgroundColor:
                                optionIndex === 0 ? "#3d6548" : "#f7f7f8",
                              borderColor: optionIndex === 0 ? "#3d6548" : "#c3cad3",
                            },
                          }}
                        >
                          {option}
                        </MuiButton>
                      ))}
                    </Box>
                  )}
              </Box>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <Box
            aria-label="Atelix assistant is drafting your RFQ"
            sx={{
              display: "flex",
              gap: 0.75,
              alignItems: "center",
              minHeight: 18,
              pl: 0.25,
            }}
          >
            <Typography sx={{ fontSize: 12.5, color: "#8a95a3", fontWeight: 600 }}>
              Drafting your RFQ
            </Typography>
            {[0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: dot * 0.16,
                }}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "#202936",
                  display: "block",
                }}
              />
            ))}
          </Box>
        )}
      </Box>
      {(status || remainingTurns !== null || canUndo) && (
        <Box
          aria-live="polite"
          role="status"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            mt: 0.75,
            px: 0.5,
            color:
              status?.tone === "error"
                ? "#a4413e"
                : status?.tone === "warning"
                  ? "#81622c"
                  : status?.tone === "success"
                    ? "#426c4e"
                    : "#566476",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          <Typography component="span" sx={{ color: "inherit", fontSize: "inherit" }}>
            {status?.text ||
              (remainingTurns !== null
                ? `${remainingTurns} AI ${remainingTurns === 1 ? "reply" : "replies"} left this month.`
                : "")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            {remainingTurns !== null && status && (
              <Typography component="span" sx={{ color: "#758091", fontSize: 11 }}>
                {remainingTurns} left
              </Typography>
            )}
            {canUndo && (
              <MuiButton
                size="small"
                onClick={() => void onUndo()}
                disabled={busy}
                sx={{ minHeight: 30, px: 1, color: "#426c4e" }}
              >
                Undo change
              </MuiButton>
            )}
          </Box>
        </Box>
      )}
      <Box
        component="form"
        className="conversation-composer"
        onSubmit={submit}
        sx={{
          display: "flex",
          alignItems: expanded ? "flex-end" : "center",
          gap: { xs: 0.25, sm: 0.5 },
          mt: 1,
          p: { xs: 0.5, sm: 0.75 },
          pl: { xs: 0.75, sm: 1 },
          border: "1px solid #e7ebf0",
          borderRadius: expanded ? "16px" : "14px",
          backgroundColor: "#fff",
          boxShadow: "0 8px 22px rgba(32,41,54,.07)",
          transition:
            "box-shadow 180ms ease, border-color 180ms ease, border-radius 220ms cubic-bezier(.22,1,.36,1)",
          "&:focus-within": {
            borderColor: "#cfe2d4",
            boxShadow: "0 8px 22px rgba(32,41,54,.09)",
          },
        }}
      >
        <Box
          component="textarea"
          rows={1}
          value={draft}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            setDraft(event.target.value);
            resizeConversation(event.currentTarget);
          }}
          onKeyDown={handleComposerKeyDown}
          aria-label="Continue conversation"
          placeholder="Reply, or add colors, sizes, certifications…"
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 42,
            maxHeight: 180,
            resize: "none",
            overflowY: "hidden",
            border: 0,
            outline: 0,
            background: "transparent",
            color: "#202936",
            font: "inherit",
            fontSize: { xs: 14, sm: 15 },
            lineHeight: 1.45,
            py: 1.05,
            "&::placeholder": { color: "#858c96" },
          }}
        />
        <Box
          component="img"
          src="/atelix-ai-mode-badge.png"
          alt="Atelix AI mode"
          sx={{
            flex: "0 0 auto",
            alignSelf: expanded ? "flex-end" : "center",
            width: { xs: 54, sm: 68 },
            height: { xs: 32, sm: 38 },
            objectFit: "contain",
            opacity: hasDraft ? 0.92 : 0.78,
            transition: "opacity 180ms ease",
          }}
        />
        <IconButton
          type="submit"
          aria-label="Send message"
          disabled={!hasDraft || busy}
          sx={{
            flex: "0 0 auto",
            alignSelf: expanded ? "flex-end" : "center",
            width: 40,
            height: 40,
            p: 0,
            border: 0,
            borderRadius: "10px",
            boxShadow: "none",
            color: "#fff",
            backgroundColor: "#4b7657",
            "&:hover": { backgroundColor: "#3d6548", transform: "scale(1.04)" },
            "&.Mui-disabled": { color: "#b6bdc6", backgroundColor: "#f1f2f3" },
            transition: "background-color 150ms ease, transform 150ms ease",
          }}
        >
          <PromptArrowUp size={21} strokeWidth={1.9} />
        </IconButton>
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          mt: 0.75,
          px: 0.5,
        }}
      >
        <ComposerLockIcon size={11} strokeWidth={2} color="#9aa3af" />
        <Typography sx={{ fontSize: 11, color: "#9aa3af", lineHeight: 1.4 }}>
          Drafting aid only. Supplier, price, and payment facts come from
          reviewed Atelix records.
        </Typography>
      </Box>
    </RoundedSurface>
  );
}

function RfqField({
  label,
  value,
  field,
  editing,
  draft,
  onChange,
}: {
  label: string;
  value: string;
  field: keyof RfqFields;
  editing: boolean;
  draft: RfqFields;
  onChange: (field: keyof RfqFields, value: string) => void;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "minmax(130px,.45fr) minmax(0,1fr)",
        },
        gap: { xs: 0.5, sm: 2 },
        py: 1.25,
        borderBottom: "1px solid #edf0f3",
      }}
    >
      <Typography sx={{ color: "#8a95a3", fontSize: 12 }}>{label}</Typography>
      {editing ? (
        <Box
          component="input"
          value={draft[field]}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange(field, event.target.value)
          }
          aria-label={label}
          sx={{
            width: "100%",
            minWidth: 0,
            border: "1px solid #ccd5df",
            borderRadius: 1.5,
            px: 1,
            py: 0.65,
            color: "#354357",
            backgroundColor: "#fff",
            font: "inherit",
            fontSize: 13,
            outline: 0,
            "&:focus": {
              borderColor: "#4b7657",
              boxShadow: "0 0 0 3px rgba(75,118,87,.14)",
            },
          }}
        />
      ) : (
        <Typography sx={{ color: "#3f4c5e", fontSize: 13, lineHeight: 1.45 }}>
          {value}
        </Typography>
      )}
    </Box>
  );
}

function FilesTab({ attachments }: { attachments: RfqAttachment[] }) {
  if (!attachments.length)
    return (
      <Box
        sx={{
          display: "grid",
          minHeight: 380,
          placeItems: "center",
          p: 4,
          textAlign: "center",
        }}
      >
        <Box>
          <Typography sx={{ color: "#718092", fontSize: 16, fontWeight: 700 }}>
            No files attached yet
          </Typography>
          <Typography
            sx={{
              maxWidth: 330,
              mt: 1,
              color: "#9aa4b0",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            Reference images or a tech pack you attach to this RFQ will appear
            here.
          </Typography>
        </Box>
      </Box>
    );
  return (
    <Stack spacing={1} sx={{ pt: { xs: 2, md: 3 } }}>
      {attachments.map((attachment) => (
        <Box
          key={attachment.id}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            px: 1.5,
            py: 1.1,
            border: "1px solid #e7ebf0",
            borderRadius: "10px",
          }}
        >
          {attachment.content_type === "application/pdf" ? (
            <Description sx={{ fontSize: 20, color: "#4b7657" }} />
          ) : (
            <Image sx={{ fontSize: 20, color: "#4b7657" }} />
          )}
          <Typography
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              color: "#3f4c5e",
              overflowWrap: "anywhere",
            }}
          >
            {attachment.original_name}
          </Typography>
          <Typography sx={{ flexShrink: 0, fontSize: 11.5, color: "#9ba1aa" }}>
            {(attachment.byte_size / 1024 / 1024).toFixed(1)} MB
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

function RfqDocumentPanel({
  phase,
  fields,
  draft,
  tab,
  setTab,
  caseStatus,
  caseId,
  attachments,
  onEdit,
  onChange,
  onSave,
  onCancel,
  onSubmit,
  onMessage,
  onQuoteSelected,
  agentStatus,
  changedFields,
}: {
  phase: RfqPhase;
  fields: RfqFields;
  draft: RfqFields;
  tab: RfqTab;
  setTab: (tab: RfqTab) => void;
  caseStatus: string;
  caseId: string;
  attachments: RfqAttachment[];
  onEdit: () => void;
  onChange: (field: keyof RfqFields, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onMessage: (message: string) => void;
  onQuoteSelected: () => void;
  agentStatus: AgentStatus | null;
  changedFields: Array<keyof RfqFields>;
}) {
  const editing = phase === "editing";
  const tabs: RfqTab[] = ["RFQ", "Timeline", "Quotes", "Orders", "Files"];
  const tabCount: Partial<Record<RfqTab, number>> = {
    Files: attachments.length,
  };
  function moveTab(event: KeyboardEvent, index: number) {
    const direction =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    setTab(tabs[(index + direction + tabs.length) % tabs.length]);
  }
  return (
    <RoundedSurface
      sx={{
        minHeight: { xs: 0, md: 610 },
        overflow: "hidden",
        border: 0,
        borderRadius: 0,
        backgroundColor: "transparent",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          px: { xs: 0, md: 0 },
          py: 1.75,
          borderBottom: "1px solid #e7ebf0",
        }}
      >
        <Box>
          <Typography
            sx={{
              color: "#8d98a5",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            RFQ
          </Typography>
          <Typography
            variant="h2"
            sx={{ mt: 0.45, fontSize: { xs: 20, md: 24 }, color: "#334155" }}
          >
            RFQ: {fields.quantity.replace(/\s*units?$/i, "")} Units –{" "}
            {fields.product}
          </Typography>
        </Box>
        <Chip
          label={
            phase === "matching" || phase === "matched"
              ? "Submitted"
              : editing
                ? "Editing"
                : "Ready to review"
          }
          size="small"
          sx={{
            color: editing ? "#81622c" : "#58745d",
            backgroundColor: editing ? "#fbf4e7" : "#eef4ee",
            fontWeight: 700,
          }}
        />
      </Box>
      <Box
        role="tablist"
        aria-label="RFQ workspace sections"
        sx={{
          display: "flex",
          gap: 0.5,
          px: { xs: 1.25, md: 2 },
          borderBottom: "1px solid #e7ebf0",
          overflowX: "auto",
        }}
      >
        {tabs.map((item, index) => (
          <Box
            key={item}
            id={`rfq-tab-${item.toLowerCase()}`}
            component="button"
            role="tab"
            aria-selected={tab === item}
            aria-controls="rfq-tabpanel"
            tabIndex={tab === item ? 0 : -1}
            onClick={() => setTab(item)}
            onKeyDown={(event: KeyboardEvent) => moveTab(event, index)}
            sx={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              gap: 0.6,
              px: 1.25,
              py: 1.35,
              border: 0,
              borderBottom:
                tab === item ? "2px solid #4b7657" : "2px solid transparent",
              background: "transparent",
              color: tab === item ? "#4b7657" : "#9aa4b0",
              font: "inherit",
              fontSize: 12,
              fontWeight: tab === item ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {item}
            {Boolean(tabCount[item]) && (
              <Box
                component="span"
                sx={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "#758091",
                  backgroundColor: "#f1f2f4",
                  borderRadius: 1,
                  px: 0.75,
                  py: 0.1,
                }}
              >
                {tabCount[item]}
              </Box>
            )}
          </Box>
        ))}
      </Box>
      <Box
        id="rfq-tabpanel"
        role="tabpanel"
        aria-labelledby={`rfq-tab-${tab.toLowerCase()}`}
        sx={{
          p: { xs: 0, md: 0 },
          pt: tab === "RFQ" ? { xs: 2, md: 3 } : { xs: 2.5, md: 3 },
        }}
      >
        {tab === "Timeline" && (
          <StageTimeline
            status={caseStatus}
            onReviewDraft={() => setTab("RFQ")}
          />
        )}
        {tab === "Files" && <FilesTab attachments={attachments} />}
        {tab === "Quotes" && (
          <QuotesTab
            caseId={caseId}
            onMessage={onMessage}
            onSelected={onQuoteSelected}
          />
        )}
        {tab === "Orders" && (
          <ProductionTab caseId={caseId} onMessage={onMessage} />
        )}
        {tab === "RFQ" && (
          <>
            {agentStatus && (
              <Box
                role="status"
                aria-live="polite"
                sx={{
                  mb: 2,
                  px: 1.25,
                  py: 1,
                  borderRadius: "8px",
                  backgroundColor:
                    agentStatus.tone === "error"
                      ? "#fdf0ef"
                      : agentStatus.tone === "warning"
                        ? "#fbf4e7"
                        : "#eef4ee",
                  color:
                    agentStatus.tone === "error"
                      ? "#923c39"
                      : agentStatus.tone === "warning"
                        ? "#705523"
                        : "#426c4e",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {agentStatus.text}
                {changedFields.length > 0
                  ? ` Updated: ${changedFields.map((field) => rfqFieldLabels[field]).join(", ")}.`
                  : ""}
              </Box>
            )}
            <Box sx={{ maxWidth: 820, mb: 3 }}>
              <Typography
                sx={{ color: "#566476", fontSize: 14, lineHeight: 1.65 }}
              >
                Dear Supplier,
              </Typography>
              <Typography
                sx={{
                  mt: 1.25,
                  color: "#788596",
                  fontSize: 14,
                  lineHeight: 1.65,
                }}
              >
                We are looking to source {fields.quantity.toLowerCase()} and
                would like to request a quotation based on the following
                requirements:
              </Typography>
            </Box>
            <Box
              sx={{
                mb: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Typography
                sx={{ color: "#4a5667", fontSize: 14, fontWeight: 700 }}
              >
                Product Specifications
              </Typography>
              {!editing &&
                phase !== "submitted" &&
                phase !== "matching" &&
                phase !== "matched" && (
                  <MuiButton
                    onClick={onEdit}
                    startIcon={<EditOutlined />}
                    size="small"
                    sx={{ color: "#708092" }}
                  >
                    Edit RFQ
                  </MuiButton>
                )}
            </Box>
            <Box>
              {(
                [
                  ["Product", "product"],
                  ["Material", "material"],
                  ["Certifications", "certifications"],
                  ["Colors", "colors"],
                  ["Sizes", "sizes"],
                  ["Quantity", "quantity"],
                  ["Target budget", "budget"],
                  ["Timeline", "timeline"],
                ] as Array<[string, keyof RfqFields]>
              ).map(([label, field]) => (
                <RfqField
                  key={field}
                  label={label}
                  value={fields[field]}
                  field={field}
                  editing={editing}
                  draft={draft}
                  onChange={onChange}
                />
              ))}
            </Box>
            <Box sx={{ mt: 3 }}>
              <Typography
                sx={{ color: "#4a5667", fontSize: 14, fontWeight: 700 }}
              >
                Certification Requirements
              </Typography>
              <Box
                component="ul"
                sx={{
                  mt: 1,
                  mb: 0,
                  pl: 2.5,
                  color: "#788596",
                  fontSize: 13,
                  lineHeight: 1.8,
                }}
              >
                <li>OEKO-TEX Standard 100 for all materials and dyes</li>
                <li>ISO 9001 quality management certification</li>
              </Box>
            </Box>
            {editing ? (
              <Stack
                direction="row"
                justifyContent="flex-end"
                spacing={1}
                sx={{ pt: 2 }}
              >
                <MuiButton onClick={onCancel} sx={{ color: "#718092" }}>
                  Cancel
                </MuiButton>
                <MuiButton
                  onClick={onSave}
                  variant="contained"
                  startIcon={<SaveOutlined />}
                  sx={{
                    backgroundColor: "#4b7657",
                    "&:hover": { backgroundColor: "#3d6548" },
                  }}
                >
                  Save changes
                </MuiButton>
              </Stack>
            ) : (
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={1.5}
                sx={{ pt: 3, flexWrap: "wrap" }}
              >
                <Typography sx={{ color: "#93a0ae", fontSize: 11 }}>
                  Review every detail before sending this draft to Atelix.
                </Typography>
                {phase !== "submitted" &&
                  phase !== "matching" &&
                  phase !== "matched" && (
                    <MuiButton
                      onClick={onSubmit}
                      endIcon={<ArrowForward />}
                      variant="contained"
                      sx={{
                        backgroundColor: "#4b7657",
                        "&:hover": { backgroundColor: "#3d6548" },
                      }}
                    >
                      Request RFQ Draft
                    </MuiButton>
                  )}
              </Stack>
            )}
          </>
        )}
      </Box>
    </RoundedSurface>
  );
}

function SupplierMap({ complete }: { complete: boolean }) {
  return (
    <Box
      sx={{
        position: "relative",
        minHeight: { xs: 260, md: 320 },
        overflow: "hidden",
        border: "1px solid #dfe8e1",
        borderRadius: "14px",
        background:
          "radial-gradient(circle at 30% 20%, rgba(232,244,235,.9), rgba(249,251,250,.98) 60%)",
      }}
    >
      <svg
        viewBox="0 0 760 320"
        role="img"
        aria-labelledby="matching-map-title matching-map-description"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <title id="matching-map-title">RFQ review pipeline</title>
        <desc id="matching-map-description">
          Your brief moves through structuring, eligibility checks and into
          Atelix review.
        </desc>
        <path
          d="M80 125 C200 45 300 68 385 122 S560 195 680 158"
          fill="none"
          stroke="#e2ece4"
          strokeWidth="2"
        />
        <motion.path
          d="M80 125 C200 45 300 68 385 122 S560 195 680 158"
          fill="none"
          stroke="#4b7657"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength="1"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: complete ? 1 : 0.72 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
        <g fill="#ffffff" stroke="#4b7657" strokeWidth="2.5">
          <circle cx="80" cy="125" r="8" />
          <circle cx="385" cy="122" r="6" />
          <circle cx="520" cy="171" r="6" />
          <circle cx="680" cy="158" r="8" />
        </g>
      </svg>
      <Box
        sx={{
          position: "absolute",
          left: "6%",
          top: "44%",
          width: 90,
          color: "#4b7657",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        Your brief
      </Box>
      <Box
        sx={{
          position: "absolute",
          left: "42%",
          top: "30%",
          width: 100,
          color: "#4b7657",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        Structuring RFQ
      </Box>
      <Box
        sx={{
          position: "absolute",
          left: "63%",
          top: "60%",
          width: 100,
          color: "#4b7657",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        Eligibility checks
      </Box>
      <Box
        sx={{
          position: "absolute",
          right: "5%",
          top: "44%",
          width: 110,
          textAlign: "right",
          color: "#4b7657",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        RFQ sent to Atelix
      </Box>
      <Box
        sx={{
          position: "absolute",
          left: 20,
          top: 18,
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.8,
          border: "1px solid #dce9df",
          borderRadius: "10px",
          backgroundColor: "rgba(255,255,255,.92)",
          color: "#4b7657",
          whiteSpace: "nowrap",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".04em",
          boxShadow: "0 4px 10px rgba(56,86,62,.08)",
        }}
      >
        <Box
          component="span"
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            backgroundColor: "#65a979",
          }}
        />
        {complete
          ? "RFQ MATCHED · READY TO REVIEW"
          : "RFQ SAVED · REVIEW QUEUED"}
      </Box>
    </Box>
  );
}

function SupplierMatchingStage({
  phase,
  checkCount,
  caseStatus,
  onQuotes,
}: {
  phase: "matching" | "matched";
  checkCount: number;
  caseStatus: string;
  onQuotes: () => void;
}) {
  const complete = phase === "matched";
  return (
    <RoundedSurface
      sx={{
        minHeight: { xs: 0, md: 610 },
        p: { xs: 0, md: 0 },
        border: 0,
        borderRadius: 0,
        backgroundColor: "transparent",
      }}
    >
      <Box>
        <Typography
          sx={{
            color: "#71917a",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}
        >
          Supplier matching
        </Typography>
        <Typography
          variant="h2"
          sx={{
            mt: 0.6,
            color: "#202936",
            fontWeight: 500,
            letterSpacing: "-.035em",
            fontSize: { xs: 24, md: 30 },
          }}
        >
          {complete ? "Your RFQ has been matched" : "We’re matching your RFQ"}
        </Typography>
        <Typography
          sx={{
            maxWidth: 560,
            mt: 1,
            color: "#758091",
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          Your brief is checked against vetted supplier profiles and compliance
          requirements. An Atelix reviewer confirms the shortlist before any
          supplier is contacted.
        </Typography>
      </Box>
      <Box sx={{ mt: 2.75 }}>
        <SupplierMap complete={complete} />
      </Box>
      <Box
        sx={{
          mt: 3,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "minmax(0,1fr) 300px" },
          gap: 3.5,
          alignItems: "start",
        }}
      >
        <Box>
          <Typography
            sx={{
              color: "#8b978e",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            Compliance checks
          </Typography>
          <Stack spacing={1.15} sx={{ mt: 1.25 }}>
            {matchingChecks.map((check, index) => (
              <motion.div
                key={check}
                initial={{ opacity: 0, x: -8 }}
                animate={{
                  opacity: index < checkCount || complete ? 1 : 0.38,
                  x: 0,
                }}
                transition={{ duration: 0.24, delay: index * 0.04 }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box
                    sx={{
                      display: "grid",
                      placeItems: "center",
                      width: 20,
                      height: 20,
                      color:
                        index < checkCount || complete ? "#4b7657" : "#b8c8ba",
                    }}
                  >
                    {index < checkCount || complete ? (
                      <CheckCircle sx={{ fontSize: 19 }} />
                    ) : (
                      <Circle sx={{ fontSize: 13 }} />
                    )}
                  </Box>
                  <Typography
                    sx={{
                      color:
                        index < checkCount || complete ? "#4a5667" : "#9ba79d",
                      fontSize: 13,
                    }}
                  >
                    {check}
                  </Typography>
                </Stack>
              </motion.div>
            ))}
          </Stack>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ mt: 2.75 }}
          >
            <MuiButton
              onClick={onQuotes}
              disabled={!complete}
              endIcon={<ArrowForward />}
              variant="contained"
              sx={{
                backgroundColor: "#4b7657",
                "&:hover": { backgroundColor: "#3d6548" },
              }}
            >
              Track this request
            </MuiButton>
            <Typography sx={{ color: "#9ba1aa", fontSize: 12 }}>
              We’ll notify you when the shortlist is ready.
            </Typography>
          </Stack>
        </Box>
        <Box
          sx={{
            p: 2,
            border: "1px solid #e7ebf0",
            borderRadius: "12px",
            backgroundColor: "#fff",
          }}
        >
          <Typography
            sx={{
              color: "#8d98a5",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            What happens next
          </Typography>
          <Box sx={{ mt: 1.5 }}>
            <MiniStageTimeline status={caseStatus} />
          </Box>
        </Box>
      </Box>
    </RoundedSurface>
  );
}

function quoteCertBadge(quote: WorkspaceRfqQuote) {
  if (!quote.certifications.length) return null;
  const pending = Boolean(quote.certification_note);
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}>
      {pending ? (
        <ErrorOutlined sx={{ fontSize: 15, color: "#9a7a33" }} />
      ) : (
        <VerifiedOutlined sx={{ fontSize: 15, color: "#4b7657" }} />
      )}
      <Typography
        sx={{
          fontSize: 11.5,
          fontWeight: 600,
          color: pending ? "#9a7a33" : "#4b7657",
        }}
      >
        {quote.certification_note ||
          quote.certifications.join(" + ") + " on file"}
      </Typography>
    </Stack>
  );
}

function quoteStatusLabel(status: WorkspaceRfqQuote["status"]) {
  return status === "selected" ? "Selected" : status === "declined" ? "Declined" : "Published";
}

function QuotesTab({
  caseId,
  onMessage,
  onSelected,
}: {
  caseId: string;
  onMessage: (message: string) => void;
  onSelected: () => void;
}) {
  const [quotes, setQuotes] = useState<WorkspaceRfqQuote[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setQuotes(await listWorkspaceRfqQuotes(caseId));
    } catch (cause) {
      onMessage(
        cause instanceof Error ? cause.message : "Could not load quotes.",
      );
    }
  }, [caseId, onMessage]);
  useEffect(() => {
    void load();
  }, [load]);
  async function select(quoteId: string) {
    setBusyId(quoteId);
    try {
      await selectWorkspaceRfqQuote(quoteId);
      await load();
      onSelected();
      onMessage(
        "Supplier selected. Atelix will confirm terms before any commercial commitment.",
      );
    } catch (cause) {
      onMessage(
        cause instanceof Error
          ? cause.message
          : "Could not select this supplier.",
      );
    } finally {
      setBusyId(null);
    }
  }
  if (quotes === null)
    return (
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {[1, 2, 3].map((row) => (
          <Skeleton key={row} variant="rounded" height={220} />
        ))}
      </Box>
    );
  if (!quotes.length)
    return (
      <Box
        sx={{
          display: "grid",
          minHeight: 380,
          placeItems: "center",
          p: 4,
          textAlign: "center",
        }}
      >
        <Box>
          <Typography sx={{ color: "#718092", fontSize: 16, fontWeight: 700 }}>
            No quotes yet
          </Typography>
          <Typography
            sx={{
              maxWidth: 330,
              mt: 1,
              color: "#9aa4b0",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            Atelix vets suppliers against your spec before quotes appear here.
          </Typography>
        </Box>
      </Box>
    );
  const decided = quotes.some((quote) => quote.status === "selected");
  return (
    <Stack spacing={2}>
      <Typography
        sx={{ color: "#758091", fontSize: 13, lineHeight: 1.6, maxWidth: 640 }}
      >
        Atelix vetted these suppliers against your spec. Quotes are normalized
        to the same unit basis and MOQ; certifications shown are on file with
        Atelix.
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
        }}
      >
        {quotes.map((quote) => {
          const selected = quote.status === "selected";
          return (
            <Box
              key={quote.id}
              sx={{
                display: "flex",
                flexDirection: "column",
                border: selected ? "2px solid #4b7657" : "1px solid #e7ebf0",
                borderRadius: "14px",
                backgroundColor: "#fff",
                overflow: "hidden",
                opacity: decided && !selected ? 0.55 : 1,
                boxShadow: selected ? "0 8px 22px rgba(75,118,87,.10)" : "none",
              }}
            >
              <Box
                sx={{
                  p: 2,
                  borderBottom: "1px solid #eef0f3",
                  backgroundColor: quote.recommended
                    ? "#f7fbf7"
                    : "transparent",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 1,
                }}
              >
                <Box>
                  <Typography
                    sx={{ fontSize: 14.5, fontWeight: 700, color: "#202936" }}
                  >
                    {quote.factory_name}
                  </Typography>
                  <Typography sx={{ mt: 0.35, fontSize: 12, color: "#8a95a3" }}>
                    {[
                      quote.factory_region,
                      quote.factory_years
                        ? `${quote.factory_years} yrs in business`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                </Box>
                {quote.recommended && (
                  <Box
                    component="span"
                    sx={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: "#4b7657",
                      backgroundColor: "#eef4ee",
                      borderRadius: "6px",
                      px: 1,
                      py: 0.35,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Recommended
                  </Box>
                )}
                <Chip
                  size="small"
                  label={quoteStatusLabel(quote.status)}
                  sx={{
                    color: quote.status === "selected" ? "#33513c" : quote.status === "declined" ? "#8b625b" : "#596678",
                    backgroundColor: quote.status === "selected" ? "#eef4ee" : quote.status === "declined" ? "#f8eeee" : "#f3f5f7",
                    fontWeight: 700,
                  }}
                />
              </Box>
              <Stack spacing={1.25} sx={{ p: 2, flex: 1 }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="baseline"
                >
                  <Typography sx={{ fontSize: 11.5, color: "#8a95a3" }}>
                    Unit price
                  </Typography>
                  <Typography
                    sx={{ fontSize: 20, fontWeight: 700, color: "#202936" }}
                  >
                    {invoiceMoney(quote.unit_price_cents)}
                  </Typography>
                </Stack>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="baseline"
                >
                  <Typography sx={{ fontSize: 11.5, color: "#8a95a3" }}>
                    MOQ
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "#3f4c5e" }}>
                    {quote.moq.toLocaleString()}
                  </Typography>
                </Stack>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="baseline"
                >
                  <Typography sx={{ fontSize: 11.5, color: "#8a95a3" }}>
                    Lead time
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "#3f4c5e" }}>
                    {quote.lead_time_days} days
                  </Typography>
                </Stack>
                {quoteCertBadge(quote)}
              </Stack>
              <Box sx={{ p: 2, pt: 0 }}>
                {selected ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 0.75,
                      py: 1.25,
                      borderRadius: "10px",
                      backgroundColor: "#eef4ee",
                      color: "#33513c",
                      fontSize: 12.5,
                      fontWeight: 700,
                    }}
                  >
                    <CheckCircle sx={{ fontSize: 16 }} />
                    Selected
                  </Box>
                ) : (
                  <MuiButton
                    fullWidth
                    disabled={decided || busyId === quote.id}
                    onClick={() => void select(quote.id)}
                    variant={quote.recommended ? "contained" : "outlined"}
                    sx={
                      quote.recommended
                        ? {
                            backgroundColor: "#4b7657",
                            "&:hover": { backgroundColor: "#3d6548" },
                          }
                        : { borderColor: "#e7ebf0", color: "#4a5667" }
                    }
                  >
                    {busyId === quote.id ? "Selecting…" : "Select supplier"}
                  </MuiButton>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <LockOutlined sx={{ fontSize: 14, color: "#9ba1aa" }} />
        <Typography sx={{ fontSize: 11.5, color: "#9ba1aa" }}>
          Selecting a supplier notifies Atelix to confirm terms before any
          commercial commitment.
        </Typography>
      </Stack>
    </Stack>
  );
}

function productionStageLabel(stage: string | null) {
  return (
    {
      sampling: "Sampling",
      bulk_production: "Bulk production",
      quality_inspection: "Quality inspection & shipment",
      shipped: "Shipped",
      delivered: "Delivered",
    }[stage || ""] || "Not started"
  );
}

function ProductionTab({
  caseId,
  onMessage,
}: {
  caseId: string;
  onMessage: (message: string) => void;
}) {
  const [data, setData] = useState<WorkspaceRfqProduction | null>(null);
  useEffect(() => {
    let active = true;
    void getWorkspaceRfqProduction(caseId)
      .then((next) => {
        if (active) setData(next);
      })
      .catch((cause) => {
        if (active)
          onMessage(
            cause instanceof Error
              ? cause.message
              : "Could not load production status.",
          );
      });
    return () => {
      active = false;
    };
  }, [caseId, onMessage]);
  if (data === null) return <Skeleton variant="rounded" height={320} />;
  if (!data.quote)
    return (
      <Box
        sx={{
          display: "grid",
          minHeight: 380,
          placeItems: "center",
          p: 4,
          textAlign: "center",
        }}
      >
        <Box>
          <Typography sx={{ color: "#718092", fontSize: 16, fontWeight: 700 }}>
            Production starts once you select a supplier
          </Typography>
          <Typography
            sx={{
              maxWidth: 330,
              mt: 1,
              color: "#9aa4b0",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            Choose a quote from the Quotes tab to see production and logistics
            here.
          </Typography>
        </Box>
      </Box>
    );
  const stages: Array<{
    key: string;
    label: string;
    done: boolean;
    current: boolean;
    detail?: string;
  }> = [
    {
      key: "confirmed",
      label: "Supplier confirmed",
      done: true,
      current: false,
      detail: data.quote.factory_name,
    },
    {
      key: "invoice",
      label: "Invoice payment",
      done: Boolean(data.invoice && data.invoice.status === "paid"),
      current: Boolean(data.invoice && data.invoice.status !== "paid"),
      detail: data.invoice
        ? data.invoice.status === "paid"
          ? "Paid"
          : "Waiting on you"
        : "Not yet invoiced",
    },
    {
      key: "sampling",
      label: "Sampling",
      done: Boolean(
        data.order &&
        [
          "bulk_production",
          "quality_inspection",
          "shipped",
          "delivered",
        ].includes(data.order.production_stage || ""),
      ),
      current: data.order?.production_stage === "sampling",
    },
    {
      key: "bulk",
      label: "Bulk production",
      done: Boolean(
        data.order &&
        ["quality_inspection", "shipped", "delivered"].includes(
          data.order.production_stage || "",
        ),
      ),
      current: data.order?.production_stage === "bulk_production",
    },
    {
      key: "qc",
      label: "Quality inspection & shipment",
      done: Boolean(
        data.order &&
        ["shipped", "delivered"].includes(data.order.production_stage || ""),
      ),
      current: data.order?.production_stage === "quality_inspection",
    },
  ];
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 300px" },
        gap: 3,
      }}
    >
      <Box>
        <Typography sx={{ fontSize: 18, fontWeight: 600, color: "#202936" }}>
          Confirmed with {data.quote.factory_name}
        </Typography>
        <Typography
          sx={{ mt: 0.75, fontSize: 13, color: "#758091", maxWidth: 480 }}
        >
          {data.order
            ? `Sample order ${data.order.order_no} is active. Production stage: ${productionStageLabel(data.order.production_stage)}.`
            : "Atelix has the selected supplier and will initiate the sample order from Intools. It will appear here once confirmed."}
        </Typography>
        <Box sx={{ mt: 2.5, display: "grid", gap: 0 }}>
          {stages.map((stage, index) => (
            <Box
              key={stage.key}
              sx={{
                display: "grid",
                gridTemplateColumns: "20px minmax(0,1fr)",
                columnGap: 1.5,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    placeItems: "center",
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    backgroundColor: stage.done ? "#4b7657" : "#fff",
                    border: stage.done
                      ? 0
                      : stage.current
                        ? "2px solid #4b7657"
                        : "2px solid #e0e4e9",
                  }}
                >
                  {stage.done && (
                    <CheckCircle sx={{ fontSize: 14, color: "#fff" }} />
                  )}
                  {!stage.done && stage.current && (
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: "#4b7657",
                      }}
                    />
                  )}
                </Box>
                {index < stages.length - 1 && (
                  <Box
                    sx={{
                      flex: 1,
                      width: "2px",
                      minHeight: 20,
                      backgroundColor: "#eef0f3",
                    }}
                  />
                )}
              </Box>
              <Box sx={{ pb: 2.5 }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: stage.done || stage.current ? "#202936" : "#9aa4b0",
                  }}
                >
                  {stage.label}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.35,
                    fontSize: 12,
                    color: stage.current ? "#4b7657" : "#758091",
                  }}
                >
                  {stage.detail}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
      <Box
        sx={{
          p: 2,
          border: "1px solid #e7ebf0",
          borderRadius: "12px",
          backgroundColor: "#fff",
          alignSelf: "start",
        }}
      >
        <Typography
          sx={{
            color: "#8d98a5",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}
        >
          Invoice
        </Typography>
        {data.invoice ? (
          <>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
              sx={{ mt: 1.25 }}
            >
              <Box>
                <Typography
                  sx={{ fontSize: 15, fontWeight: 700, color: "#202936" }}
                >
                  {data.invoice.invoice_no}
                </Typography>
                <Typography sx={{ mt: 0.3, fontSize: 12, color: "#758091" }}>
                  {invoiceDate(data.invoice.due_date)}
                </Typography>
              </Box>
              <Chip
                size="small"
                label={invoiceStatusLabel(data.invoice as WorkspaceInvoice)}
                color={invoiceStatusColor(data.invoice as WorkspaceInvoice)}
              />
            </Stack>
            <Box
              sx={{
                mt: 2,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 1.5,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 10.5, color: "#9ba1aa" }}>
                  Total
                </Typography>
                <Typography sx={{ mt: 0.3, fontSize: 15, fontWeight: 700 }}>
                  {invoiceMoney(data.invoice.total_cents)}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 10.5, color: "#9ba1aa" }}>
                  Balance
                </Typography>
                <Typography
                  sx={{
                    mt: 0.3,
                    fontSize: 15,
                    fontWeight: 700,
                    color: data.invoice.balance_cents ? "#9a4f47" : "#202936",
                  }}
                >
                  {invoiceMoney(data.invoice.balance_cents)}
                </Typography>
              </Box>
            </Box>
            {data.invoice.status === "sent" && (
              <MuiButton
                fullWidth
                variant="contained"
                sx={{
                  mt: 2,
                  backgroundColor: "#4b7657",
                  "&:hover": { backgroundColor: "#3d6548" },
                }}
                onClick={() =>
                  navigate(
                    `/dashboard/invoices/${encodeURIComponent(data.invoice!.id)}`,
                  )
                }
              >
                Pay invoice
              </MuiButton>
            )}
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.6}
              sx={{ mt: 1 }}
            >
              <LockOutlined sx={{ fontSize: 13, color: "#9ba1aa" }} />
              <Typography sx={{ fontSize: 10.5, color: "#9ba1aa" }}>
                Stripe-hosted, webhook-settled.
              </Typography>
            </Stack>
          </>
        ) : (
          <Typography sx={{ mt: 1.25, fontSize: 12.5, color: "#9aa4b0" }}>
            Not yet invoiced. Atelix sends an invoice once production is
            confirmed.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function fieldsFromBrief(brief: Record<string, unknown>): RfqFields {
  const source =
    brief.fields &&
    typeof brief.fields === "object" &&
    !Array.isArray(brief.fields)
      ? (brief.fields as Record<string, unknown>)
      : brief;
  return Object.fromEntries(
    Object.keys(defaultRfqFields).map((key) => [
      key,
      typeof source[key] === "string" ? source[key] : "",
    ]),
  ) as RfqFields;
}

function briefFromFields(
  summary: string,
  fields: RfqFields,
): Record<string, unknown> {
  return { summary, fields };
}

function phaseForPersistedStatus(status: string): RfqPhase {
  switch (status) {
    case "draft":
      return "review";
    case "needs_research":
      return "submitted";
    default:
      return "submitted";
  }
}

function RfqWorkspace({
  caseId,
  brief,
  initialFields,
  files,
  status,
  initialRevision = 0,
  initialAgentPrompt,
  initialPhase,
  onMessage,
  onAgentDraftPatched,
}: {
  caseId: string;
  brief: string;
  initialFields: RfqFields;
  files: RfqAttachment[];
  status: string;
  initialRevision?: number;
  initialAgentPrompt?: string;
  initialPhase?: RfqPhase;
  onMessage: (message: string) => void;
  onAgentDraftPatched: (fields: RfqFields, revision: number) => void;
}) {
  const persistedPhase = phaseForPersistedStatus(status);
  const restoredSubmitted =
    initialPhase === undefined && persistedPhase === "submitted";
  const [phase, setPhase] = useState<RfqPhase>(initialPhase ?? persistedPhase);
  const [fields, setFields] = useState<RfqFields>(initialFields);
  const [draft, setDraft] = useState<RfqFields>(initialFields);
  const [attachments, setAttachments] = useState<RfqAttachment[]>(files);
  const [tab, setTab] = useState<RfqTab>(() =>
    restoredSubmitted ? "Timeline" : "RFQ",
  );
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [checkCount, setCheckCount] = useState(0);
  const [trackAcknowledged, setTrackAcknowledged] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [agentRevision, setAgentRevision] = useState(initialRevision);
  const [agentPending, setAgentPending] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [changedFields, setChangedFields] = useState<Array<keyof RfqFields>>([]);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [remainingTurns, setRemainingTurns] = useState<number | null>(null);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const initialTurnStarted = useRef(false);

  useEffect(() => {
    let active = true;
    void listRfqAttachments(caseId)
      .then((next) => {
        if (active) setAttachments(next);
      })
      .catch((cause) => {
        if (active)
          onMessage(
            cause instanceof Error
              ? cause.message
              : "Could not load attached references.",
          );
      });
    return () => {
      active = false;
    };
  }, [caseId, onMessage]);
  useEffect(() => {
    let active = true;
    void listRfqMessages(caseId)
      .then((next) => {
        if (active)
          setConversationMessages(
            next.map((message) => ({
              id: message.id,
              from: (message.role === "buyer"
                ? "You"
                : "Atelix assistant") as ConversationMessage["from"],
              text: message.content,
            })),
          );
        if (active) setMessagesLoaded(true);
      })
      .catch((cause) => {
        if (active) {
          onMessage(
            cause instanceof Error
              ? cause.message
              : "Could not load the RFQ conversation.",
          );
          setMessagesLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [caseId, onMessage]);

  useEffect(() => {
    if (phase !== "submitted" || restoredSubmitted) return;
    const timer = window.setTimeout(() => setPhase("matching"), 500);
    return () => window.clearTimeout(timer);
  }, [phase, restoredSubmitted]);
  useEffect(() => {
    if (phase !== "matching") return;
    setCheckCount(0);
    const timer = window.setInterval(
      () =>
        setCheckCount((current) =>
          Math.min(current + 1, matchingChecks.length),
        ),
      640,
    );
    return () => window.clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== "matching" || checkCount < matchingChecks.length) return;
    const timer = window.setTimeout(() => setPhase("matched"), 350);
    return () => window.clearTimeout(timer);
  }, [phase, checkCount]);

  function startEdit() {
    setDraft(fields);
    setPhase("editing");
  }
  function changeField(field: keyof RfqFields, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  function applyAgentResponse(response: CopilotAgentResponse) {
    const patch = response.savedPatch ?? {};
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(
        ([field, value]) =>
          Object.prototype.hasOwnProperty.call(defaultRfqFields, field) &&
          typeof value === "string",
      ),
    ) as Partial<RfqFields>;
    const responseChangedFields = response.changedFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(defaultRfqFields, field),
    ) as Array<keyof RfqFields>;
    const nextChangedFields = responseChangedFields.length
      ? responseChangedFields
      : (Object.keys(safePatch) as Array<keyof RfqFields>);
    if (Object.keys(safePatch).length > 0) {
      setFields((current) => {
        const next = response.undoToken === null && response.kind === "draft_updated"
          ? { ...defaultRfqFields, ...safePatch }
          : { ...current, ...safePatch };
        onAgentDraftPatched(next, response.revision);
        return next;
      });
      setDraft((current) => ({ ...current, ...safePatch }));
    }
    setChangedFields(nextChangedFields);
    setAgentRevision(response.revision);
    setUndoToken(response.undoToken);
    setRemainingTurns(remainingTurnsFromBudget(response.budgetState));
    const supportRequested =
      Boolean(response.supportHandoff) || response.kind === "support_handoff";
    const unavailable = response.kind === "unavailable";
    setAgentStatus({
      tone: unavailable
        ? "warning"
        : supportRequested
          ? "info"
          : nextChangedFields.length
            ? "success"
            : "info",
      text: unavailable
        ? "Atelix AI is unavailable right now. You can keep editing this RFQ."
        : supportRequested
          ? "For payment or order clarification, contact info@arcanawangsa.com."
          : response.verificationStatus ||
            (nextChangedFields.length
              ? "Your RFQ draft has been updated."
              : "Atelix has checked the saved RFQ."),
    });
    setConversationMessages((current) => [
      ...current,
      {
        id: newClientMessageId(),
        from: "Atelix assistant",
        text: response.reply,
        options: response.options,
      },
    ]);
  }
  async function sendConversationMessage(message: string) {
    if (agentPending) return;
    const clientMessageId = newClientMessageId();
    setAgentPending(true);
    setChangedFields([]);
    setUndoToken(null);
    setAgentStatus({ tone: "info", text: "Atelix is checking your request…" });
    setConversationMessages((current) => [
      ...current,
      { id: clientMessageId, from: "You", text: message },
    ]);
    try {
      const response = await invokeRfqCopilot({
        rfqCaseId: caseId,
        message,
        clientMessageId,
        expectedRevision: agentRevision,
      });
      applyAgentResponse(response);
    } catch (cause) {
      const fallback =
        "I’m sorry, I can’t check that just now. You can keep editing this RFQ, or contact info@arcanawangsa.com for payment or order clarification.";
      setAgentStatus({
        tone: "warning",
        text: "Atelix AI is temporarily unavailable. Your RFQ was not changed.",
      });
      setConversationMessages((current) => [
        ...current,
        { id: newClientMessageId(), from: "Atelix assistant", text: fallback },
      ]);
      onMessage(cause instanceof Error ? cause.message : "Could not reach Atelix AI.");
    } finally {
      setAgentPending(false);
    }
  }
  async function undoAgentChange() {
    if (!undoToken || agentPending) return;
    setAgentPending(true);
    setAgentStatus({ tone: "info", text: "Restoring the previous RFQ draft…" });
    try {
      const response = await invokeRfqCopilot({
        rfqCaseId: caseId,
        clientMessageId: newClientMessageId(),
        expectedRevision: agentRevision,
        action: "undo",
        undoToken,
      });
      applyAgentResponse(response);
    } catch (cause) {
      setAgentStatus({
        tone: "error",
        text: "That change could not be undone. Your RFQ remains unchanged.",
      });
      onMessage(cause instanceof Error ? cause.message : "Could not undo the RFQ change.");
    } finally {
      setAgentPending(false);
    }
  }
  useEffect(() => {
    if (!initialAgentPrompt || !messagesLoaded || initialTurnStarted.current)
      return;
    initialTurnStarted.current = true;
    void sendConversationMessage(initialAgentPrompt).finally(() =>
      setPhase("review"),
    );
  }, [initialAgentPrompt, messagesLoaded]);
  function saveEdit() {
    void updateRfqCase(caseId, {
      title: brief.slice(0, 120) || "New sourcing request",
      brief: briefFromFields(brief, draft),
      status: "draft",
    })
      .then(() => {
        setFields(draft);
        setPhase("review");
        setConversationMessages((current) => [
          ...current,
          {
            id: newClientMessageId(),
            from: "Atelix assistant",
            text: "Your RFQ changes are saved. Review the updated brief before requesting the draft.",
          },
        ]);
      })
      .catch((cause) =>
        onMessage(
          cause instanceof Error ? cause.message : "Could not save your RFQ.",
        ),
      );
  }
  function submitRfq() {
    void updateRfqCase(caseId, {
      title: brief.slice(0, 120) || "New sourcing request",
      brief: briefFromFields(brief, fields),
      status: "needs_research",
    })
      .then(() => {
        setPhase("submitted");
        setConversationMessages((current) => [
          ...current,
          {
            id: newClientMessageId(),
            from: "Atelix assistant",
            text: "Your RFQ draft has been submitted for Atelix review.",
          },
        ]);
      })
      .catch((cause) =>
        onMessage(
          cause instanceof Error ? cause.message : "Could not submit your RFQ.",
        ),
      );
  }
  function goToQuotes() {
    // The buyer must see the completed matching checks and click through
    // themselves; only this manual acknowledgement switches the panel away
    // from SupplierMatchingStage, not the phase reaching "matched" on its own.
    setTrackAcknowledged(true);
    setTab("Quotes");
  }

  const draftingPhase =
    phase === "drafting" || phase === "review" || phase === "editing";
  const showMatchingAnimation =
    (phase === "matching" || phase === "matched") && !trackAcknowledged;
  const baseStatus =
    phase === "submitted" || phase === "matching" || phase === "matched"
      ? status === "draft"
        ? "needs_research"
        : status
      : status;
  const caseStatus = statusOverride ?? baseStatus;
  const rightPanel = showMatchingAnimation ? (
    <SupplierMatchingStage
      phase={phase === "matched" ? "matched" : "matching"}
      checkCount={checkCount}
      caseStatus={caseStatus}
      onQuotes={goToQuotes}
    />
  ) : (
    <RfqDocumentPanel
      phase={phase}
      fields={fields}
      draft={draft}
      tab={tab}
      setTab={setTab}
      caseStatus={caseStatus}
      caseId={caseId}
      attachments={attachments}
      onEdit={startEdit}
      onChange={changeField}
      onSave={saveEdit}
      onCancel={() => setPhase("review")}
      onSubmit={submitRfq}
      onMessage={onMessage}
      onQuoteSelected={() => setStatusOverride("quote_selected")}
      agentStatus={agentStatus}
      changedFields={changedFields}
    />
  );
  return (
    <Stack spacing={2.25} sx={{ width: "100%" }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: draftingPhase
            ? { xs: "1fr", md: "minmax(0,1fr) minmax(0,1.6fr)" }
            : "minmax(0,1fr)",
          gap: 3,
          alignItems: "stretch",
        }}
      >
        {draftingPhase && (
          <ConversationChatPanel
            messages={conversationMessages}
            onSend={sendConversationMessage}
            busy={agentPending}
            status={agentStatus}
            remainingTurns={remainingTurns}
            canUndo={Boolean(undoToken)}
            onUndo={undoAgentChange}
          />
        )}
        <Box
          sx={{
            gridColumn: draftingPhase ? "auto" : "1 / -1",
            minWidth: 0,
            width: "100%",
          }}
        >
          {rightPanel}
        </Box>
      </Box>
    </Stack>
  );
}

const stageCopy: Record<string, string> = {
  draft: "Approval needed",
  needs_research: "Atelix review",
  awaiting_supplier: "Awaiting suppliers",
  supplier_replied: "Supplier replied",
  buyer_review: "Quotes in — your decision",
  quote_selected: "Confirming terms",
  in_production: "In production",
  closed: "Closed",
};
const stageDotColor: Record<string, string> = {
  draft: "#65a979",
  needs_research: "#c9a86a",
  awaiting_supplier: "#c9a86a",
  supplier_replied: "#c9a86a",
  buyer_review: "#65a979",
  quote_selected: "#c9a86a",
  in_production: "#c9a86a",
  closed: "#b6bdc6",
};
type RequestFilter = "all" | "needs_you" | "in_progress" | "closed";
function WorkspaceRequests({
  requests,
  onOpen,
}: {
  requests: StoredRfq[];
  onOpen: (request: StoredRfq) => void;
}) {
  const [unpaidCaseIds, setUnpaidCaseIds] = useState<Set<string>>(new Set());
  const [suppliers, setSuppliers] = useState<Map<string, WorkspaceSelectedSupplier>>(new Map());
  const [filter, setFilter] = useState<RequestFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void listWorkspaceInvoices()
      .then((rows) => {
        if (!active) return;
        setUnpaidCaseIds(
          new Set(
            rows
              .filter((row) => row.status === "sent" && row.rfq_case_id)
              .map((row) => row.rfq_case_id as string),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void listWorkspaceSelectedSuppliers()
      .then((rows) => {
        if (active) setSuppliers(new Map(rows.map((row) => [row.rfq_case_id, row])));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  function ownerFor(request: StoredRfq) {
    return nextStepOwner(request.status, unpaidCaseIds.has(request.id));
  }
  const filtered = requests.filter((request) => {
    if (filter === "closed") return request.status === "closed";
    if (filter === "needs_you")
      return request.status !== "closed" && ownerFor(request) === "You";
    if (filter === "in_progress")
      return request.status !== "closed" && ownerFor(request) !== "You";
    return true;
  });
  const counts = {
    all: requests.length,
    needs_you: requests.filter(
      (r) => r.status !== "closed" && ownerFor(r) === "You",
    ).length,
    in_progress: requests.filter(
      (r) => r.status !== "closed" && ownerFor(r) !== "You",
    ).length,
    closed: requests.filter((r) => r.status === "closed").length,
  };
  const selected =
    requests.find((request) => request.id === selectedId) ||
    filtered[0] ||
    requests[0] ||
    null;
  const filterPills: Array<[RequestFilter, string]> = [
    ["all", `All ${counts.all}`],
    ["needs_you", `Needs you ${counts.needs_you}`],
    ["in_progress", `In progress ${counts.in_progress}`],
    ["closed", `Closed ${counts.closed}`],
  ];
  return (
    <Stack spacing={2.25} sx={{ width: "100%", maxWidth: 1180, mx: "auto" }}>
      <Box>
        <Typography
          sx={{
            color: "#71917a",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}
        >
          Workspace
        </Typography>
        <Typography
          variant="h1"
          sx={{ mt: 0.6, color: "#202936", fontSize: { xs: 30, sm: 40 } }}
        >
          Requests
        </Typography>
        <Typography
          sx={{
            mt: 0.75,
            maxWidth: 560,
            color: "#758091",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          Every RFQ you’ve started, with who holds the next step.
        </Typography>
      </Box>
      {requests.length > 0 && (
        <Box
          sx={{
            display: "inline-flex",
            gap: 0.5,
            p: 0.4,
            border: "1px solid #e7ebf0",
            borderRadius: "10px",
            backgroundColor: "#fff",
            alignSelf: "flex-start",
          }}
        >
          {filterPills.map(([key, label]) => (
            <Box
              key={key}
              component="button"
              type="button"
              onClick={() => setFilter(key)}
              sx={{
                px: 1.5,
                py: 0.85,
                border: 0,
                borderRadius: "8px",
                backgroundColor: filter === key ? "#eef4ee" : "transparent",
                color: filter === key ? "#33513c" : "#758091",
                font: "inherit",
                fontSize: 12.5,
                fontWeight: filter === key ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {label}
            </Box>
          ))}
        </Box>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 320px" },
          gap: 2.5,
          alignItems: "start",
        }}
      >
        {filtered.length ? (
          <Box
            sx={{
              border: "1px solid #e7ebf0",
              borderRadius: "12px",
              backgroundColor: "#fff",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                display: { xs: "none", sm: "grid" },
                gridTemplateColumns: "minmax(0,1fr) 180px 100px 90px",
                gap: 1.5,
                px: 2,
                py: 1.4,
                borderBottom: "1px solid #eef0f3",
                backgroundColor: "#fcfcfd",
              }}
            >
              {["Request", "Stage", "Next step owner", "Updated"].map(
                (label) => (
                  <Typography
                    key={label}
                    sx={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      color: "#9ba1aa",
                    }}
                  >
                    {label}
                  </Typography>
                ),
              )}
            </Box>
            {filtered.map((request, index) => {
              const owner = ownerFor(request);
              const active = selected?.id === request.id;
              return (
                <Box
                  key={request.id}
                  component={motion.div}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: 0.18,
                    delay: Math.min(index, 6) * 0.03,
                  }}
                  onClick={() => setSelectedId(request.id)}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "minmax(0,1fr) auto",
                      sm: "minmax(0,1fr) 180px 100px 90px",
                    },
                    gap: 1.5,
                    alignItems: "center",
                    px: 2,
                    py: 1.6,
                    borderBottom: "1px solid #f2f4f6",
                    borderLeft: active
                      ? "2px solid #4b7657"
                      : "2px solid transparent",
                    backgroundColor: active ? "#fbfdfb" : "transparent",
                    cursor: "pointer",
                    "&:last-of-type": { borderBottom: 0 },
                  }}
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={() => onOpen(request)}
                    sx={{
                      display: "block",
                      minWidth: 0,
                      border: 0,
                      p: 0,
                      textAlign: "left",
                      background: "transparent",
                      cursor: "pointer",
                      "&:focus-visible": {
                        outline: "3px solid #4b7657",
                        outlineOffset: 2,
                        borderRadius: 1,
                      },
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "#202936",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {request.title}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.35,
                        color: "#9ba1aa",
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 11,
                      }}
                    >
                      {request.case_no}
                    </Typography>
                    {suppliers.has(request.id) && (
                      <Typography sx={{ mt: 0.35, color: "#4b7657", fontSize: 11.5, fontWeight: 600 }}>
                        Supplier: {suppliers.get(request.id)!.factory_name}
                      </Typography>
                    )}
                  </Box>
                  <Box
                    sx={{
                      display: { xs: "none", sm: "flex" },
                      alignItems: "center",
                      gap: 0.85,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor:
                          stageDotColor[request.status] || "#b6bdc6",
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      sx={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color:
                          request.status === "closed" ? "#758091" : "#4b7657",
                      }}
                    >
                      {stageCopy[request.status] || request.status}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      display: { xs: "none", sm: "block" },
                      fontSize: 12.5,
                      color: "#4a5667",
                    }}
                  >
                    {owner}
                  </Typography>
                  <Typography
                    sx={{
                      display: { xs: "none", sm: "block" },
                      fontSize: 12,
                      color: "#9ba1aa",
                    }}
                  >
                    {new Date(request.updated_at).toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric" },
                    )}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        ) : (
          <RoundedSurface sx={{ p: { xs: 2.5, sm: 4 }, textAlign: "center" }}>
            <Typography sx={{ fontWeight: 700 }}>
              {requests.length
                ? "No requests match this filter"
                : "No requests yet"}
            </Typography>
            <Typography sx={{ mt: 0.75, color: "#758091", fontSize: 13 }}>
              {requests.length
                ? "Try a different filter above."
                : "Start from the dashboard prompt and your RFQ will appear here."}
            </Typography>
          </RoundedSurface>
        )}
        {selected && (
          <Box
            sx={{
              p: 2.25,
              border: "1px solid #e7ebf0",
              borderRadius: "12px",
              backgroundColor: "#fff",
            }}
          >
            <Typography
              sx={{
                color: "#8d98a5",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: ".08em",
                textTransform: "uppercase",
              }}
            >
              Stage timeline
            </Typography>
            <Typography
              sx={{
                mt: 1,
                fontSize: 15,
                fontWeight: 600,
                color: "#202936",
                overflowWrap: "anywhere",
              }}
            >
              {selected.title}
            </Typography>
            <Typography
              sx={{
                mt: 0.3,
                fontFamily: "'DM Mono', monospace",
                fontSize: 11.5,
                color: "#9ba1aa",
              }}
            >
              {selected.case_no}
            </Typography>
            {suppliers.has(selected.id) && (
              <Typography sx={{ mt: 0.3, color: "#4b7657", fontSize: 12, fontWeight: 600 }}>
                Supplier: {suppliers.get(selected.id)!.factory_name}{suppliers.get(selected.id)!.factory_region ? ` · ${suppliers.get(selected.id)!.factory_region}` : ""}
              </Typography>
            )}
            <Box sx={{ mt: 2.5 }}>
              <StageTimeline
                status={selected.status}
                onReviewDraft={() => onOpen(selected)}
              />
            </Box>
          </Box>
        )}
      </Box>
    </Stack>
  );
}

function ProductRow({
  product,
  onView,
  onReorder,
}: {
  product: WorkspaceProduct;
  onView: () => void;
  onReorder?: () => void;
}) {
  const finalized = product.order_status === "completed";
  return (
    <RoundedSurface interactive sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}
          >
            {product.name}
          </Typography>
          <Typography
            sx={{
              mt: 0.35,
              color: "#9ba1aa",
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
            }}
          >
            {product.sku} · {product.supplier}
          </Typography>
        </Box>
        <Box sx={{ display: { xs: "none", sm: "block" }, minWidth: 80 }}>
          <Typography sx={{ color: "#8a94a2", fontSize: 11 }}>
            Unit cost
          </Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
            {invoiceMoney(Math.round(product.unit_price * 100))}
          </Typography>
        </Box>
        <Box sx={{ display: { xs: "none", sm: "block" }, minWidth: 70 }}>
          <Typography sx={{ color: "#8a94a2", fontSize: 11 }}>Units</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
            {product.units}
          </Typography>
        </Box>
        <Chip size="small" label={product.order_status.replaceAll("_", " ")} />
        <MuiButton
          size="small"
          onClick={onView}
          aria-label={`View ${product.name}`}
        >
          View
        </MuiButton>
        {finalized && onReorder && (
          <MuiButton
            size="small"
            variant="contained"
            onClick={onReorder}
            sx={{
              backgroundColor: "#4b7657",
              "&:hover": { backgroundColor: "#3d6548" },
            }}
          >
            Reorder
          </MuiButton>
        )}
      </Stack>
    </RoundedSurface>
  );
}

function LegacyWorkspaceProducts({
  path,
  onOpenRfq,
  onReorder,
}: {
  path: string;
  onOpenRfq: (id: string | null) => void;
  onReorder: (product: WorkspaceProduct) => void;
}) {
  const detailId = path.match(/^\/dashboard\/products\/([^/]+)$/)?.[1] || "";
  const [products, setProducts] = useState<WorkspaceProduct[]>([]);
  const [detail, setDetail] = useState<WorkspaceProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProducts(await listWorkspaceProducts());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load sourced products.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    if (!detailId) {
      setDetail(null);
      return;
    }
    void getWorkspaceProduct(detailId)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load this product.",
          );
      });
    return () => {
      active = false;
    };
  }, [detailId]);
  if (detailId && detail)
    return (
      <Stack spacing={2.25} sx={{ width: "100%", maxWidth: 900, mx: "auto" }}>
        <MuiButton
          variant="text"
          onClick={() => navigate("/dashboard/products")}
          sx={{ alignSelf: "flex-start", px: 0, color: "#697586" }}
        >
          ← Back to products
        </MuiButton>
        <RoundedSurface sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={1.5}>
            <Typography
              sx={{
                color: "#71917a",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".08em",
                textTransform: "uppercase",
              }}
            >
              Sourced product
            </Typography>
            <Typography
              variant="h1"
              sx={{
                color: "#202936",
                fontSize: { xs: 28, sm: 36 },
                overflowWrap: "anywhere",
              }}
            >
              {detail.name}
            </Typography>
            <Typography
              sx={{
                color: "#9ba1aa",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
              }}
            >
              {detail.sku} · {detail.supplier}
            </Typography>
            <Divider />
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
              {[
                [
                  "Unit cost",
                  invoiceMoney(Math.round(detail.unit_price * 100)),
                ],
                ["Units", String(detail.units)],
                ["Order", detail.order_no],
                ["Stage", detail.order_status],
              ].map(([label, value]) => (
                <Box key={label}>
                  <Typography sx={{ color: "#8a94a2", fontSize: 11 }}>
                    {label}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.35,
                      fontSize: 13,
                      fontWeight: 700,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
            {detail.rfq_case_id && (
              <MuiButton
                variant="contained"
                onClick={() => onOpenRfq(detail.rfq_case_id)}
                sx={{ alignSelf: "flex-start" }}
              >
                Open request
              </MuiButton>
            )}
          </Stack>
        </RoundedSurface>
      </Stack>
    );
  const inProgress = products.filter(
    (product) => product.order_status !== "completed",
  );
  const finalized = products.filter(
    (product) => product.order_status === "completed",
  );
  function group(label: string, items: WorkspaceProduct[]) {
    if (!items.length) return null;
    return (
      <Box>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#4a5667" }}>
          {label}{" "}
          <Typography
            component="span"
            sx={{ fontWeight: 500, color: "#9ba1aa" }}
          >
            · {items.length}
          </Typography>
        </Typography>
        <Box
          component="ul"
          aria-label={label}
          sx={{
            mt: 1.25,
            display: "grid",
            gap: 1.25,
            p: 0,
            m: 0,
            listStyle: "none",
          }}
        >
          {items.map((product, index) => (
            <Box component="li" key={product.id}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(index, 5) * 0.04 }}
              >
                <ProductRow
                  product={product}
                  onView={() =>
                    navigate(
                      `/dashboard/products/${encodeURIComponent(product.id)}`,
                    )
                  }
                  onReorder={() => onReorder(product)}
                />
              </motion.div>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }
  return (
    <Stack spacing={2.25} sx={{ width: "100%", maxWidth: 960, mx: "auto" }}>
      <Box>
        <Typography
          sx={{
            color: "#71917a",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}
        >
          Workspace
        </Typography>
        <Typography
          variant="h1"
          sx={{ mt: 0.6, color: "#202936", fontSize: { xs: 30, sm: 40 } }}
        >
          Products
        </Typography>
        <Typography
          sx={{
            mt: 0.75,
            maxWidth: 600,
            color: "#758091",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          Products you’ve sourced through Atelix — not a catalogue to browse.
          Each record stays tied to its RFQ and order history.
        </Typography>
      </Box>
      {error && (
        <Alert
          severity="error"
          action={
            <MuiButton color="inherit" size="small" onClick={() => void load()}>
              Retry
            </MuiButton>
          }
        >
          {error}
        </Alert>
      )}
      {loading ? (
        <InvoiceSkeletonRows />
      ) : products.length ? (
        <Stack spacing={3}>
          {group("In progress", inProgress)}
          {group("Finalized library", finalized)}
        </Stack>
      ) : (
        <RoundedSurface sx={{ p: { xs: 2.5, sm: 4 }, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 700 }}>
            No sourced products yet
          </Typography>
          <Typography sx={{ mt: 0.75, color: "#758091", fontSize: 13 }}>
            Products appear here after an Atelix order creates an immutable line
            snapshot.
          </Typography>
        </RoundedSurface>
      )}
    </Stack>
  );
}

function productStageLabel(status: string) {
  const labels: Record<string, string> = {
    awaiting_payment: "Payment due",
    payment_declared: "Payment review",
    payment_verified: "Payment verified",
    fulfilling: "In production",
    completed: "Finalized",
    cancelled: "Cancelled",
    disputed: "Payment disputed",
    refunded: "Refunded",
  };
  return labels[status] || status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function productStageDescription(status: string, invoiceNo?: string | null) {
  if (status === "awaiting_payment") {
    return invoiceNo
      ? `Your confirmed order is waiting for ${invoiceNo} to be paid before production begins.`
      : "Your confirmed order is waiting for invoice payment before production begins.";
  }
  if (status === "fulfilling") return "Production is underway against this saved order.";
  if (status === "completed") return "This sourced product is in your finalized library.";
  if (status === "cancelled") return "This order is cancelled and remains available as a read-only record.";
  return "Atelix is coordinating this order against the saved RFQ and supplier record.";
}

function productStageTone(status: string) {
  if (status === "completed") return "success";
  if (["cancelled", "disputed", "refunded"].includes(status)) return "error";
  return "attention";
}

function ProductTable({
  title,
  products,
  finalized,
  onView,
  onReorder,
}: {
  title: string;
  products: WorkspaceProduct[];
  finalized: boolean;
  onView: (product: WorkspaceProduct) => void;
  onReorder: (product: WorkspaceProduct) => void;
}) {
  if (!products.length) return null;
  const tableId = `product-table-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className="product-stage-section" aria-labelledby={tableId}>
      <h2 className="product-stage-heading" id={tableId}>
        {title} <span>· {products.length}</span>
      </h2>
      <div className="product-table" role="table" aria-label={`${title} products`}>
        <div className="product-table-header" role="row">
          <span role="columnheader">Product</span>
          <span role="columnheader">Supplier</span>
          <span role="columnheader">Unit cost</span>
          <span role="columnheader">Units to date</span>
          <span role="columnheader">{finalized ? "Last ordered" : "Stage"}</span>
          <span role="columnheader" aria-label="Actions" />
        </div>
        {products.map((product) => (
          <div className="product-table-row" role="row" key={product.id}>
            <div className="product-table-cell product-table-product" role="cell" data-label="Product">
              <strong>{product.name}</strong>
              <small>{product.sku}</small>
            </div>
            <div className="product-table-cell" role="cell" data-label="Supplier">{product.supplier || "Not yet assigned"}</div>
            <div className="product-table-cell" role="cell" data-label="Unit cost">{invoiceMoney(Math.round(product.unit_price * 100))}</div>
            <div className="product-table-cell" role="cell" data-label="Units to date">{product.units.toLocaleString()} units</div>
            <div className="product-table-cell" role="cell" data-label={finalized ? "Last ordered" : "Stage"}>
              {finalized ? (
                product.placed_at ? new Date(product.placed_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"
              ) : (
                <span className={`product-stage-status product-stage-status--${productStageTone(product.order_status)}`}>
                  <i aria-hidden="true" /> {productStageLabel(product.order_status)}
                </span>
              )}
            </div>
            <div className="product-table-actions" role="cell" data-label="Actions">
              <MuiButton className="product-outline-button" size="small" variant="outlined" onClick={() => onView(product)} aria-label={`View ${product.name}`}>
                View
              </MuiButton>
              {finalized && (
                <MuiButton className="product-primary-button" size="small" variant="contained" onClick={() => onReorder(product)}>
                  Reorder
                </MuiButton>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductDetail({
  product,
  onBack,
  onOpenRfq,
  onReorder,
}: {
  product: WorkspaceProduct;
  onBack: () => void;
  onOpenRfq: (id: string | null) => void;
  onReorder: () => void;
}) {
  const finalized = product.order_status === "completed";
  const [production, setProduction] = useState<WorkspaceRfqProduction | null>(null);
  useEffect(() => {
    let active = true;
    if (!product.rfq_case_id) return () => { active = false; };
    void getWorkspaceRfqProduction(product.rfq_case_id)
      .then((next) => { if (active) setProduction(next); })
      .catch(() => { if (active) setProduction(null); });
    return () => { active = false; };
  }, [product.rfq_case_id]);
  const invoice = production?.invoice;
  const invoicePending = Boolean(invoice && ["sent", "overdue"].includes(invoice.effective_status));
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  async function payInvoice() {
    if (!invoice?.id || payBusy) return;
    setPayBusy(true);
    setPayError("");
    try {
      const checkout = await startWorkspaceInvoiceCheckout([invoice.id]);
      window.location.assign(checkout.url);
    } catch (cause) {
      setPayError(cause instanceof Error ? cause.message : "Could not start payment.");
      setPayBusy(false);
    }
  }
  return (
    <div className="product-detail-page">
      <div className="product-detail-toolbar">
        <MuiButton className="product-back-button" variant="text" onClick={onBack} startIcon={<ArrowBack />}>Back to products</MuiButton>
      </div>
      <div className="product-detail-layout">
        <section className="product-detail-content" aria-labelledby="product-detail-title">
          <div className="product-detail-heading">
            <div>
              <Typography className="product-eyebrow">Product</Typography>
              <Typography id="product-detail-title" component="h1" className="product-detail-title">{product.name}</Typography>
              <Typography className="product-detail-meta">{product.sku} · {product.supplier || "Not yet assigned"}</Typography>
            </div>
            <span className={`product-detail-badge product-detail-badge--${productStageTone(product.order_status)}`}>{productStageLabel(product.order_status)}</span>
          </div>
          <section className="product-specification" aria-labelledby="product-specification-title">
            <h2 id="product-specification-title">Specification</h2>
            <dl>
              {[
                ["Supplier", product.supplier || "Not yet assigned"],
                ["Unit cost", invoiceMoney(Math.round(product.unit_price * 100))],
                ["Units ordered", `${product.units.toLocaleString()} units`],
                ["Order", product.order_no],
                ["RFQ", product.rfq_case_id || "Not linked"],
              ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </section>
          <section className="product-history" aria-labelledby="product-history-title">
            <h2 id="product-history-title">Order history for this product</h2>
            <div className="product-history-table" role="table" aria-label="Order history">
              <div className="product-history-header" role="row"><span role="columnheader">RFQ</span><span role="columnheader">Units</span><span role="columnheader">Status</span></div>
              <div className="product-history-row" role="row"><span role="cell">{product.rfq_case_id ? `${product.rfq_case_id} · first order` : `${product.order_no} · first order`}</span><span role="cell">{product.units.toLocaleString()} units</span><span role="cell" className={`product-history-status product-history-status--${productStageTone(product.order_status)}`}>{productStageLabel(product.order_status)}</span></div>
            </div>
            <p className="product-history-note">No earlier orders are recorded for this saved product.</p>
          </section>
        </section>
        <aside className="product-stage-rail" aria-labelledby="product-current-stage-title">
          <Typography id="product-current-stage-title" className="product-rail-eyebrow">Current stage</Typography>
          <div className={`product-stage-callout product-stage-callout--${productStageTone(product.order_status)}`}>
            <strong>{product.order_status === "awaiting_payment" ? "Invoice payment due" : productStageLabel(product.order_status)}</strong>
            <p>{productStageDescription(product.order_status, invoice?.invoice_no)}</p>
          </div>
          {invoicePending ? (
            <>
              <MuiButton
                className="product-primary-button product-stage-action"
                fullWidth
                variant="contained"
                disabled={payBusy}
                onClick={() => void payInvoice()}
                startIcon={payBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {payBusy ? "Opening payment…" : "Pay invoice"}
              </MuiButton>
              {payError && <Alert severity="error" sx={{ mt: 1.25 }}>{payError}</Alert>}
            </>
          ) : (
            product.rfq_case_id && <MuiButton className="product-primary-button product-stage-action" fullWidth variant="contained" onClick={() => onOpenRfq(product.rfq_case_id)}>Open linked request</MuiButton>
          )}
          <div className="product-rail-divider" />
          <Typography className="product-rail-eyebrow">Also from here</Typography>
          <MuiButton className="product-outline-button product-reorder-button" fullWidth variant="outlined" onClick={onReorder} disabled={!finalized}>Reorder this spec</MuiButton>
          <p className="product-reorder-note">Starts a fresh RFQ pre-filled from this spec — available once the first order is complete.</p>
        </aside>
      </div>
    </div>
  );
}

function WorkspaceProducts({
  path,
  onOpenRfq,
  onReorder,
}: {
  path: string;
  onOpenRfq: (id: string | null) => void;
  onReorder: (product: WorkspaceProduct) => void;
}) {
  const detailId = path.match(/^\/dashboard\/products\/([^/]+)$/)?.[1] || "";
  const [products, setProducts] = useState<WorkspaceProduct[]>([]);
  const [detail, setDetail] = useState<WorkspaceProduct | null>(null);
  const [detailLoading, setDetailLoading] = useState(Boolean(detailId));
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("all");
  const [status, setStatus] = useState<"all" | "in_progress" | "finalized">("all");
  const [sort, setSort] = useState<"last_ordered" | "name">("last_ordered");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setProducts(await listWorkspaceProducts()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load sourced products."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!detailId) { setDetail(null); setDetailLoading(false); return; }
    let active = true;
    setDetail(null);
    setDetailLoading(true);
    void getWorkspaceProduct(decodeURIComponent(detailId)).then((next) => {
      if (!active) return;
      setDetail(next);
      setDetailLoading(false);
      if (!next) setError("Could not load this product.");
    }).catch((cause) => {
      if (!active) return;
      setDetailLoading(false);
      setError(cause instanceof Error ? cause.message : "Could not load this product.");
    });
    return () => { active = false; };
  }, [detailId]);
  if (detailId && detail) return <ProductDetail product={detail} onBack={() => navigate("/dashboard/products")} onOpenRfq={onOpenRfq} onReorder={() => onReorder(detail)} />;
  if (detailId && detailLoading) return <div className="product-detail-loading" aria-live="polite"><Skeleton variant="text" width={180} height={22} /><Skeleton variant="text" width="62%" height={54} /><Skeleton variant="rounded" height={320} /></div>;
  if (detailId && error) return <Alert severity="error" action={<MuiButton color="inherit" size="small" onClick={() => window.location.reload()}>Retry</MuiButton>}>{error}</Alert>;
  const suppliers = Array.from(new Set(products.map((product) => product.supplier))).sort();
  const filtered = products.filter((product) => {
    const haystack = `${product.name} ${product.supplier} ${product.sku} ${product.rfq_case_id || ""}`.toLowerCase();
    const matchesStatus = status === "all" || (status === "finalized" ? product.order_status === "completed" : product.order_status !== "completed");
    return matchesStatus && (supplier === "all" || product.supplier === supplier) && haystack.includes(query.toLowerCase());
  }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : (b.placed_at || "").localeCompare(a.placed_at || ""));
  const inProgress = filtered.filter((product) => product.order_status !== "completed");
  const finalized = filtered.filter((product) => product.order_status === "completed");
  return (
    <div className="product-workspace-page">
      <header className="product-workspace-heading">
        <Typography className="product-eyebrow">Workspace</Typography>
        <Typography component="h1" className="product-workspace-title">Products</Typography>
        <Typography className="product-workspace-description">Products you’ve sourced through Atelix — not a catalogue to browse. Each one is tied to its own RFQ history.</Typography>
      </header>
      {error && <Alert severity="error" action={<MuiButton color="inherit" size="small" onClick={() => void load()}>Retry</MuiButton>}>{error}</Alert>}
      <div className="product-filters" aria-label="Product filters">
        <label className="product-search-field">
          <Search aria-hidden="true" />
          <span className="sr-only">Search products</span>
          <input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search by product, supplier or RFQ" />
        </label>
        <div className="product-status-tabs" role="tablist" aria-label="Filter products by status">
          {([["all", `All ${products.length}`], ["in_progress", `In progress ${products.filter((product) => product.order_status !== "completed").length}`], ["finalized", `Finalized ${products.filter((product) => product.order_status === "completed").length}`]] as const).map(([value, label]) => <MuiButton key={value} className={status === value ? "is-selected" : ""} size="small" role="tab" aria-selected={status === value} onClick={() => setStatus(value)}>{label}</MuiButton>)}
        </div>
        <label className="product-select-field">
          <FilterList aria-hidden="true" />
          <span className="sr-only">Filter by supplier</span>
          <select value={supplier} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSupplier(event.target.value)}>
            <option value="all">Supplier</option>
            {suppliers.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <KeyboardArrowDown aria-hidden="true" />
        </label>
        <label className="product-select-field product-sort-field">
          <Sort aria-hidden="true" />
          <span className="sr-only">Sort products</span>
          <select value={sort} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSort(event.target.value as "last_ordered" | "name")}>
            <option value="last_ordered">Sort: Last ordered</option>
            <option value="name">Sort: Product name</option>
          </select>
          <KeyboardArrowDown aria-hidden="true" />
        </label>
      </div>
      {loading ? <InvoiceSkeletonRows /> : filtered.length ? <div className="product-stage-list"><ProductTable title="In progress" products={inProgress} finalized={false} onView={(product) => navigate(`/dashboard/products/${encodeURIComponent(product.id)}`)} onReorder={onReorder} /><ProductTable title="Finalized library" products={finalized} finalized onView={(product) => navigate(`/dashboard/products/${encodeURIComponent(product.id)}`)} onReorder={onReorder} /></div> : <div className="product-empty-state"><Typography component="h2">{products.length ? "No products match these filters" : "No sourced products yet"}</Typography><Typography>{products.length ? "Try a different search or filter." : "Products appear here after an Atelix order creates an immutable line snapshot."}</Typography></div>}
      {!loading && Boolean(products.length) && <p className="product-workspace-note"><LockOutlined aria-hidden="true" /> Reorder opens a new RFQ from this product’s saved spec — nothing is sent to a supplier until you approve it.</p>}
    </div>
  );
}

function PlaceholderView({
  view,
}: {
  view: Exclude<
    DashboardView,
    "dashboard" | "new" | "requests" | "products" | "invoices"
  >;
}) {
  const content = {
    products: [
      "Products",
      "Your sourced products will appear here once a product request is ready.",
    ],
    favourites: [
      "Favourites",
      "Save product references here when you find something worth returning to.",
    ],
    messages: [
      "Messages",
      "Messages with your sourcing team will appear here when a request is in progress.",
    ],
    settings: [
      "Settings",
      "Manage your profile and workspace preferences here. Settings are local to this demo workspace.",
    ],
    library: [
      "Library",
      "Keep reference files, supplier notes, and sourcing materials close to your RFQ history.",
    ],
  }[view];
  const isLibrary = view === "library";
  return (
    <Box sx={{ minHeight: 520, width: "100%", maxWidth: 900, mx: "auto" }}>
      <Box sx={{ mb: 4 }}>
        <Typography
          sx={{
            color: "#8d949e",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: ".04em",
          }}
        >
          {isLibrary ? "Your workspace" : "Account"}
        </Typography>
        <Typography
          variant="h1"
          sx={{
            mt: 0.75,
            color: "#20242b",
            fontSize: { xs: 32, sm: 42 },
            fontWeight: 500,
          }}
        >
          {content[0]}
        </Typography>
        <Typography
          sx={{
            maxWidth: 540,
            mt: 1,
            color: "#747b86",
            fontSize: 15,
            lineHeight: 1.6,
          }}
        >
          {content[1]}
        </Typography>
      </Box>
      {isLibrary ? (
        <Box sx={{ display: "grid", gap: 1.25 }}>
          <RoundedSurface
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              p: 2.25,
              border: "1px solid #ececef",
              borderRadius: "14px",
              backgroundColor: "#fff",
            }}
          >
            <FolderOpen sx={{ color: "#6fae86" }} />
            <Box>
              <Typography
                sx={{ color: "#292e36", fontSize: 14, fontWeight: 700 }}
              >
                Reference library
              </Typography>
              <Typography sx={{ mt: 0.35, color: "#858c96", fontSize: 12 }}>
                Files attached to saved RFQs will be organized here.
              </Typography>
            </Box>
          </RoundedSurface>
          <RoundedSurface
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              p: 2.25,
              border: "1px solid #ececef",
              borderRadius: "14px",
              backgroundColor: "#fff",
            }}
          >
            <Search sx={{ color: "#8b929c" }} />
            <Box>
              <Typography
                sx={{ color: "#292e36", fontSize: 14, fontWeight: 700 }}
              >
                Search your sourcing materials
              </Typography>
              <Typography sx={{ mt: 0.35, color: "#858c96", fontSize: 12 }}>
                Search becomes available as your workspace fills with
                references.
              </Typography>
            </Box>
          </RoundedSurface>
        </Box>
      ) : (
        <RoundedSurface
          sx={{
            maxWidth: 640,
            p: { xs: 2.5, sm: 3 },
            border: "1px solid #ececef",
            borderRadius: "14px",
            backgroundColor: "#fff",
          }}
        >
          <Stack spacing={1.75}>
            <Box>
              <Typography
                sx={{ color: "#2b3038", fontSize: 14, fontWeight: 700 }}
              >
                Profile
              </Typography>
              <Typography sx={{ mt: 0.45, color: "#818894", fontSize: 13 }}>
                Atelix Review · Brand owner
              </Typography>
            </Box>
            <Divider sx={{ borderColor: "#f0f0f2" }} />
            <Box>
              <Typography
                sx={{ color: "#2b3038", fontSize: 14, fontWeight: 700 }}
              >
                Workspace appearance
              </Typography>
              <Typography sx={{ mt: 0.45, color: "#818894", fontSize: 13 }}>
                Light mode is active for this sourcing workspace.
              </Typography>
            </Box>
          </Stack>
        </RoundedSurface>
      )}
    </Box>
  );
}

function DashboardHome({
  isNew,
  onStart,
  onMessage,
}: {
  isNew: boolean;
  onStart: (brief: string, files: UploadFile[]) => void;
  onMessage: (message: string) => void;
}) {
  return (
    <Stack
      spacing={2.5}
      sx={{
        minWidth: 0,
        width: "100%",
        maxWidth: 820,
        minHeight: { xs: "calc(100vh - 150px)", md: "calc(100vh - 120px)" },
        rowGap: { xs: 2.25, md: 2.5 },
        mx: "auto",
        justifyContent: "center",
        borderRadius: 6,
        background:
          "radial-gradient(circle at 50% 48%, rgba(190,219,249,.72), rgba(251,251,252,0) 58%)",
      }}
    >
      <Box
        sx={{
          minWidth: 0,
          width: "100%",
          maxWidth: 640,
          mx: "auto",
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        <Typography
          variant="h1"
          sx={{
            display: "block",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            m: 0,
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            fontFamily: "inherit",
            fontSize: { xs: 32, sm: 40, md: 44 },
            lineHeight: 1.08,
            color: "#202936",
          }}
        >
          {isNew ? "What product can we source?" : "Ready when you are"}
        </Typography>
        <Typography
          sx={{
            display: "block",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            mt: 1.25,
            color: "#7c8795",
            fontSize: { xs: 14, sm: 15 },
            lineHeight: 1.5,
          }}
        >
          Our AI sourcing expert will help you find the best apparel
          manufacturers
        </Typography>
      </Box>
      <Box sx={{ width: "100%", maxWidth: 660, mx: "auto" }}>
        <CleanPromptComposer onStart={onStart} onMessage={onMessage} />
      </Box>
    </Stack>
  );
}

function invoiceMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
function invoiceDate(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.valueOf())
    ? "No due date"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function requestDetailIdFromPath(path: string) {
  const match = path.match(/^\/dashboard\/requests\/([^/]+)$/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

function invoiceStatusLabel(invoice: WorkspaceInvoice) {
  if (invoice.effective_status === "overdue") return "Overdue";
  if (invoice.status === "sent") return "Due";
  return invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
}
function invoiceStatusColor(
  invoice: WorkspaceInvoice,
): "success" | "warning" | "error" | "default" {
  if (invoice.effective_status === "overdue") return "error";
  if (invoice.status === "sent") return "warning";
  if (invoice.status === "paid") return "success";
  return "default";
}
type PaymentReturnState = "success" | "cancelled" | "pending" | "failed";
function paymentReturnState(): PaymentReturnState | null {
  const params = new URLSearchParams(window.location.search);
  const value =
    params.get("stripe_return") ||
    params.get("payment") ||
    params.get("checkout");
  return value === "success" ||
    value === "cancelled" ||
    value === "pending" ||
    value === "failed"
    ? value
    : null;
}
function paymentReturnSeverity(
  kind: PaymentReturnState | null,
): "success" | "info" | "warning" {
  return kind === "success"
    ? "success"
    : kind === "cancelled"
      ? "info"
      : "warning";
}
function InvoiceSkeletonRows() {
  return (
    <Box aria-label="Loading invoices" role="status">
      <Stack spacing={1.25}>
        {[1, 2, 3].map((row) => (
          <RoundedSurface key={row} sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Skeleton variant="circular" width={24} height={24} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Skeleton width="42%" />
                <Skeleton width="68%" />
              </Box>
              <Skeleton width={82} />
            </Stack>
          </RoundedSurface>
        ))}
      </Stack>
    </Box>
  );
}

function RfqSkeleton({ detail = false }: { detail?: boolean }) {
  return (
    <Box aria-busy="true" aria-label="RFQ pending" sx={{ width: "100%" }}>
      <Stack spacing={1.25} aria-hidden="true">
        <Skeleton variant="text" width={detail ? "34%" : "26%"} height={44} />
        <Skeleton variant="text" width={detail ? "58%" : "42%"} />
        {[1, 2, 3, 4].map((row) => (
          <Skeleton key={row} variant="rounded" height={detail ? 92 : 72} />
        ))}
      </Stack>
    </Box>
  );
}
function WorkspaceInvoices({ path }: { path: string }) {
  const detailId = path.match(/^\/dashboard\/invoices\/([^/]+)$/)?.[1] || "";
  const [invoices, setInvoices] = useState<WorkspaceInvoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [detail, setDetail] = useState<WorkspaceInvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [returnMessage, setReturnMessage] = useState("");
  const [returnKind, setReturnKind] = useState<PaymentReturnState | null>(null);
  const returnState = paymentReturnState();

  const loadInvoices = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const rows = await listWorkspaceInvoices();
      setInvoices(rows);
      setSelectedIds(
        (current) =>
          new Set(
            [...current].filter((id) =>
              rows.some((row) => row.id === id && row.status === "sent"),
            ),
          ),
      );
    } catch (cause) {
      setListError(
        cause instanceof Error
          ? cause.message
          : "Could not load your invoices.",
      );
    } finally {
      setListLoading(false);
    }
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      setDetailError("");
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    try {
      setDetail(await getWorkspaceInvoiceDetail(id));
    } catch (cause) {
      setDetailError(
        cause instanceof Error ? cause.message : "Could not load this invoice.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);
  useEffect(() => {
    void loadDetail(detailId);
  }, [detailId, loadDetail]);
  useEffect(() => {
    if (!returnState) return;
    const labels: Record<string, string> = {
      success:
        "Payment returned successfully. We’re checking the latest invoice status.",
      cancelled: "Payment was cancelled. Your invoices were not changed.",
      pending:
        "Payment is still processing. Invoice status will update after confirmation.",
      failed: "Payment could not be completed. Your invoices were not changed.",
    };
    setReturnMessage(labels[returnState]);
    setReturnKind(returnState);
    void (async () => {
      await loadInvoices();
      if (detailId) await loadDetail(detailId);
      const url = new URL(window.location.href);
      ["stripe_return", "payment", "checkout"].forEach((key) =>
        url.searchParams.delete(key),
      );
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    })();
  }, [detailId, loadDetail, loadInvoices, returnState]);

  const selectable = invoices.filter((invoice) => invoice.status === "sent");
  const selectedInvoices = selectable.filter((invoice) =>
    selectedIds.has(invoice.id),
  );
  const selectedTotal = selectedInvoices.reduce(
    (sum, invoice) => sum + invoice.balance_cents,
    0,
  );
  const allSelected =
    selectable.length > 0 &&
    selectable.every((invoice) => selectedIds.has(invoice.id));
  function toggleInvoice(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelectedIds(
      allSelected
        ? new Set()
        : new Set(selectable.map((invoice) => invoice.id)),
    );
  }
  async function pay(invoiceIds: string[]) {
    if (checkoutBusy || !invoiceIds.length) return;
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      const checkout = await startWorkspaceInvoiceCheckout(invoiceIds);
      await loadInvoices();
      if (detailId) await loadDetail(detailId);
      window.location.assign(checkout.url);
    } catch (cause) {
      setCheckoutError(
        cause instanceof Error ? cause.message : "Could not start payment.",
      );
      await loadInvoices();
      if (detailId) await loadDetail(detailId);
    } finally {
      setCheckoutBusy(false);
    }
  }
  const listErrorSurface = listError ? (
    <Alert
      severity="error"
      action={
        <MuiButton
          color="inherit"
          size="small"
          onClick={() => void loadInvoices()}
        >
          Retry
        </MuiButton>
      }
    >
      {listError}
    </Alert>
  ) : null;
  if (detailId) {
    return (
      <Stack spacing={2.25} sx={{ width: "100%", maxWidth: 900, mx: "auto" }}>
        <MuiButton
          variant="text"
          onClick={() => navigate("/dashboard/invoices")}
          sx={{ alignSelf: "flex-start", px: 0, color: "#697586" }}
        >
          ← Back to invoices
        </MuiButton>
        {returnMessage && (
          <Alert
            severity={paymentReturnSeverity(returnKind)}
            onClose={() => {
              setReturnMessage("");
              setReturnKind(null);
            }}
            role="status"
          >
            {returnMessage}
          </Alert>
        )}
        {checkoutError && (
          <Alert
            severity="error"
            onClose={() => setCheckoutError("")}
            role="alert"
          >
            {checkoutError}
          </Alert>
        )}
        {detailLoading && (
          <RoundedSurface sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={1.5}>
              <Skeleton width="35%" height={34} />
              <Skeleton width="58%" />
              <Skeleton width="100%" height={80} />
            </Stack>
          </RoundedSurface>
        )}
        {detailError && (
          <Alert
            severity="error"
            action={
              <MuiButton
                color="inherit"
                size="small"
                onClick={() => void loadDetail(detailId)}
              >
                Retry
              </MuiButton>
            }
          >
            {detailError}
          </Alert>
        )}
        {detail && (
          <Stack spacing={1.5}>
            <RoundedSurface sx={{ p: { xs: 2, sm: 3 } }}>
              <Stack spacing={1.5}>
                <Stack
                  direction="row"
                  alignItems="flex-start"
                  sx={{
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 1.25,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="h1"
                      sx={{
                        color: "#202936",
                        fontSize: { xs: 27, sm: 34 },
                        overflowWrap: "anywhere",
                      }}
                    >
                      {detail.invoice_no}
                    </Typography>
                    <Typography
                      sx={{ mt: 0.5, color: "#758091", fontSize: 13 }}
                    >
                      Due {invoiceDate(detail.due_date)}
                    </Typography>
                  </Box>
                  <Chip
                    label={invoiceStatusLabel(detail)}
                    color={invoiceStatusColor(detail)}
                    size="small"
                  />
                </Stack>
                <Divider />
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "repeat(2,minmax(0,1fr))",
                      sm: "repeat(3,minmax(0,1fr))",
                    },
                    gap: 1.5,
                  }}
                >
                  <Box>
                    <Typography sx={{ color: "#8a94a2", fontSize: 11 }}>
                      Total
                    </Typography>
                    <Typography sx={{ mt: 0.3, fontWeight: 700 }}>
                      {invoiceMoney(detail.total_cents)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ color: "#8a94a2", fontSize: 11 }}>
                      Balance
                    </Typography>
                    <Typography sx={{ mt: 0.3, fontWeight: 700 }}>
                      {invoiceMoney(detail.balance_cents)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ color: "#8a94a2", fontSize: 11 }}>
                      Currency
                    </Typography>
                    <Typography sx={{ mt: 0.3, fontWeight: 700 }}>
                      USD
                    </Typography>
                  </Box>
                </Box>
                <MuiButton
                  variant="contained"
                  disabled={detail.status !== "sent" || checkoutBusy}
                  onClick={() => void pay([detail.id])}
                  startIcon={
                    checkoutBusy ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : undefined
                  }
                  sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
                >
                  {checkoutBusy
                    ? "Opening payment…"
                    : detail.status === "sent"
                      ? "Pay invoice"
                      : detail.status === "paid"
                        ? "Paid"
                        : "Payment unavailable"}
                </MuiButton>
              </Stack>
            </RoundedSurface>
            <RoundedSurface sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography sx={{ mb: 1.25, fontWeight: 700 }}>
                Line items
              </Typography>
              {detail.items.length ? (
                <Stack spacing={1}>
                  {detail.items.map((item, index) => (
                    <Box
                      key={item.id || `${item.description}-${index}`}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,1fr) auto",
                        gap: 1,
                        minWidth: 0,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          sx={{ fontSize: 13, overflowWrap: "anywhere" }}
                        >
                          {item.description}
                        </Typography>
                        <Typography sx={{ color: "#8a94a2", fontSize: 11 }}>
                          {item.quantity} ×{" "}
                          {invoiceMoney(item.unit_amount_cents)}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                        {invoiceMoney(item.line_total_cents)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography sx={{ color: "#758091", fontSize: 13 }}>
                  No line items were returned.
                </Typography>
              )}
            </RoundedSurface>
            <RoundedSurface sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography sx={{ mb: 1.25, fontWeight: 700 }}>
                Payment history
              </Typography>
              {detail.payments.length ? (
                <Stack spacing={1}>
                  {detail.payments.map((payment, index) => (
                    <Box
                      key={payment.id || `${payment.provider}-${index}`}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,1fr) auto",
                        gap: 1,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13 }}>
                          {payment.provider}
                        </Typography>
                        <Typography
                          sx={{
                            color: "#8a94a2",
                            fontSize: 11,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {payment.reference || "Payment recorded"}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                        {invoiceMoney(payment.amount_cents)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography sx={{ color: "#758091", fontSize: 13 }}>
                  No payments recorded yet.
                </Typography>
              )}
            </RoundedSurface>
            {detail.notes && (
              <RoundedSurface sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography sx={{ mb: 0.75, fontWeight: 700 }}>
                  Notes
                </Typography>
                <Typography
                  sx={{
                    color: "#758091",
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {detail.notes}
                </Typography>
              </RoundedSurface>
            )}
          </Stack>
        )}
      </Stack>
    );
  }
  return (
    <Stack spacing={2.25} sx={{ width: "100%", maxWidth: 900, mx: "auto" }}>
      <Box>
        <Typography
          sx={{
            color: "#71917a",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}
        >
          Workspace
        </Typography>
        <Typography
          variant="h1"
          sx={{ mt: 0.6, color: "#202936", fontSize: { xs: 30, sm: 40 } }}
        >
          Invoices
        </Typography>
        <Typography
          sx={{
            mt: 0.75,
            maxWidth: 600,
            color: "#758091",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          Review invoices from your Atelix workspace and pay sent balances
          securely.
        </Typography>
      </Box>
      {returnMessage && (
        <Alert
          severity={paymentReturnSeverity(returnKind)}
          onClose={() => {
            setReturnMessage("");
            setReturnKind(null);
          }}
          role="status"
        >
          {returnMessage}
        </Alert>
      )}
      {checkoutError && (
        <Alert
          severity="error"
          onClose={() => setCheckoutError("")}
          role="alert"
        >
          {checkoutError}
        </Alert>
      )}
      {listErrorSurface}
      {listLoading ? (
        <InvoiceSkeletonRows />
      ) : !listError && !invoices.length ? (
        <RoundedSurface sx={{ p: { xs: 2.5, sm: 4 }, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 700 }}>No invoices yet</Typography>
          <Typography sx={{ mt: 0.75, color: "#758091", fontSize: 13 }}>
            Invoices from your Atelix workspace will appear here when they are
            ready.
          </Typography>
        </RoundedSurface>
      ) : (
        !listError && (
          <>
            <RoundedSurface sx={{ p: { xs: 1.25, sm: 1.5 } }}>
              <Stack
                direction="row"
                alignItems="center"
                sx={{
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Box
                  component="label"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    minWidth: 0,
                    cursor: selectable.length ? "pointer" : "default",
                  }}
                >
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selectedIds.size > 0 && !allSelected}
                    disabled={!selectable.length || checkoutBusy}
                    onChange={toggleAll}
                    slotProps={{
                      input: { "aria-label": "Select all sent invoices" },
                    }}
                  />
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                    Select sent invoices
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    minWidth: 0,
                  }}
                >
                  <Typography sx={{ color: "#758091", fontSize: 12 }}>
                    Selected balance
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                    {invoiceMoney(selectedTotal)}
                  </Typography>
                  <MuiButton
                    size="small"
                    variant="contained"
                    disabled={!selectedIds.size || checkoutBusy}
                    onClick={() => void pay([...selectedIds])}
                    startIcon={
                      checkoutBusy ? (
                        <CircularProgress size={15} color="inherit" />
                      ) : undefined
                    }
                  >
                    {checkoutBusy ? "Opening…" : "Pay selected"}
                  </MuiButton>
                </Box>
              </Stack>
            </RoundedSurface>
            <Box
              component="ul"
              aria-label="Invoices"
              sx={{ display: "grid", gap: 1.25, p: 0, m: 0, listStyle: "none" }}
            >
              {invoices.map((invoice) => {
                const selectableRow = invoice.status === "sent";
                const overdue = invoice.effective_status === "overdue";
                const rowStyle = overdue
                  ? { borderColor: "#e7d8ca", backgroundColor: "#fdf8f2" }
                  : selectableRow
                    ? { borderColor: "#cfe2d4", backgroundColor: "#f7fbf7" }
                    : {
                        borderColor: "rgba(214,220,229,.85)",
                        backgroundColor: "#fff",
                      };
                return (
                  <Box component="li" key={invoice.id}>
                    <RoundedSurface
                      sx={{ p: { xs: 1.25, sm: 1.75 }, ...rowStyle }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center", minWidth: 0 }}
                      >
                        <Checkbox
                          checked={selectedIds.has(invoice.id)}
                          disabled={!selectableRow || checkoutBusy}
                          onChange={() => toggleInvoice(invoice.id)}
                          slotProps={{
                            input: {
                              "aria-label": `${selectableRow ? "Select" : "Invoice unavailable for payment"} ${invoice.invoice_no}`,
                            },
                          }}
                          sx={{ flex: "0 0 auto" }}
                        />
                        <Box
                          sx={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                          onClick={() =>
                            navigate(
                              `/dashboard/invoices/${encodeURIComponent(invoice.id)}`,
                            )
                          }
                        >
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: "center" }}
                          >
                            <Typography
                              sx={{
                                fontSize: 14,
                                fontWeight: 700,
                                overflowWrap: "anywhere",
                              }}
                            >
                              {invoice.invoice_no}
                            </Typography>
                            <Chip
                              label={invoiceStatusLabel(invoice)}
                              color={invoiceStatusColor(invoice)}
                              size="small"
                            />
                          </Stack>
                          <Typography
                            sx={{ mt: 0.3, color: "#758091", fontSize: 12 }}
                          >
                            Due {invoiceDate(invoice.due_date)} · Balance{" "}
                            {invoiceMoney(invoice.balance_cents)}
                          </Typography>
                        </Box>
                        {selectableRow || overdue ? (
                          <MuiButton
                            size="small"
                            variant="contained"
                            sx={{
                              flex: "0 0 auto",
                              backgroundColor: "#4b7657",
                              "&:hover": { backgroundColor: "#3d6548" },
                            }}
                            onClick={() =>
                              navigate(
                                `/dashboard/invoices/${encodeURIComponent(invoice.id)}`,
                              )
                            }
                          >
                            Pay now
                          </MuiButton>
                        ) : (
                          <MuiButton
                            size="small"
                            sx={{ flex: "0 0 auto" }}
                            onClick={() =>
                              navigate(
                                `/dashboard/invoices/${encodeURIComponent(invoice.id)}`,
                              )
                            }
                            aria-label={`View ${invoice.invoice_no}`}
                          >
                            View
                          </MuiButton>
                        )}
                      </Stack>
                    </RoundedSurface>
                  </Box>
                );
              })}
            </Box>
          </>
        )
      )}
    </Stack>
  );
}

export function Dashboard({ path }: { path: string }) {
  const mobile = useMediaQuery(dashboardTheme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<UserProfile>({
    username: "",
    name: "Workspace",
    role: "Buyer",
  });
  const [rfq, setRfq] = useState<{
    record: WorkspaceRfq;
    attachments: RfqAttachment[];
    initialPhase?: RfqPhase;
  } | null>(null);
  const [historyItems, setHistoryItems] = useState<StoredRfq[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [rfqLoading, setRfqLoading] = useState(false);
  useEffect(() => {
    let active = true;
    void getSession()
      .then((session) => {
        if (!active) return;
        const user = session?.user;
        const name = String(
          user?.user_metadata?.full_name || user?.email || "Workspace",
        );
        setProfile({ username: user?.email || "", name, role: "Buyer" });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void listRfqCases()
      .then((cases) => {
        if (!active) return;
        setHistoryItems(cases);
      })
      .catch((cause) => {
        if (active)
          setMessage(
            cause instanceof Error
              ? cause.message
              : "Could not load your RFQs.",
          );
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const requestDetailId = requestDetailIdFromPath(path);
  useEffect(() => {
    if (!requestDetailId) return;
    const item = historyItems.find((entry) => entry.id === requestDetailId);
    if (!item || rfq?.record.id === item.id) return;
    let active = true;
    setRfqLoading(true);
    void listRfqAttachments(item.id)
      .then((attachments) => {
        if (!active) return;
        setRfq({ record: item, attachments });
      })
      .catch((cause) => {
        if (!active) return;
        setMessage(
          cause instanceof Error ? cause.message : "Could not load your RFQ.",
        );
      })
      .finally(() => {
        if (active) setRfqLoading(false);
      });
    return () => {
      active = false;
    };
  }, [historyItems, requestDetailId, rfq?.record.id]);
  const view: DashboardView =
    path === "/dashboard/requests" || requestDetailId
      ? "requests"
      : path === "/dashboard/products" ||
          /^\/dashboard\/products\/[^/]+$/.test(path)
        ? "products"
        : path === "/dashboard/favourites"
          ? "favourites"
          : path === "/dashboard/messages"
            ? "messages"
            : path === "/dashboard/invoices" ||
                /^\/dashboard\/invoices\/[^/]+$/.test(path)
              ? "invoices"
              : path === "/dashboard/settings"
                ? "settings"
                : path === "/dashboard/library"
                  ? "library"
                  : path === "/dashboard/new-product-request" ||
                      path === "/dashboard/new-rfq"
                    ? "new"
                    : "dashboard";
  const workspaceOpen = Boolean(
    rfq && (view === "dashboard" || view === "new" || requestDetailId),
  );
  function go(item: (typeof navItems)[number]) {
    setMobileOpen(false);
    if (item.view === "new" || item.view === "requests") setRfq(null);
    navigate(item.href);
  }
  async function startRfq(brief: string, files: UploadFile[]) {
    setMessage("Saving your sourcing brief…");
    try {
      const record = await createRfqCase({
        title: brief.length > 120 ? `${brief.slice(0, 120).trim()}…` : brief,
        brief: briefFromFields(brief, defaultRfqFields),
      });
      const validFiles = files.filter((file) => file.state === "ready");
      const attachments: RfqAttachment[] = [];
      for (const item of validFiles)
        attachments.push(await uploadRfqAttachment(record.id, item.file));
      setHistoryItems((current) => [
        record,
        ...current.filter((entry) => entry.id !== record.id),
      ]);
      setRfq({ record, attachments, initialPhase: "drafting" });
      setMessage("");
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Could not save your sourcing brief.",
      );
    }
  }
  async function restoreHistory(item: StoredRfq) {
    setMobileOpen(false);
    setRfqLoading(true);
    try {
      const attachments = await listRfqAttachments(item.id);
      setRfq({ record: item, attachments });
      setMessage("");
      navigate(`/dashboard/requests/${encodeURIComponent(item.id)}`);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not load your RFQ.",
      );
    } finally {
      setRfqLoading(false);
    }
  }
  async function reorderProduct(product: WorkspaceProduct) {
    setMessage("Starting a new RFQ from this product…");
    try {
      const title = `Reorder: ${product.name}`;
      const fields = {
        ...defaultRfqFields,
        product: product.name,
        quantity: `${product.units} units`,
      };
      const summary = `Reorder of ${product.name} (SKU ${product.sku}) previously sourced from ${product.supplier}.`;
      const record = await createRfqCase({
        title,
        brief: briefFromFields(summary, fields),
      });
      setHistoryItems((current) => [
        record,
        ...current.filter((entry) => entry.id !== record.id),
      ]);
      setMessage("");
      navigate("/dashboard/requests");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not start a reorder.",
      );
    }
  }
  function content() {
    if (view === "requests" && (historyLoading || rfqLoading))
      return <RfqSkeleton detail={Boolean(requestDetailId)} />;
    if (
      rfq &&
      (view === "dashboard" || view === "new" || Boolean(requestDetailId))
    ) {
      const summary =
        typeof rfq.record.brief.summary === "string"
          ? rfq.record.brief.summary
          : rfq.record.title;
      return (
        <RfqWorkspace
          key={rfq.record.id}
          caseId={rfq.record.id}
          brief={summary}
          initialFields={fieldsFromBrief(rfq.record.brief)}
          files={rfq.attachments}
          status={rfq.record.status}
          initialRevision={rfq.record.agent_revision ?? 0}
          initialAgentPrompt={
            rfq.initialPhase === "drafting" ? summary : undefined
          }
          initialPhase={rfq.initialPhase}
          onMessage={setMessage}
          onAgentDraftPatched={(nextFields, revision) => {
            setRfq((current) =>
              current
                ? {
                    ...current,
                    record: {
                      ...current.record,
                      brief: briefFromFields(summary, nextFields),
                      agent_revision: revision,
                    },
                  }
                : current,
            );
            setHistoryItems((current) =>
              current.map((item) =>
                item.id === rfq.record.id
                  ? {
                      ...item,
                      brief: briefFromFields(summary, nextFields),
                      agent_revision: revision,
                    }
                  : item,
              ),
            );
          }}
        />
      );
    }
    if (view === "requests")
      return (
        <WorkspaceRequests
          requests={historyItems}
          onOpen={(item) => {
            void restoreHistory(item);
          }}
        />
      );
    if (view === "products")
      return (
        <WorkspaceProducts
          path={path}
          onOpenRfq={(id) => {
            const record = historyItems.find((item) => item.id === id);
            if (record) void restoreHistory(record);
            else navigate("/dashboard/requests");
          }}
          onReorder={(product) => {
            void reorderProduct(product);
          }}
        />
      );
    if (view === "invoices") return <WorkspaceInvoices path={path} />;
    if (["favourites", "messages", "settings", "library"].includes(view))
      return (
        <PlaceholderView
          view={
            view as Exclude<
              DashboardView,
              "dashboard" | "new" | "requests" | "products" | "invoices"
            >
          }
        />
      );
    return (
      <DashboardHome
        isNew={view === "new"}
        onStart={(brief, files) => {
          void startRfq(brief, files);
        }}
        onMessage={setMessage}
      />
    );
  }
  return (
    <ThemeProvider theme={dashboardTheme}>
      <CssBaseline />
      <MotionConfig reducedMotion="user">
        <Box
          className="dashboard-root"
          sx={{
            display: "flex",
            width: "100%",
            maxWidth: "100vw",
            minHeight: "100vh",
            overflowX: "hidden",
            color: "text.primary",
            backgroundColor: "#fbfbfc",
          }}
        >
          {!mobile && (
            <Box
              component="aside"
              sx={{
                width: sidebarCollapsed ? 76 : 264,
                height: "100vh",
                maxHeight: "100vh",
                flexShrink: 0,
                borderRight: "1px solid #ececef",
                backgroundColor: "#fff",
                transition: "width 220ms ease",
                overflow: "hidden",
              }}
            >
              <Sidebar
                view={view}
                onNavigate={go}
                historyItems={historyItems}
                onRestore={(item) => {
                  void restoreHistory(item);
                }}
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed((current) => !current)}
              />
            </Box>
          )}
          <Box sx={{ minWidth: 0, width: 0, flex: 1 }}>
            <Box
              component="header"
              sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                minWidth: 0,
                width: "100%",
                minHeight: 68,
                px: { xs: 2, sm: 4 },
                borderBottom: "1px solid #f0f0f2",
                backgroundColor: "rgba(255,255,255,.84)",
              }}
            >
              {mobile && (
                <IconButton
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open navigation"
                >
                  <MenuIcon />
                </IconButton>
              )}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  minWidth: 0,
                  ml: mobile ? 1 : "auto",
                  position: { xs: "absolute", sm: "static" },
                  right: { xs: 2, sm: "auto" },
                }}
              >
                <Typography
                  sx={{
                    display: { xs: "none", sm: "block" },
                    minWidth: 0,
                    color: "#737b86",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {profile.name}
                </Typography>
                <Tooltip
                  title={`${profile.name}${profile.role ? ` · ${profile.role}` : ""}`}
                >
                  <Avatar
                    aria-label={`Signed in as ${profile.name}`}
                    sx={{
                      width: 34,
                      height: 34,
                      flex: "0 0 auto",
                      backgroundColor: "#e5e7eb",
                      color: "#5d6672",
                      fontSize: 13,
                    }}
                  >
                    {initials(profile.name)}
                  </Avatar>
                </Tooltip>
              </Box>
            </Box>
            <Box
              component="main"
              id="main"
              sx={{
                width: "100%",
                maxWidth: workspaceOpen
                  ? "none"
                  : view === "products"
                    ? {
                        xs: "calc(100vw - 32px)",
                        sm: "min(1450px, calc(100% - 80px))",
                      }
                  : {
                      xs: "calc(100vw - 32px)",
                      sm: "min(1060px, calc(100% - 48px))",
                    },
                px: workspaceOpen ? { xs: 2, sm: 3, md: 4 } : 0,
                minWidth: 0,
                boxSizing: "border-box",
                mx: "auto",
                py: { xs: 3, sm: 4, md: 5 },
              }}
            >
              {content()}
            </Box>
            {message && (
              <Box
                role="status"
                aria-live="polite"
                sx={{
                  position: "fixed",
                  right: { xs: 16, sm: 24 },
                  bottom: 20,
                  zIndex: 10,
                  maxWidth: 420,
                  px: 2,
                  py: 1.5,
                  borderRadius: "12px",
                  backgroundColor: "#344255",
                  color: "#fff",
                  boxShadow: "0 12px 28px rgba(44,56,73,.22)",
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center" }}
                >
                  <Typography sx={{ fontSize: 13, color: "inherit" }}>
                    {message}
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label="Dismiss message"
                    onClick={() => setMessage("")}
                    sx={{ color: "#fff" }}
                  >
                    <X fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            )}
          </Box>
          <Drawer
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
          >
            <Box sx={{ width: 280, height: "100%" }}>
              <Sidebar
                view={view}
                onNavigate={go}
                historyItems={historyItems}
                onRestore={(item) => {
                  void restoreHistory(item);
                }}
                mobile
              />
            </Box>
          </Drawer>
        </Box>
      </MotionConfig>
    </ThemeProvider>
  );
}
