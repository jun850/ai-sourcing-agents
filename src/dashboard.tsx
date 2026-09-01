import {
  Component,
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
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "framer-motion";
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
  ChatBubbleOutlined,
  CheckCircle,
  Close,
  CloseRounded,
  ChevronLeft,
  ChevronRight,
  Description,
  EditOutlined,
  KeyboardCommandKey,
  Logout,
  ReceiptLongOutlined,
  ErrorOutlined,
  FileUploadOutlined,
  Home,
  Image,
  Inbox,
  KeyboardArrowDown,
  LockOutlined,
  Menu as MenuIcon,
  SaveOutlined,
  Search,
  Settings,
  VerifiedOutlined,
} from "@mui/icons-material";
import { ArrowUp as PromptArrowUp, Plus as PromptPlus } from "lucide-react";
import {
  createRfqCase,
  extractRfqAttachment,
  getSession,
  getWorkspaceProfile,
  getWorkspaceOpsUnreadCount,
  getWorkspaceInvoiceDetail,
  getWorkspaceRfqProduction,
  decideWorkspaceRfqSample,
  invokeRfqCopilot,
  listRfqAttachments,
  listRfqCasesPage,
  listRfqMessages,
  listWorkspaceInvoices,
  listWorkspaceRfqQuotes,
  listWorkspaceSelectedSuppliers,
  selectWorkspaceRfqQuote,
  signOut,
  startWorkspaceInvoiceCheckout,
  type RfqAttachment,
  type WorkspaceChatMessage,
  type WorkspaceInvoice,
  type WorkspaceInvoiceDetail,
  type WorkspaceRfq,
  type WorkspaceRfqProduction,
  type WorkspaceRfqQuote,
  type WorkspaceSelectedSupplier,
  type CopilotAgentResponse,
  type WorkspaceProfile,
  updateRfqCase,
  uploadRfqAttachment,
} from "./supabase";
import { ProfileMenu } from "./profile-menu";
import { NotificationBell } from "./notification-bell";
import { WorkspaceCommandPalette } from "./workspace-command-palette";
import { WorkspaceLottie } from "./workspace-lottie";
import { useInfiniteList } from "./use-infinite-list";
import { RfqOpsMessagesWorkspace } from "./rfq-ops-messages";
import { classifyRfqIntake, extractProductPhrase, intakeFromBrief, type RfqIntake } from "./rfq-intake";
import {
  RfqReviewPipeline,
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
  | "messages"
  | "invoices"
  | "settings";
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
  | "submitted";
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

class RfqWorkspaceBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <RoundedSurface
        role="alert"
        sx={{
          display: "grid",
          gap: 1.5,
          minHeight: 360,
          placeItems: "center",
          px: 3,
          py: 5,
          textAlign: "center",
        }}
      >
        <Box>
          <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
            This RFQ could not be displayed
          </Typography>
          <Typography sx={{ mt: 0.75, color: "#667384", fontSize: 14 }}>
            Your saved request is unchanged. Reload it to continue.
          </Typography>
          <MuiButton
            variant="contained"
            onClick={() => window.location.reload()}
            sx={{ mt: 2, backgroundColor: "#4b7657", "&:hover": { backgroundColor: "#3d6548" } }}
          >
            Reload RFQ
          </MuiButton>
        </Box>
      </RoundedSurface>
    );
  }
}

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

const navItems: Array<{
  label: string;
  view: DashboardView;
  icon: typeof Home;
  href: string;
}> = [
  { label: "Home", view: "dashboard", icon: Home, href: "/dashboard" },
  {
    label: "Requests",
    view: "requests",
    icon: Inbox,
    href: "/dashboard/requests",
  },
  {
    label: "Messages",
    view: "messages",
    icon: ChatBubbleOutlined,
    href: "/dashboard/messages",
  },
  {
    label: "Invoices",
    view: "invoices",
    icon: ReceiptLongOutlined,
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

// The initial prompt is the buyer's supplied source of truth. Extract only
// explicit, low-risk RFQ facts so the live document is useful immediately;
// the server-side agent remains responsible for durable patching, retrieval,
// and any later clarification.
function normaliseBuyerPrompt(message: string) {
  // Correct only high-confidence procurement shorthand before extraction. The
  // original buyer message remains the RFQ summary and conversation record.
  return message
    .replace(/\bprcs?\b/gi, "pcs")
    .replace(/\bpeices?\b/gi, "pieces")
    .replace(/\bmetres?\b/gi, "meters");
}

function fieldsFromInitialPrompt(message: string, intake?: RfqIntake): RfqFields {
  const source = normaliseBuyerPrompt(message);
  const fields = { ...defaultRfqFields };
  const quantity = source.match(/\b(\d[\d,.]*)\s*(pcs?|pieces?|units?|meters?|yards?|kg|kgs?)\b/i);
  if (quantity) fields.quantity = `${quantity[1]} ${quantity[2]}`;
  const material = source.match(/\b((?:organic\s+)?(?:cotton|silk|linen|wool|cashmere|viscose|rayon|polyester|nylon|denim)(?:[-\s]+blend)?)\b/i)?.[0];
  const textileWeight = source.match(/\b(?:\d{2,4}\s*gsm|\d+(?:\.\d+)?\s*(?:oz|ounces?))\b/i)?.[0];
  if (material || textileWeight) fields.material = [material, textileWeight].filter(Boolean).join(", ");
  // Capture the buyer's whole product phrase ("short pants", "short-sleeve
  // blouse"), not just the head noun. Fall back to a fabric description when the
  // request is raw yardage rather than a finished item.
  const product = extractProductPhrase(source);
  if (product) fields.product = product;
  else if ((intake?.items[0]?.category ?? "") === "fabric" || (!product && /\bfabrics?\b|\btextiles?\b|\byardage\b/i.test(source))) {
    const weave = source.match(/\b(twill|poplin|jersey|fleece|canvas|denim|chambray|corduroy|flannel|sateen|satin|chiffon|voile|oxford|terry|french terry|ripstop|gabardine|interlock|pique|muslin|drill|crepe|georgette|organza|taffeta|velvet|velour|tweed|herringbone)\b/i)?.[0];
    const weaveBits = [material, weave].filter(Boolean).join(" ");
    if (/\bfabrics?\b|\btextiles?\b|\byardage\b/i.test(source)) fields.product = weaveBits ? `${weaveBits} fabric` : "Fabric";
    else if (weaveBits) fields.product = weaveBits;
  }
  const color = source.match(/\b(black|white|navy|blue|red|green|grey|gray|beige|brown|pink|yellow|orange|purple)\b/i)?.[0];
  if (color) fields.colors = color;
  const sizes = source.match(/\b(?:sizes?\s*)?(?:xs|s|m|l|xl|xxl|xxxl|sml)(?:\s*(?:to|[-–/,])\s*(?:xs|s|m|l|xl|xxl|xxxl))?\b/i)?.[0];
  if (sizes) fields.sizes = sizes;
  const budget = source.match(/\b(?:usd|us\$|\$)\s*\d[\d,.]*(?:\s*(?:each|per)\s*(?:pieces?|pcs?|units?))?\b|\b\d[\d,.]*\s*(?:usd|us\$|\$)(?:\s*(?:each|per)\s*(?:pieces?|pcs?|units?))?\b/i)?.[0];
  if (budget) fields.budget = budget;
  const timeline = source.match(/\b(?:within\s+)?\d[\d,.]*\s*(?:business\s+days?|days?|weeks?|months?)\b/i)?.[0];
  if (timeline) fields.timeline = timeline;
  return fields;
}

function requiredRfqFieldLabels(fields: RfqFields, intake: RfqIntake) {
  const rawMaterialRequest = ["fabric", "fibre_yarn", "leather", "interlining", "trims_labels", "packaging"].includes(
    intake.items[0]?.category ?? "",
  );
  const required: Array<keyof RfqFields> = rawMaterialRequest
    ? ["material", "quantity"]
    : ["product", "quantity"];
  return required
    .filter((field) => !fields[field].trim())
    .map((field) => rfqFieldLabels[field]);
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

function navigateToDraft(path: string) {
  if (typeof document.startViewTransition === "function") {
    document.startViewTransition(() => navigate(path));
    return;
  }
  navigate(path);
}

function Sidebar({
  view,
  onNavigate,
  historyItems,
  onRestore,
  collapsed = false,
  onToggle,
  mobile = false,
  profile,
  onEditProfile,
}: {
  view: DashboardView;
  onNavigate: (item: (typeof navItems)[number]) => void;
  historyItems: StoredRfq[];
  onRestore: (item: StoredRfq) => void;
  collapsed?: boolean;
  onToggle?: () => void;
  mobile?: boolean;
  profile: WorkspaceProfile;
  onEditProfile: () => void;
}) {
  const compact = collapsed && !mobile;
  const [logoHovered, setLogoHovered] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountName = profile.full_name?.trim() || "Workspace";
  const accountInitials =
    accountName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "A";
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
        transition: "background-color 160ms ease",
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
        variant="contained"
        onClick={() =>
          onNavigate({
            label: "New request",
            view: "new",
            icon: EditOutlined,
            href: "/dashboard/new-rfq",
          })
        }
        aria-label="New request"
        startIcon={!compact ? <Add /> : undefined}
        sx={{
          justifyContent: compact ? "center" : "flex-start",
          alignSelf: compact ? "center" : "stretch",
          minWidth: 0,
          px: compact ? 0 : 1.5,
          mb: 2.25,
          borderRadius: "10px",
          width: compact ? 48 : "auto",
          height: compact ? 48 : 40,
          fontSize: 13,
          fontWeight: 700,
          color: "#fff",
          backgroundColor: "#4b7657",
          boxShadow: "none",
          "&:hover": { backgroundColor: "#3d6548", boxShadow: "none" },
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
              onClick={(event) => {
                event.preventDefault();
                onNavigate(item);
              }}
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
        <Box sx={{ position: "relative", mt: 0.5 }}>
          <ListItemButton
            onClick={() => setAccountOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-label="Account menu"
            sx={{
              ...itemSx,
              gap: 1,
              justifyContent: compact ? "center" : "flex-start",
              alignSelf: compact ? "center" : "stretch",
              width: compact ? 48 : "100%",
              px: compact ? 0 : 0.75,
              py: 0.75,
              borderRadius: "10px",
            }}
          >
            <Avatar
              src={profile.avatar_url || undefined}
              slotProps={{ img: { alt: "" } }}
              sx={{
                width: 28,
                height: 28,
                flexShrink: 0,
                bgcolor: "#eef4ee",
                color: "#4b7657",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {accountInitials}
            </Avatar>
            {!compact && (
              <>
                <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                  <Typography
                    noWrap
                    sx={{ fontSize: 12.5, fontWeight: 700, color: "#202936" }}
                  >
                    {accountName}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: "#9ba1aa" }}>
                    Owner
                  </Typography>
                </Box>
                <KeyboardArrowDown sx={{ fontSize: 16, color: "#9ba1aa" }} />
              </>
            )}
          </ListItemButton>
          {accountOpen && (
            <>
              <Box
                onClick={() => setAccountOpen(false)}
                sx={{ position: "fixed", inset: 0, zIndex: 30 }}
                aria-hidden="true"
              />
              <Box
                role="menu"
                aria-label="Account"
                sx={{
                  position: "absolute",
                  bottom: "calc(100% + 8px)",
                  left: 0,
                  width: 244,
                  maxWidth: "calc(100vw - 24px)",
                  p: 1,
                  border: "1px solid #ececef",
                  borderRadius: "14px",
                  backgroundColor: "#fff",
                  boxShadow: "0 12px 32px rgba(20,25,33,.14)",
                  zIndex: 31,
                }}
              >
                <Box sx={{ px: 1.25, py: 1, borderBottom: "1px solid #f0f0f2" }}>
                  <Typography
                    noWrap
                    sx={{ fontSize: 12.5, fontWeight: 700, color: "#202936" }}
                  >
                    {profile.email || "Private workspace"}
                  </Typography>
                  <Typography sx={{ mt: 0.25, fontSize: 11, color: "#9ba1aa" }}>
                    {accountName}
                  </Typography>
                </Box>
                <MuiButton
                  fullWidth
                  role="menuitem"
                  onClick={() => {
                    setAccountOpen(false);
                    onEditProfile();
                  }}
                  sx={{
                    justifyContent: "flex-start",
                    mt: 0.5,
                    px: 1.25,
                    minHeight: 38,
                    color: "#596779",
                    fontSize: 13,
                    fontWeight: 500,
                    "&:hover": { backgroundColor: "#f7f7f8" },
                  }}
                >
                  Profile settings
                </MuiButton>
                <MuiButton
                  fullWidth
                  role="menuitem"
                  onClick={() => {
                    setAccountOpen(false);
                    navigate("/dashboard/settings");
                  }}
                  sx={{
                    justifyContent: "flex-start",
                    px: 1.25,
                    minHeight: 38,
                    color: "#596779",
                    fontSize: 13,
                    fontWeight: 500,
                    "&:hover": { backgroundColor: "#f7f7f8" },
                  }}
                >
                  Workspace settings
                </MuiButton>
                <Divider sx={{ my: 0.5, borderColor: "#f0f0f2" }} />
                <MuiButton
                  fullWidth
                  role="menuitem"
                  startIcon={<Logout sx={{ fontSize: 16 }} />}
                  onClick={() => {
                    setAccountOpen(false);
                    void signOut()
                      .then(() => location.assign("/sign-in"))
                      .catch(() => location.assign("/sign-in"));
                  }}
                  sx={{
                    justifyContent: "flex-start",
                    px: 1.25,
                    minHeight: 38,
                    color: "#9e3b36",
                    fontSize: 13,
                    fontWeight: 600,
                    "& .MuiButton-startIcon": { mr: 1 },
                    "&:hover": { backgroundColor: "#fff2f0" },
                  }}
                >
                  Sign out
                </MuiButton>
              </Box>
            </>
          )}
        </Box>
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
                sx={{
                  width: 32,
                  height: 32,
                  color: "#586575",
                  borderRadius: "10px",
                  backgroundColor: "rgba(255,255,255,.72)",
                  transition: "background-color 150ms ease, color 150ms ease, transform 150ms ease",
                  "&:hover": {
                    backgroundColor: "#ffffff",
                    color: "#202936",
                    transform: "scale(1.04)",
                  },
                  "&:focus-visible": {
                    outline: "2px solid #4b7657",
                    outlineOffset: 2,
                  },
                }}
              >
                <CloseRounded sx={{ fontSize: 18 }} />
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
  onTypingChange,
}: {
  onStart: (brief: string, files: UploadFile[]) => Promise<boolean>;
  onMessage: (message: string) => void;
  onTypingChange?: (typing: boolean) => void;
}) {
  const { register, handleSubmit, watch, reset } = useForm<BriefForm>({
    defaultValues: { brief: "" },
  });
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const promptRegistration = register("brief");
  const brief = watch("brief");
  useEffect(() => {
    onTypingChange?.(Boolean(brief.trim()) && !submitting);
  }, [brief, submitting, onTypingChange]);
  function resizePrompt(target: HTMLTextAreaElement) {
    target.style.height = "auto";
    const nextHeight = Math.min(target.scrollHeight, 248);
    target.style.height = `${nextHeight}px`;
    target.style.overflowY = target.scrollHeight > 248 ? "auto" : "hidden";
    setExpanded(nextHeight > 88);
  }
  async function submit(values: BriefForm) {
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
    // Enter can be observed by both the textarea and form on some browsers.
    // Use a synchronous guard so it cannot create two RFQs before React has
    // committed the disabled state.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const started = await onStart(values.brief.trim(), files);
      if (!started) return;
      reset();
      setFiles([]);
      setExpanded(false);
      requestAnimationFrame(() => {
        if (promptRef.current) {
          promptRef.current.style.height = "";
          promptRef.current.style.overflowY = "hidden";
        }
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
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
      aria-busy={submitting}
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
            borderRadius: expanded ? "16px" : "14px",
            backgroundColor: "#fff",
            boxShadow: "0 4px 8px rgba(32,41,54,.05)",
            transition:
              "border-color 180ms ease, box-shadow 180ms ease, border-radius 220ms cubic-bezier(.22,1,.36,1)",
            "&:focus-within": {
              border: 0,
              boxShadow: "0 4px 8px rgba(32,41,54,.05)",
            },
          }}
        >
          <Tooltip title="Add reference files">
            <IconButton
              type="button"
              component="label"
              htmlFor="product-reference-upload"
              aria-label="Add reference files"
              disabled={submitting}
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
            disabled={submitting}
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
              WebkitTextFillColor: "#202936",
              font: "inherit",
              fontSize: { xs: 15, sm: 16 },
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
                disabled={!brief.trim() || submitting}
                aria-busy={submitting}
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
  loading,
}: {
  messages: ConversationMessage[];
  onSend: (message: string) => Promise<void>;
  busy: boolean;
  loading: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const hasDraft = Boolean(draft.trim());
  const messages: ConversationMessage[] = conversationMessages;
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [newMessagesBelow, setNewMessagesBelow] = useState(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const node = messageListRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
    if (nearBottom) {
      node.scrollTo({ top: node.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
      setNewMessagesBelow(false);
    } else {
      setNewMessagesBelow(true);
    }
  }, [messages.length, busy, reduceMotion]);
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
    if (composerRef.current) {
      composerRef.current.style.height = "";
      composerRef.current.style.overflowY = "hidden";
    }
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
      aria-busy={busy || loading}
      sx={{
        display: "flex",
        alignSelf: "stretch",
        flexDirection: "column",
        position: { md: "sticky" },
        top: { md: 16 },
        height: {
          xs: "min(440px, calc(100dvh - 120px))",
          md: "min(720px, calc(100dvh - 220px))",
        },
        minHeight: {
          xs: "min(340px, calc(100dvh - 120px))",
          md: "min(460px, calc(100dvh - 220px))",
        },
        minWidth: 0,
        overflow: "hidden",
        border: 0,
        borderRadius: 0,
        backgroundColor: "transparent",
      }}
    >
      <Box
        ref={messageListRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: { xs: 1.75, md: 2.25 },
          p: { xs: 0, md: 1.25 },
          pt: { xs: 1.5, md: 1.75 },
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
        }}
        >
        {newMessagesBelow && (
          <MuiButton
            size="small"
            onClick={() => {
              const node = messageListRef.current;
              if (!node) return;
              node.scrollTo({ top: node.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
              setNewMessagesBelow(false);
            }}
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              alignSelf: "center",
              flexShrink: 0,
              px: 1.5,
              backgroundColor: "#fff",
              boxShadow: "0 2px 6px rgba(32, 41, 54, 0.1)",
            }}
          >
            New messages
          </MuiButton>
        )}
        {loading ? (
          <Stack spacing={1.5} aria-hidden="true" sx={{ pt: 0.5 }}>
            <Skeleton variant="text" width={76} sx={{ fontSize: 12 }} />
            <Skeleton variant="text" width="82%" sx={{ fontSize: 15 }} />
            <Skeleton variant="text" width="64%" sx={{ fontSize: 15 }} />
          </Stack>
        ) : (
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
                style={{ display: "flex", flexDirection: "column" }}
              >
                <Box
                  sx={{
                    alignSelf: message.from === "You" ? "flex-end" : "flex-start",
                    maxWidth: message.from === "You" ? "84%" : "min(84%, 68ch)",
                    ml: message.from === "You" ? "auto" : 0,
                    px: { xs: 1.75, md: 2.25 },
                    py: { xs: 1.25, md: 1.5 },
                    borderRadius:
                      message.from === "You" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                    backgroundColor:
                      message.from === "You" ? "#f0f1f3" : "#fff",
                    boxShadow:
                      message.from === "You" ? "none" : "0 4px 10px rgba(32, 41, 54, 0.06)",
                    color: "#202936",
                  }}
                >
                  <Typography
                    sx={{
                      display: message.from === "You" ? "none" : "block",
                      mb: 0.7,
                      color: "#667384",
                      fontSize: 11.5,
                      fontWeight: 700,
                    }}
                  >
                    {message.from}
                  </Typography>
                  <Typography
                    sx={{
                      minWidth: 0,
                      overflowWrap: "anywhere",
                      fontSize: { xs: 14, md: 15 },
                      lineHeight: 1.6,
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
        )}
        {busy && (
          <Box
            aria-label="Atelix assistant is drafting your RFQ"
            role="status"
            aria-live="polite"
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
                animate={
                  reduceMotion
                    ? { opacity: 0.72, y: 0 }
                    : { opacity: [0.3, 1, 0.3], y: [0, -2, 0] }
                }
                transition={{
                  duration: 1,
                  repeat: reduceMotion ? 0 : Infinity,
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
      <Box
        component="form"
        className="conversation-composer"
        onSubmit={submit}
        sx={{
          display: "flex",
          alignItems: expanded ? "flex-end" : "center",
          gap: { xs: 0.25, sm: 0.5 },
          mt: "auto",
          flex: "0 0 auto",
          p: { xs: 0.5, sm: 0.75 },
          pl: { xs: 0.75, sm: 1 },
          border: 0,
          borderRadius: expanded ? "16px" : "14px",
          backgroundColor: "#fff",
          colorScheme: "light",
          boxShadow: "0 4px 8px rgba(32,41,54,.05)",
          transition:
            "box-shadow 180ms ease, border-color 180ms ease, border-radius 220ms cubic-bezier(.22,1,.36,1)",
          "&:focus-within": {
            border: 0,
            boxShadow: "0 4px 8px rgba(32,41,54,.05)",
          },
        }}
      >
        <Box
          component="textarea"
          rows={1}
          ref={composerRef}
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
            colorScheme: "light",
            color: "#202936",
            WebkitTextFillColor: "#202936",
            font: "inherit",
            fontSize: { xs: 14, sm: 15 },
            lineHeight: 1.45,
            py: 1.05,
            "&::placeholder": { color: "#66717f" },
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
    </RoundedSurface>
  );
}

function RfqField({
  label,
  value,
  field,
  editing,
  loading = false,
  draft,
  onChange,
}: {
  label: string;
  value: string;
  field: keyof RfqFields;
  editing: boolean;
  loading?: boolean;
  draft: RfqFields;
  onChange: (field: keyof RfqFields, value: string) => void;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "104px minmax(0,1fr)",
        },
        gap: { xs: 0.5, sm: 1.25 },
        py: 1.45,
        alignItems: "start",
        borderBottom: "1px solid #edf0f3",
      }}
    >
      <Typography sx={{ color: "#667384", fontSize: 12.5, lineHeight: 1.45 }}>{label}</Typography>
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
      ) : loading ? (
        <Skeleton sx={{ width: "min(220px, 72%)", fontSize: 13 }} />
      ) : (
        <Typography
          sx={{
            minWidth: 0,
            color: value ? "#3f4c5e" : "#758091",
            fontSize: 13,
            fontWeight: value ? 600 : 400,
            lineHeight: 1.45,
            overflowWrap: "anywhere",
          }}
        >
          {value || "—"}
        </Typography>
      )}
    </Box>
  );
}

function IntakeSpecification({ intake, editing, onChange }: { intake: RfqIntake; editing: boolean; onChange: (itemIndex: number, fieldIndex: number, value: string) => void }) {
  if (!intake.items.length) return null;
  return <Box sx={{ mt: 2.5 }}>
    <Typography sx={{ color: "#4a5667", fontSize: 14, fontWeight: 700 }}>Request-specific details</Typography>
    <Typography sx={{ mt: 0.4, color: "#758091", fontSize: 12.5, lineHeight: 1.5 }}>{intake.subtype.replaceAll("_", " ")} details are scoped to this request. Blank fields remain unconfirmed.</Typography>
    {intake.items.map((item, itemIndex) => <Box key={item.id} sx={{ mt: 1.25, borderTop: "1px solid #edf0f3" }}>
      {item.fields.map((detail, fieldIndex) => <Box key={detail.key} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "minmax(130px,.45fr) minmax(0,1fr)" }, gap: { xs: 0.5, sm: 2 }, py: 1.25, borderBottom: "1px solid #edf0f3" }}>
        <Typography sx={{ color: "#667384", fontSize: 12.5 }}>{detail.label}</Typography>
        {editing ? <Box component="input" value={detail.value} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(itemIndex, fieldIndex, event.target.value)} aria-label={detail.label} placeholder={detail.state === "not_applicable" ? "Optional" : "Not specified"} sx={{ width: "100%", minWidth: 0, border: "1px solid #ccd5df", borderRadius: 1.5, px: 1, py: 0.65, color: "#354357", backgroundColor: "#fff", font: "inherit", fontSize: 13, outline: 0, "&:focus": { borderColor: "#4b7657", boxShadow: "0 0 0 3px rgba(75,118,87,.14)" } }} /> : <Typography sx={{ color: detail.value ? "#3f4c5e" : "#758091", fontSize: 13, lineHeight: 1.45 }}>{detail.value || "—"}</Typography>}
      </Box>)}
    </Box>)}
  </Box>;
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

const RFQ_TAB_IDS: Record<RfqTab, string> = {
  RFQ: "rfq-tab-rfq",
  Timeline: "rfq-tab-timeline",
  Quotes: "rfq-tab-quotes",
  Orders: "rfq-tab-orders",
  Files: "rfq-tab-files",
};

/** Full-width section tabs for the RFQ case workspace. Sits under the case header,
 *  above the conversation + document split. */
function RfqTabBar({
  tabs,
  tab,
  setTab,
  counts = {},
}: {
  tabs: RfqTab[];
  tab: RfqTab;
  setTab: (tab: RfqTab) => void;
  counts?: Partial<Record<RfqTab, number>>;
}) {
  function moveTab(event: KeyboardEvent, index: number) {
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : event.key === "ArrowLeft"
              ? (index - 1 + tabs.length) % tabs.length
              : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setTab(nextTab);
    requestAnimationFrame(() =>
      document.getElementById(RFQ_TAB_IDS[nextTab])?.focus(),
    );
  }
  return (
    <Box
      role="tablist"
      aria-label="RFQ workspace sections"
      sx={{
        display: "flex",
        gap: 0.5,
        borderBottom: "1px solid #e7ebf0",
        overflowX: "auto",
      }}
    >
      {tabs.map((item, index) => (
        <Box
          key={item}
          id={RFQ_TAB_IDS[item]}
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
            px: 0.5,
            py: 1.35,
            mr: 1.75,
            border: 0,
            borderBottom:
              tab === item ? "2px solid #4b7657" : "2px solid transparent",
            background: "transparent",
            color: tab === item ? "#202936" : "#647184",
            font: "inherit",
            fontSize: 13,
            fontWeight: tab === item ? 700 : 600,
            cursor: "pointer",
            "&:focus-visible": {
              outline: "3px solid rgba(75,118,87,.32)",
              outlineOffset: 2,
            },
          }}
        >
          {item}
          {Boolean(counts[item]) && (
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
              {counts[item]}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

const TIMELINE_RAIL_STEPS = [
  "RFQ submitted",
  "Atelix Operations review",
  "Supplier matching",
  "Quotes received",
  "Production",
] as const;

/** 0-based index of the step currently in progress. -1 means the RFQ is still a
 *  draft and nothing has started. */
function timelineRailIndex(status: string, submitted: boolean): number {
  if (!submitted && status === "draft") return -1;
  switch (status) {
    case "needs_research":
      return 1;
    case "awaiting_supplier":
    case "supplier_replied":
      return 2;
    case "buyer_review":
    case "quote_selected":
      return 3;
    case "in_production":
      return 4;
    case "closed":
      return 5;
    default:
      return 0;
  }
}

function timelineRailMeta(
  step: number,
  state: "done" | "current" | "pending",
  submittedAt: string | null,
): string {
  if (step === 0) {
    if (state === "pending") return "Not submitted yet";
    return submittedAt ? shortDateTime(submittedAt) : "Submitted";
  }
  if (state === "done") return "Complete";
  if (state === "current") return step === 3 ? "In review" : "In progress";
  return "Not started";
}

function shortDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact status rail shown in the RFQ workspace Timeline tab while the case is
 *  a draft. Progress is derived from the server case status, never a timer. */
function TimelineRail({
  status,
  submitted,
  submittedAt,
}: {
  status: string;
  submitted: boolean;
  submittedAt: string | null;
}) {
  const current = timelineRailIndex(status, submitted);
  return (
    <Box>
      <Typography
        component="h3"
        sx={{ mb: 2, color: "#46525f", fontSize: 14, fontWeight: 700 }}
      >
        Timeline
      </Typography>
      {TIMELINE_RAIL_STEPS.map((label, index) => {
        const state =
          current < 0
            ? "pending"
            : index < current
              ? "done"
              : index === current
                ? "current"
                : "pending";
        const last = index === TIMELINE_RAIL_STEPS.length - 1;
        const dotColor =
          state === "done"
            ? "#5f8767"
            : state === "current"
              ? "#4b7657"
              : "#c7ccd4";
        return (
          <Box
            key={label}
            sx={{ display: "flex", gap: 1.5, position: "relative", pb: last ? 0 : 2.5 }}
          >
            {!last && (
              <Box
                sx={{
                  position: "absolute",
                  left: "4px",
                  top: 16,
                  bottom: 4,
                  width: "2px",
                  backgroundColor: state === "done" ? "#dfe8e1" : "#eef0f3",
                }}
              />
            )}
            <Box
              sx={{
                position: "relative",
                zIndex: 1,
                flexShrink: 0,
                width: 10,
                height: 10,
                mt: "4px",
                borderRadius: "999px",
                backgroundColor: dotColor,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: state === "pending" ? "#9aa4b0" : "#202936",
                }}
              >
                {label}
              </Typography>
              <Typography
                sx={{
                  mt: 0.25,
                  fontSize: 11.5,
                  color:
                    state === "current"
                      ? "#4b7657"
                      : state === "pending"
                        ? "#b6bdc6"
                        : "#758091",
                }}
              >
                {timelineRailMeta(index, state, submittedAt)}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Compact supplier shortlist shown in the RFQ workspace Quotes tab. Reads and
 *  writes through the same guarded workspace RPCs as the full Quotes tab. */
function QuotesRail({
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
      onMessage(cause instanceof Error ? cause.message : "Could not load quotes.");
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
        cause instanceof Error ? cause.message : "Could not select this supplier.",
      );
    } finally {
      setBusyId(null);
    }
  }
  return (
    <Box>
      <Typography
        component="h3"
        sx={{ color: "#46525f", fontSize: 14, fontWeight: 700 }}
      >
        Supplier shortlist
      </Typography>
      <Typography
        sx={{ mt: 0.5, mb: 2, color: "#8a95a3", fontSize: 12, lineHeight: 1.5 }}
      >
        Every match is reviewed by Atelix Operations before it reaches you.
      </Typography>
      {quotes === null ? (
        <Stack spacing={1.25}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} variant="rounded" height={104} />
          ))}
        </Stack>
      ) : quotes.length === 0 ? (
        <Box
          sx={{
            border: "1px solid #eef0f3",
            borderRadius: "12px",
            p: 2.5,
            textAlign: "center",
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#4a5667" }}>
            No quotes yet
          </Typography>
          <Typography
            sx={{ mt: 0.75, fontSize: 12, color: "#9aa4b0", lineHeight: 1.5 }}
          >
            Atelix vets suppliers against your spec before quotes appear here.
          </Typography>
        </Box>
      ) : (
        (() => {
          const selectedQuote = quotes.find((q) => q.status === "selected");
          const decided = Boolean(selectedQuote);
          return (
            <Stack spacing={1.25}>
              {selectedQuote && (
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    p: 1.5,
                    borderRadius: "11px",
                    backgroundColor: "#eef4ee",
                    color: "#33513c",
                  }}
                >
                  <CheckCircle sx={{ fontSize: 16, mt: "1px", flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 12.5, lineHeight: 1.5 }}>
                    You selected <strong>{selectedQuote.factory_name}</strong>.
                    Atelix Operations will confirm terms and move this RFQ to
                    production.
                  </Typography>
                </Box>
              )}
              {quotes.map((quote) => {
                const selected = quote.status === "selected";
                return (
                  <Box
                    key={quote.id}
                    sx={{
                      border: selected
                        ? "1.5px solid #4b7657"
                        : "1px solid #e7ebf0",
                      borderRadius: "12px",
                      p: 1.75,
                      backgroundColor: selected ? "#f7fbf7" : "#fff",
                      opacity: decided && !selected ? 0.6 : 1,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                      }}
                    >
                      <Typography
                        sx={{ fontSize: 13.5, fontWeight: 700, color: "#202936" }}
                      >
                        {quote.factory_name}
                      </Typography>
                      <Box
                        component="span"
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.4,
                          flexShrink: 0,
                          px: 0.9,
                          py: 0.3,
                          borderRadius: "999px",
                          backgroundColor: "#eef4ee",
                          color: "#4b7657",
                          fontSize: 10.5,
                          fontWeight: 700,
                        }}
                      >
                        <VerifiedOutlined sx={{ fontSize: 12 }} />
                        Verified
                      </Box>
                    </Box>
                    <Typography sx={{ mt: 0.5, fontSize: 12, color: "#5a6675" }}>
                      {[
                        quote.factory_region,
                        quote.factory_years
                          ? `${quote.factory_years} yrs in business`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Reviewed supplier"}
                    </Typography>
                    <Box
                      sx={{
                        mt: 1.25,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                      }}
                    >
                      <Typography
                        sx={{ fontSize: 13, fontWeight: 700, color: "#202936" }}
                      >
                        from {invoiceMoney(quote.unit_price_cents)}/pc
                      </Typography>
                      {selected ? (
                        <MuiButton
                          size="small"
                          disabled
                          variant="contained"
                          sx={{
                            backgroundColor: "#4b7657",
                            "&.Mui-disabled": {
                              backgroundColor: "#4b7657",
                              color: "#fff",
                            },
                          }}
                        >
                          Selected
                        </MuiButton>
                      ) : (
                        <MuiButton
                          size="small"
                          disabled={decided || busyId === quote.id}
                          onClick={() => void select(quote.id)}
                          variant="outlined"
                          sx={{ borderColor: "#d7dce2", color: "#3d4652" }}
                        >
                          {busyId === quote.id ? "Selecting…" : "Select"}
                        </MuiButton>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          );
        })()
      )}
    </Box>
  );
}

function RfqDocumentPanel({
  phase,
  fields,
  draft,
  caseNo,
  layout = "full",
  submittedAt = null,
  intake,
  intakeDraft,
  tab,
  setTab,
  caseStatus,
  caseId,
  attachments,
  onEdit,
  onChange,
  onIntakeChange,
  onSave,
  onCancel,
  onSubmit,
  onMessage,
  onQuoteSelected,
  agentStatus,
  changedFields,
  preparing = false,
  actionPending = false,
  justSubmitted = false,
}: {
  phase: RfqPhase;
  fields: RfqFields;
  draft: RfqFields;
  caseNo: string;
  layout?: "rail" | "full";
  submittedAt?: string | null;
  intake: RfqIntake;
  intakeDraft: RfqIntake;
  tab: RfqTab;
  setTab: (tab: RfqTab) => void;
  caseStatus: string;
  caseId: string;
  attachments: RfqAttachment[];
  onEdit: () => void;
  onChange: (field: keyof RfqFields, value: string) => void;
  onIntakeChange: (itemIndex: number, fieldIndex: number, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onMessage: (message: string) => void;
  onQuoteSelected: () => void;
  agentStatus: AgentStatus | null;
  changedFields: Array<keyof RfqFields>;
  preparing?: boolean;
  actionPending?: boolean;
  justSubmitted?: boolean;
}) {
  const editing = phase === "editing";
  const canEditRfq = !editing && phase !== "submitted";
  const rail = layout === "rail";
  return (
    <Box
      id="rfq-tabpanel"
      role="tabpanel"
      aria-labelledby={RFQ_TAB_IDS[tab]}
      sx={{
        minWidth: 0,
        pt: rail ? { xs: 2, md: 2.5 } : { xs: 2.5, md: 3.5 },
        ...(rail
          ? {
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              ...(tab === "RFQ" ? {} : { overflowY: "auto" }),
            }
          : { maxWidth: tab === "RFQ" ? 760 : 920 }),
      }}
    >
        {tab === "Timeline" &&
          (rail ? (
            <TimelineRail
              status={caseStatus}
              submitted={phase === "submitted"}
              submittedAt={submittedAt}
            />
          ) : (
            <StageTimeline
              status={caseStatus}
              onReviewDraft={() => setTab("RFQ")}
            />
          ))}
        {tab === "Files" && <FilesTab attachments={attachments} />}
        {tab === "Quotes" &&
          (rail ? (
            <QuotesRail
              caseId={caseId}
              onMessage={onMessage}
              onSelected={onQuoteSelected}
            />
          ) : (
            <QuotesTab
              caseId={caseId}
              onMessage={onMessage}
              onSelected={onQuoteSelected}
            />
          ))}
        {tab === "Orders" && (
          <ProductionTab caseId={caseId} onMessage={onMessage} />
        )}
        {tab === "RFQ" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              flex: rail ? 1 : "none",
              minHeight: 0,
            }}
          >
            <Box
              sx={{
                flex: rail ? 1 : "none",
                minHeight: 0,
                overflowY: rail ? "auto" : "visible",
                pr: rail ? 0.5 : 0,
              }}
            >
            {agentStatus &&
              (changedFields.length > 0 ||
                agentStatus.tone === "error" ||
                agentStatus.tone === "warning") && (
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
                {changedFields.length > 0
                  ? `Updated ${changedFields.map((field) => rfqFieldLabels[field]).join(", ")}.`
                  : agentStatus.text}
              </Box>
            )}
            <Box
              sx={{
                mb: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                <Typography
                  component="h3"
                  sx={{ color: "#3f4c5e", fontSize: 14, fontWeight: 750, letterSpacing: "-.01em" }}
                >
                  RFQ details
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 10.5,
                    color: "#8a95a3",
                    whiteSpace: "nowrap",
                  }}
                >
                  {caseNo}
                </Typography>
              </Stack>
              {canEditRfq && (
                <MuiButton
                  onClick={onEdit}
                  disabled={actionPending || preparing}
                  startIcon={<EditOutlined />}
                  size="small"
                  sx={{ flexShrink: 0, minWidth: 0, px: 0.5, color: "#637486", fontWeight: 650 }}
                >
                  Edit
                </MuiButton>
              )}
            </Box>
            <Box>
              {(
                [
                  ["Product", "product"],
                  ["Quantity", "quantity"],
                  ["Material", "material"],
                  ["Certifications", "certifications"],
                  ["Colors", "colors"],
                  ["Sizes", "sizes"],
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
                  loading={preparing}
                  draft={draft}
                  onChange={onChange}
                />
              ))}
            </Box>
            <IntakeSpecification intake={editing ? intakeDraft : intake} editing={editing} onChange={onIntakeChange} />
            </Box>
            <Box sx={{ flexShrink: 0, mt: rail ? 2 : 0 }}>
            {editing ? (
              <Stack
                direction="row"
                justifyContent="flex-end"
                spacing={1}
                sx={{ pt: 2 }}
              >
                <MuiButton
                  onClick={onCancel}
                  disabled={actionPending}
                  sx={{ color: "#718092" }}
                >
                  Cancel
                </MuiButton>
                <MuiButton
                  onClick={onSave}
                  disabled={actionPending}
                  aria-busy={actionPending}
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
              phase !== "submitted" && (
                <Stack
                  direction="row"
                  justifyContent="flex-end"
                  alignItems="center"
                  sx={{
                    width: "100%",
                    mt: rail ? 0 : 3,
                    pt: 2,
                    borderTop: "1px solid #edf0f3",
                    flexWrap: "wrap",
                  }}
                >
                  <MuiButton
                    onClick={onSubmit}
                    disabled={actionPending || preparing}
                    aria-busy={actionPending}
                    endIcon={<ArrowForward />}
                    variant="contained"
                    sx={{
                      flexShrink: 0,
                      width: rail ? "100%" : undefined,
                      minWidth: { xs: "100%", sm: rail ? "100%" : 208 },
                      minHeight: 60,
                      px: 3,
                      fontSize: 16,
                      fontWeight: 700,
                      borderRadius: "14px",
                      backgroundColor: "#4b7657",
                      boxShadow: "0 8px 18px rgba(55, 93, 66, .18)",
                      "&:hover": { backgroundColor: "#3d6548", boxShadow: "0 10px 20px rgba(55, 93, 66, .24)" },
                    }}
                  >
                    Submit RFQ
                  </MuiButton>
                </Stack>
              )
            )}
            </Box>
          </Box>
        )}
    </Box>
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
  const [decisionBusy, setDecisionBusy] = useState(false);
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
  const sampleInvoice = data.invoices.sample;
  const bulkInvoice = data.invoices.bulk;
  const activeInvoice = bulkInvoice || sampleInvoice || data.invoice || null;
  const lifecycleState = data.lifecycle?.state || "sample_invoice_pending";
  const decideSample = async (decision: "approved" | "declined") => {
    setDecisionBusy(true);
    try { setData(await decideWorkspaceRfqSample(caseId, decision)); }
    catch (cause) { onMessage(cause instanceof Error ? cause.message : "Could not record your sample decision."); }
    finally { setDecisionBusy(false); }
  };
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
      done: Boolean(sampleInvoice && sampleInvoice.status === "paid"),
      current: Boolean(sampleInvoice && sampleInvoice.status !== "paid"),
      detail: sampleInvoice
        ? sampleInvoice.status === "paid"
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
      current: ["sample_in_progress", "sample_awaiting_buyer"].includes(lifecycleState),
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
      current: lifecycleState === "bulk_in_production",
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
        {Object.values(data.invoices).length > 1 && (
          <Stack spacing={0.5} sx={{ mt: 1 }} aria-label="Phase invoices">
            {Object.values(data.invoices).map((invoice) => invoice && (
              <MuiButton key={invoice.id} size="small" variant="text" onClick={() => navigate(`/dashboard/invoices/${encodeURIComponent(invoice.id)}`)} sx={{ justifyContent: "space-between", px: 0, textTransform: "none" }}>
                {invoice.phase === "sample" ? "Sampling" : "Bulk production"} · {invoice.invoice_no}
              </MuiButton>
            ))}
          </Stack>
        )}
        {activeInvoice ? (
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
                  {activeInvoice.invoice_no} {activeInvoice === sampleInvoice ? "· Sampling" : "· Bulk"}
                </Typography>
                <Typography sx={{ mt: 0.3, fontSize: 12, color: "#758091" }}>
                  {invoiceDate(activeInvoice.due_date)}
                </Typography>
              </Box>
              <Chip
                size="small"
                label={invoiceStatusLabel(activeInvoice as WorkspaceInvoice)}
                color={invoiceStatusColor(activeInvoice as WorkspaceInvoice)}
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
                  {invoiceMoney(activeInvoice.total_cents)}
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
                    color: activeInvoice.balance_cents ? "#9a4f47" : "#202936",
                  }}
                >
                  {invoiceMoney(activeInvoice.balance_cents)}
                </Typography>
              </Box>
            </Box>
            {activeInvoice.status === "sent" && (
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
                    `/dashboard/invoices/${encodeURIComponent(activeInvoice.id)}`,
                  )
                }
              >
                Pay invoice
              </MuiButton>
            )}
            {lifecycleState === "sample_awaiting_buyer" && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                <MuiButton variant="contained" disabled={decisionBusy} onClick={() => void decideSample("approved")} sx={{ backgroundColor: "#4b7657", "&:hover": { backgroundColor: "#3d6548" } }}>Approve sample</MuiButton>
                <MuiButton variant="outlined" color="error" disabled={decisionBusy} onClick={() => void decideSample("declined")}>Decline sample</MuiButton>
              </Stack>
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
            Atelix will send the sampling invoice once the selected proposal is reviewed.
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
  intake?: RfqIntake | null,
): Record<string, unknown> {
  return { summary, fields, ...(intake ? { intake } : {}) };
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
  caseNo,
  brief,
  initialFields,
  initialIntake,
  files,
  status,
  submittedAt,
  initialRevision = 0,
  initialPhase,
  onMessage,
  onAgentDraftPatched,
}: {
  caseId: string;
  caseNo: string;
  brief: string;
  initialFields: RfqFields;
  initialIntake?: RfqIntake | null;
  files: RfqAttachment[];
  status: string;
  submittedAt?: string | null;
  initialRevision?: number;
  initialPhase?: RfqPhase;
  onMessage: (message: string) => void;
  onAgentDraftPatched: (fields: RfqFields, revision: number, intake?: RfqIntake | null) => void;
}) {
  const persistedPhase = phaseForPersistedStatus(status);
  const restoredSubmitted =
    initialPhase === undefined && persistedPhase === "submitted";
  const [phase, setPhase] = useState<RfqPhase>(initialPhase ?? persistedPhase);
  const [fields, setFields] = useState<RfqFields>(initialFields);
  const [draft, setDraft] = useState<RfqFields>(initialFields);
  const [intake, setIntake] = useState<RfqIntake>(() => initialIntake ?? classifyRfqIntake(brief));
  const [intakeDraft, setIntakeDraft] = useState<RfqIntake>(() => initialIntake ?? classifyRfqIntake(brief));
  const [attachments, setAttachments] = useState<RfqAttachment[]>(files);
  const [tab, setTab] = useState<RfqTab>("RFQ");
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [trackClicked, setTrackClicked] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >(() =>
    status === "draft" && Boolean(brief.trim())
      ? [{ id: "opening-brief", from: "You", text: brief }]
      : [],
  );
  const [agentRevision, setAgentRevision] = useState(initialRevision);
  const [agentPending, setAgentPending] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [changedFields, setChangedFields] = useState<Array<keyof RfqFields>>([]);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  // Conversation reads may arrive after the first drafted turn. Keep the
  // composer usable and render optimistic turns immediately; a slow history
  // RPC must never cover the buyer's live conversation with a skeleton.
  const [messagesLoaded, setMessagesLoaded] = useState(true);
  const [documentActionPending, setDocumentActionPending] = useState(false);
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
        if (active) {
          const persisted = next.map((message) => ({
            id: message.id,
            from: (message.role === "buyer"
              ? "You"
              : "Atelix assistant") as ConversationMessage["from"],
            text: message.content,
          }));
          // Do not let the initial thread fetch erase a message that the
          // buyer just sent while the new RFQ was opening. Persisted turns
          // replace matching optimistic entries; only local entries that are
          // not yet visible in the RPC result remain appended.
          setConversationMessages((current) => {
            const persistedIds = new Set(persisted.map((message) => message.id));
            const persistedTurns = new Set(
              persisted.map((message) => `${message.from}:${message.text}`),
            );
            return [
              ...persisted,
              ...current.filter(
                (message) =>
                  !persistedIds.has(message.id) &&
                  !persistedTurns.has(`${message.from}:${message.text}`),
              ),
            ];
          });
        }
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

  function startEdit() {
    setDraft(fields);
    setIntakeDraft(intake);
    setPhase("editing");
  }
  function changeField(field: keyof RfqFields, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  function changeIntakeField(itemIndex: number, fieldIndex: number, value: string) {
    setIntakeDraft((current) => ({ ...current, items: current.items.map((item, index) => index !== itemIndex ? item : { ...item, fields: item.fields.map((field, fieldOffset) => fieldOffset !== fieldIndex ? field : { ...field, value, state: value.trim() ? "provided" : field.state }) }) }));
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
    if (response.intake) {
      setIntake(response.intake);
      setIntakeDraft(response.intake);
    }
    if (Object.keys(safePatch).length > 0) {
      setFields((current) => {
        const next = response.undoToken === null && response.kind === "draft_updated"
          ? { ...defaultRfqFields, ...safePatch }
          : { ...current, ...safePatch };
        onAgentDraftPatched(next, response.revision, response.intake);
        return next;
      });
      setDraft((current) => ({ ...current, ...safePatch }));
    } else if (response.intake) {
      onAgentDraftPatched(fields, response.revision, response.intake);
    }
    setChangedFields(nextChangedFields);
    setAgentRevision(response.revision);
    setUndoToken(response.undoToken);
    const supportRequested =
      Boolean(response.supportHandoff) || response.kind === "support_handoff";
    const unavailable = response.kind === "unavailable";
    const verificationStatus = response.verificationStatus?.trim() || null;
    if (
      !unavailable &&
      !supportRequested &&
      nextChangedFields.length === 0 &&
      verificationStatus?.toLowerCase() === "verified"
    ) {
      setAgentStatus(null);
    } else {
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
            : nextChangedFields.length
              ? "RFQ updated."
              : verificationStatus || "Atelix has checked the saved RFQ.",
      });
    }
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
  async function sendConversationMessage(message: string, optimistic = true, action?: "reconcile_references", expectedRevisionOverride?: number) {
    if (agentPending) return null;
    const clientMessageId = newClientMessageId();
    setAgentPending(true);
    setChangedFields([]);
    setUndoToken(null);
    setAgentStatus({ tone: "info", text: "Atelix is checking your request…" });
    if (optimistic) {
      setConversationMessages((current) => [
        ...current,
        { id: clientMessageId, from: "You", text: message },
      ]);
    }
    try {
      const response = await invokeRfqCopilot({
        rfqCaseId: caseId,
        message,
        clientMessageId,
        expectedRevision: expectedRevisionOverride ?? agentRevision,
        action,
      });
      applyAgentResponse(response);
      return response;
    } catch (cause) {
      const fallback =
        "That message was not delivered to your RFQ. Please send it again; your existing draft remains unchanged.";
      setAgentStatus({
        tone: "warning",
        text: "Your latest message was not delivered. Please send it again.",
      });
      setConversationMessages((current) => [
        ...current,
        { id: newClientMessageId(), from: "Atelix assistant", text: fallback },
      ]);
      onMessage("");
      return null;
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
    // A newly-created RFQ is the only state that should automatically send
    // its opening brief. When there are reference files, give their private
    // extraction a short head start so the first draft can include plainly
    // visible labels and BOM text. A reference failure never blocks the RFQ.
    if (phase !== "drafting" || initialTurnStarted.current) return;
    initialTurnStarted.current = true;
    const unreadReferences = attachments.filter(
      (attachment) =>
        attachment.extraction_status !== "ready" &&
        attachment.extraction_status !== "failed",
    );
    const extraction = Promise.allSettled(
      unreadReferences.map((attachment) =>
        extractRfqAttachment(caseId, attachment.id),
      ),
    );
    void (async () => {
      const firstResponse = await sendConversationMessage(brief, false);
      setPhase("review");
      const results = await extraction;
        const updates = results
          .filter((result): result is PromiseFulfilledResult<RfqAttachment> => result.status === "fulfilled")
          .map((result) => result.value);
        if (updates.length) {
          setAttachments((current) =>
            current.map((attachment) =>
              updates.find((update) => update.id === attachment.id) ?? attachment,
            ),
          );
          // Reference OCR runs independently from the buyer's first response;
          // once it is ready, reconcile it without adding synthetic buyer text.
          await sendConversationMessage("", false, "reconcile_references", firstResponse?.revision);
        }
    })();
  }, [attachments, brief, caseId, phase]);
  function saveEdit() {
    if (documentActionPending) return;
    setDocumentActionPending(true);
    void updateRfqCase(caseId, {
      title: brief.slice(0, 120) || "New sourcing request",
      brief: briefFromFields(brief, draft, intakeDraft),
      status: "draft",
    })
      .then(() => {
        setFields(draft);
        setIntake(intakeDraft);
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
      )
      .finally(() => setDocumentActionPending(false));
  }
  function submitRfq() {
    if (documentActionPending) return;
    const missingRequired = requiredRfqFieldLabels(fields, intake);
    if (missingRequired.length) {
      setAgentStatus({
        tone: "warning",
        text: `Add ${missingRequired.join(" and ")} before submitting this RFQ.`,
      });
      return;
    }
    setDocumentActionPending(true);
    void updateRfqCase(caseId, {
      title: brief.slice(0, 120) || "New sourcing request",
      brief: briefFromFields(brief, fields, intake),
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
      )
      .finally(() => setDocumentActionPending(false));
  }
  function trackRequest() {
    // The timer-driven matching -> matched transition never switches the
    // panel on its own; only this explicit click (the buyer's own action)
    // does, landing on the Timeline tab.
    setTrackClicked(true);
    setTab("Timeline");
  }

  const draftingPhase =
    phase === "drafting" || phase === "review" || phase === "editing";
  const preparingDocument = phase === "drafting";
  const justSubmitted = phase === "submitted" && !restoredSubmitted;
  const baseStatus =
    phase === "submitted"
      ? status === "draft"
        ? "needs_research"
        : status
      : status;
  const caseStatus = statusOverride ?? baseStatus;
  const showPipeline = justSubmitted && !trackClicked;
  const visibleTabs: RfqTab[] = draftingPhase
    ? ["RFQ", "Timeline", "Quotes", "Files"]
    : ["RFQ", "Timeline", "Quotes", "Orders", "Files"];
  const documentPanel = (panelLayout: "rail" | "full") => (
    <RfqDocumentPanel
      phase={phase}
      fields={fields}
      draft={draft}
      caseNo={caseNo}
      layout={panelLayout}
      submittedAt={submittedAt ?? null}
      intake={intake}
      intakeDraft={intakeDraft}
      tab={tab}
      setTab={setTab}
      caseStatus={caseStatus}
      caseId={caseId}
      attachments={attachments}
      onEdit={startEdit}
      onChange={changeField}
      onIntakeChange={changeIntakeField}
      onSave={saveEdit}
      onCancel={() => setPhase("review")}
      onSubmit={submitRfq}
      onMessage={onMessage}
      onQuoteSelected={() => setStatusOverride("quote_selected")}
      agentStatus={agentStatus}
      changedFields={changedFields}
      preparing={preparingDocument}
      justSubmitted={justSubmitted}
      actionPending={documentActionPending}
    />
  );
  const stageMeta = DESIGN_STAGE_META[designStageFor(caseStatus)];
  return (
    <Stack spacing={2.25} sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
        <Box
          component="button"
          type="button"
          onClick={() => navigate("/dashboard/requests")}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexShrink: 0,
            border: 0,
            background: "transparent",
            color: "#697586",
            font: "inherit",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            "&:hover": { color: "#202936" },
            "&:focus-visible": { outline: "3px solid rgba(75,118,87,.32)", outlineOffset: 2, borderRadius: 1 },
          }}
        >
          <ArrowBack sx={{ fontSize: 16 }} />
          Requests
        </Box>
        <Box sx={{ width: "1px", height: 18, flexShrink: 0, backgroundColor: "#ececef" }} />
        <Typography
          noWrap
          sx={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: "#202936" }}
        >
          {fields.product || brief || "RFQ draft"}
        </Typography>
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            px: 1.25,
            py: 0.5,
            borderRadius: "999px",
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
            backgroundColor: stageMeta.bg,
            color: stageMeta.ink,
          }}
        >
          {stageMeta.label}
        </Box>
      </Box>
      {showPipeline ? (
        <RfqReviewPipeline
          caseNo={caseNo}
          status={caseStatus}
          onTrack={trackRequest}
        />
      ) : (
        <>
          <RfqTabBar
            tabs={visibleTabs}
            tab={tab}
            setTab={setTab}
            counts={{ Files: attachments.length }}
          />
          {draftingPhase ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "minmax(0,1fr) minmax(340px, 380px)",
                },
                gap: 3,
                alignItems: "start",
              }}
            >
              <ConversationChatPanel
                messages={conversationMessages}
                onSend={async (message) => { await sendConversationMessage(message); }}
                busy={agentPending}
                loading={!messagesLoaded}
              />
              <Box
                sx={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  position: { md: "sticky" },
                  top: { md: 16 },
                  alignSelf: "start",
                  height: {
                    xs: "auto",
                    md: "min(720px, calc(100dvh - 220px))",
                  },
                  minHeight: 0,
                }}
              >
                {documentPanel("rail")}
              </Box>
            </Box>
          ) : (
            <Box sx={{ minWidth: 0, width: "100%" }}>{documentPanel("full")}</Box>
          )}
        </>
      )}
    </Stack>
  );
}

type DesignStage = "drafting" | "review" | "quoted" | "production" | "delivered";
const DESIGN_STAGE_META: Record<
  DesignStage,
  { label: string; dot: string; bg: string; ink: string }
> = {
  drafting: { label: "Drafting", dot: "#9aa1ab", bg: "#f0f1f3", ink: "#596779" },
  review: { label: "In review", dot: "#c5a66c", bg: "#fbf4e7", ink: "#81622c" },
  quoted: { label: "Quoted", dot: "#88b863", bg: "#eff6e9", ink: "#4a7a3e" },
  production: { label: "In production", dot: "#4b7657", bg: "#eef4ee", ink: "#3d6548" },
  delivered: { label: "Delivered", dot: "#5f8767", bg: "#edf5ef", ink: "#4e7756" },
};
function designStageFor(status: string): DesignStage {
  switch (status) {
    case "draft":
      return "drafting";
    case "needs_research":
    case "awaiting_supplier":
    case "supplier_replied":
      return "review";
    case "buyer_review":
    case "quote_selected":
      return "quoted";
    case "in_production":
      return "production";
    case "closed":
      return "delivered";
    default:
      return "drafting";
  }
}
const DESIGN_STAGE_TABS = [
  "All",
  "Drafting",
  "In review",
  "Quoted",
  "In production",
  "Delivered",
] as const;
type DesignStageTab = (typeof DESIGN_STAGE_TABS)[number];

function relativeShort(iso: string): string {
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
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));
}

function WorkspaceRequests({
  requests,
  onOpen,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: {
  requests: StoredRfq[];
  onOpen: (request: StoredRfq) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  const [suppliers, setSuppliers] = useState<Map<string, WorkspaceSelectedSupplier>>(new Map());
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<DesignStageTab>("All");
  const loadMoreSentinel = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const node = loadMoreSentinel.current;
    if (!node || !onLoadMore || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "320px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  const term = query.trim().toLowerCase();
  const filtered = requests.filter((request) => {
    const stage = DESIGN_STAGE_META[designStageFor(request.status)].label;
    const matchesTab = tab === "All" || stage === tab;
    const matchesQuery =
      !term ||
      request.title.toLowerCase().includes(term) ||
      request.case_no.toLowerCase().includes(term);
    return matchesTab && matchesQuery;
  });

  const GRID = "minmax(200px,1.7fr) minmax(120px,1fr) 150px 84px 32px";
  const columns = ["Request", "Supplier", "Stage", "Updated", ""];
  const tabStyle = (active: boolean) => ({
    height: 32,
    px: 1.5,
    border: 0,
    borderRadius: "8px",
    background: active ? "#f0f1f3" : "transparent",
    color: active ? "#202936" : "#697586",
    font: "inherit",
    fontSize: 12.5,
    fontWeight: active ? 700 : 500,
    whiteSpace: "nowrap",
    cursor: "pointer",
  });

  return (
    <Box sx={{ maxWidth: 1080, mx: "auto", pt: { xs: 1, md: 2 }, pb: 6 }}>
      <Box sx={{ mb: 2.75 }}>
        <Typography variant="h1" sx={{ m: 0, fontSize: { xs: 24, sm: 26 }, letterSpacing: "-.03em", color: "#202936" }}>
          Requests
        </Typography>
        <Typography sx={{ mt: 0.75, fontSize: 13.5, color: "#596779" }}>
          Every RFQ case, from draft to delivery.
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5, flexWrap: "wrap" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.125,
            flex: "1 1 260px",
            minWidth: 220,
            height: 42,
            px: 1.75,
            border: "1px solid #ececef",
            borderRadius: "11px",
            backgroundColor: "#fff",
            color: "#9ba1aa",
            "&:focus-within": { borderColor: "#c7ccd4" },
          }}
        >
          <Search sx={{ fontSize: 16 }} />
          <Box
            component="input"
            type="text"
            value={query}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            placeholder="Search requests…"
            aria-label="Search requests"
            sx={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 0,
              background: "transparent",
              font: "inherit",
              fontSize: 13.5,
              color: "#202936",
              "&::placeholder": { color: "#9ba1aa" },
              // The Requests filter has its own neutral focus treatment on
              // the containing field. Avoid the global green browser ring
              // leaking onto the text input itself.
              "&:focus, &:focus-visible": { outline: "none", boxShadow: "none" },
            }}
          />
        </Box>
        <Box
          role="tablist"
          aria-label="Filter by stage"
          sx={{
            display: "flex",
            gap: 0.375,
            p: 0.375,
            border: "1px solid #ececef",
            borderRadius: "11px",
            backgroundColor: "#fff",
            overflowX: "auto",
          }}
        >
          {DESIGN_STAGE_TABS.map((label) => (
            <Box
              key={label}
              component="button"
              type="button"
              role="tab"
              aria-selected={tab === label}
              onClick={() => setTab(label)}
              sx={tabStyle(tab === label)}
            >
              {label}
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ border: "1px solid #ececef", borderRadius: "14px", backgroundColor: "#fff", overflow: "hidden" }}>
        <Box
          sx={{
            display: { xs: "none", sm: "grid" },
            gridTemplateColumns: GRID,
            gap: 1.75,
            px: 2.25,
            minHeight: 42,
            alignItems: "center",
            borderBottom: "1px solid #f0f0f2",
            color: "#9ba1aa",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: ".06em",
            textTransform: "uppercase",
          }}
        >
          {columns.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </Box>

        <Box sx={{ maxHeight: { xs: "none", md: "min(560px, calc(100dvh - 300px))" }, overflowY: "auto" }}>
          {filtered.length > 0 ? (
            <>
              {filtered.map((request) => {
                const meta = DESIGN_STAGE_META[designStageFor(request.status)];
                const supplier = suppliers.get(request.id)?.factory_name;
                const qty = fieldsFromBrief(request.brief).quantity?.trim();
                return (
                  <Box
                    key={request.id}
                    component="button"
                    type="button"
                    onClick={() => onOpen(request)}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr auto", sm: GRID },
                      gap: { xs: 1, sm: 1.75 },
                      width: "100%",
                      textAlign: "left",
                      alignItems: "center",
                      px: 2.25,
                      py: 1.875,
                      border: 0,
                      borderBottom: "1px solid #f0f0f2",
                      background: "#fff",
                      cursor: "pointer",
                      "&:last-of-type": { borderBottom: 0 },
                      "&:hover": { backgroundColor: "#fcfdfc" },
                      "&:focus-visible": { outline: "3px solid rgba(75,118,87,.32)", outlineOffset: -3 },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, color: "#202936" }}>
                        {request.title}
                      </Typography>
                      <Typography
                        noWrap
                        sx={{ mt: 0.25, fontSize: 11.5, color: "#9ba1aa", fontFamily: "'DM Mono', monospace" }}
                      >
                        {request.case_no}
                        {qty ? ` · ${qty}` : ""}
                      </Typography>
                    </Box>
                    <Typography
                      noWrap
                      sx={{ display: { xs: "none", sm: "block" }, fontSize: 13, color: "#596779" }}
                    >
                      {supplier || "—"}
                    </Typography>
                    <Box sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center", gap: 1 }}>
                      <Box
                        component="span"
                        sx={{ flexShrink: 0, width: 8, height: 8, borderRadius: "999px", backgroundColor: meta.dot }}
                      />
                      <Typography sx={{ fontSize: 13, color: "#596779" }}>{meta.label}</Typography>
                    </Box>
                    <Typography
                      sx={{ display: { xs: "none", sm: "block" }, fontSize: 12, color: "#9ba1aa" }}
                    >
                      {relativeShort(request.updated_at)}
                    </Typography>
                    <Box sx={{ display: "flex", justifyContent: "flex-end", color: "#c5cbd2" }}>
                      <ChevronRight sx={{ fontSize: 16 }} />
                    </Box>
                  </Box>
                );
              })}
              {loadingMore &&
                [0, 1, 2].map((row) => (
                  <Box
                    key={`s-${row}`}
                    aria-busy="true"
                    sx={{
                      display: { xs: "none", sm: "grid" },
                      gridTemplateColumns: GRID,
                      gap: 1.75,
                      px: 2.25,
                      py: 2,
                      alignItems: "center",
                      borderBottom: "1px solid #f0f0f2",
                    }}
                  >
                    <Box>
                      <Skeleton width="78%" />
                      <Skeleton width="40%" />
                    </Box>
                    <Skeleton width="60%" />
                    <Skeleton width="70%" />
                    <Skeleton width="50%" />
                    <span />
                  </Box>
                ))}
              <Box ref={loadMoreSentinel} aria-hidden="true" sx={{ height: hasMore ? 1 : 0 }} />
              {!hasMore && !loadingMore && (
                <Typography sx={{ px: 2.25, py: 2, textAlign: "center", fontSize: 11.5, color: "#9ba1aa" }}>
                  You’ve reached the end — {requests.length} request{requests.length === 1 ? "" : "s"}
                </Typography>
              )}
            </>
          ) : (
            <Box sx={{ display: "grid", placeItems: "center", px: 3, py: 8, textAlign: "center" }}>
              <Box
                sx={{
                  display: "grid",
                  placeItems: "center",
                  width: 44,
                  height: 44,
                  mb: 1.75,
                  borderRadius: "12px",
                  backgroundColor: "#f0f1f3",
                  color: "#9ba1aa",
                }}
              >
                <Inbox sx={{ fontSize: 20 }} />
              </Box>
              <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: "#202936" }}>
                {requests.length === 0 ? "No requests yet" : "No requests match your filters"}
              </Typography>
              {requests.length === 0 ? (
                <Typography sx={{ mt: 1, maxWidth: 320, fontSize: 12.5, color: "#9ba1aa", lineHeight: 1.5 }}>
                  Start from the prompt on Home and your RFQ cases will appear here.
                </Typography>
              ) : (
                <MuiButton
                  onClick={() => {
                    setQuery("");
                    setTab("All");
                  }}
                  sx={{
                    mt: 1.75,
                    height: 36,
                    px: 2,
                    border: "1px solid #ececef",
                    borderRadius: "10px",
                    backgroundColor: "#fff",
                    color: "#596779",
                    fontSize: 12.5,
                    fontWeight: 600,
                    "&:hover": { borderColor: "#c7ccd4", backgroundColor: "#fff" },
                  }}
                >
                  Clear filters
                </MuiButton>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function SettingsRow({
  label,
  value,
  action,
  danger = false,
}: {
  label: string;
  value: string;
  action?: ReactNode;
  danger?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2.5,
        py: 2,
        borderBottom: "1px solid #f0f0f2",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: danger ? "#b74438" : "#202936" }}>
          {label}
        </Typography>
        <Typography sx={{ mt: 0.4, color: "#9ba1aa", fontSize: 12.5, lineHeight: 1.5 }}>
          {value}
        </Typography>
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Box>
  );
}

function WorkspaceSettings({
  profile,
  onEditProfile,
}: {
  profile: WorkspaceProfile;
  onEditProfile: () => void;
}) {
  const [tab, setTab] = useState<"Profile" | "Workspace">("Profile");
  const tabs: Array<"Profile" | "Workspace"> = ["Profile", "Workspace"];
  const outlinedAction = {
    height: 34,
    px: 1.75,
    border: "1px solid #ececef",
    borderRadius: "9px",
    backgroundColor: "#fff",
    color: "#596779",
    fontSize: 12,
    fontWeight: 600,
  } as const;
  return (
    <Box sx={{ width: "100%", maxWidth: 760, mx: "auto" }}>
      <Typography variant="h1" sx={{ fontSize: { xs: 26, sm: 30 }, color: "#202936" }}>
        Settings
      </Typography>
      <Typography sx={{ mt: 0.75, color: "#596779", fontSize: 13.5 }}>
        Manage your profile and workspace.
      </Typography>
      <Box
        role="tablist"
        aria-label="Settings sections"
        sx={{ display: "flex", gap: 0.5, mt: 3, mb: 1, borderBottom: "1px solid #ececef" }}
      >
        {tabs.map((item) => (
          <Box
            key={item}
            component="button"
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            sx={{
              height: 38,
              px: 0.5,
              mb: "-1px",
              border: 0,
              borderBottom: tab === item ? "2px solid #4b7657" : "2px solid transparent",
              background: "transparent",
              color: tab === item ? "#202936" : "#697586",
              font: "inherit",
              fontSize: 13,
              fontWeight: tab === item ? 700 : 600,
              cursor: "pointer",
            }}
          >
            {item}
          </Box>
        ))}
      </Box>
      {tab === "Profile" ? (
        <Box role="tabpanel">
          <SettingsRow
            label="Appearance"
            value="Light mode is active for this sourcing workspace."
          />
          <SettingsRow
            label="E-mail"
            value={profile.email || "Private workspace"}
          />
          <SettingsRow
            label="Personal name"
            value={profile.full_name?.trim() || "Not set"}
            action={
              <MuiButton onClick={onEditProfile} sx={outlinedAction}>
                Edit profile
              </MuiButton>
            }
          />
          <SettingsRow
            label="Two-factor authentication"
            value="Managed with your Atelix sign-in method."
          />
          <SettingsRow
            label="Delete account"
            value="Contact info@arcanawangsa.com to permanently close your workspace and remove your data."
            danger
            action={
              <MuiButton
                component="a"
                href="mailto:info@arcanawangsa.com?subject=Delete%20my%20Atelix%20account"
                sx={{ ...outlinedAction, border: "1px solid #f0d8d4", color: "#b74438", fontWeight: 700 }}
              >
                Contact us
              </MuiButton>
            }
          />
        </Box>
      ) : (
        <Box role="tabpanel">
          <SettingsRow
            label={profile.full_name?.trim() || "Your workspace"}
            value="1 member"
          />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 2 }}>
            <Avatar
              src={profile.avatar_url || undefined}
              slotProps={{ img: { alt: "" } }}
              sx={{ width: 34, height: 34, bgcolor: "#eef4ee", color: "#4b7657", fontSize: 12, fontWeight: 700 }}
            >
              {(profile.full_name?.trim() || "A").slice(0, 1).toUpperCase()}
            </Avatar>
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#202936" }}>
                {profile.full_name?.trim() || "You"} · Owner
              </Typography>
              <Typography sx={{ mt: 0.2, fontSize: 11.5, color: "#9ba1aa" }}>
                {profile.email || "Private workspace"}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}


function DashboardHome({
  isNew,
  onStart,
  onMessage,
  recent,
  onOpenRequest,
}: {
  isNew: boolean;
  onStart: (brief: string, files: UploadFile[]) => Promise<boolean>;
  onMessage: (message: string) => void;
  recent: StoredRfq[];
  onOpenRequest: (item: StoredRfq) => void;
}) {
  const [typing, setTyping] = useState(false);
  const reduceMotion = useReducedMotion();
  void isNew;
  return (
    <Box
      sx={{
        minWidth: 0,
        width: "100%",
        maxWidth: 640,
        mx: "auto",
        pt: { xs: 3, md: 6 },
        pb: 6,
      }}
    >
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h1"
          sx={{
            m: 0,
            overflowWrap: "anywhere",
            fontSize: { xs: 26, sm: 30 },
            lineHeight: 1.12,
            letterSpacing: "-.03em",
            color: "#202936",
          }}
        >
          Start sourcing with Atelix
        </Typography>
        <Typography
          sx={{
            mt: 1,
            maxWidth: "58ch",
            color: "#596779",
            fontSize: { xs: 14, sm: 15 },
            lineHeight: 1.55,
          }}
        >
          Describe what you need, or attach a reference. We turn it into a clear
          RFQ and route it to vetted suppliers.
        </Typography>
      </Box>

      <Box
        aria-hidden={!typing}
        sx={{
          display: "flex",
          justifyContent: "center",
          overflow: "hidden",
          transition: reduceMotion
            ? "none"
            : "max-height 320ms cubic-bezier(.22,1,.36,1), opacity 200ms ease",
          maxHeight: typing ? 380 : 0,
          opacity: typing ? 1 : 0,
          mb: typing ? 1 : 0,
        }}
      >
        {typing && <WorkspaceLottie size={360} />}
      </Box>

      <CleanPromptComposer
        onStart={onStart}
        onMessage={onMessage}
        onTypingChange={setTyping}
      />

      <Box
        sx={{
          overflow: "hidden",
          transition: reduceMotion
            ? "none"
            : "max-height 320ms cubic-bezier(.22,1,.36,1), opacity 200ms ease, margin-top 320ms",
          maxHeight: typing ? 0 : 900,
          opacity: typing ? 0 : 1,
          mt: typing ? 0 : 5,
        }}
      >
        {recent.length > 0 && (
          <>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: "#334155" }}>
                Recent requests
              </Typography>
              <Box
                component="button"
                type="button"
                onClick={() => navigate("/dashboard/requests")}
                sx={{ border: 0, background: "transparent", color: "#697586", font: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", "&:hover": { color: "#4b7657" } }}
              >
                View all
              </Box>
            </Box>
            <Box sx={{ border: "1px solid #ececef", borderRadius: "14px", backgroundColor: "#fff", overflow: "hidden" }}>
              {recent.slice(0, 4).map((item) => (
                <Box
                  key={item.id}
                  component="button"
                  type="button"
                  onClick={() => onOpenRequest(item)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.75,
                    width: "100%",
                    textAlign: "left",
                    px: 2,
                    py: 1.75,
                    border: 0,
                    borderBottom: "1px solid #f0f0f2",
                    background: "#fff",
                    cursor: "pointer",
                    "&:last-of-type": { borderBottom: 0 },
                    "&:hover": { backgroundColor: "#fcfdfc" },
                    "&:focus-visible": { outline: "3px solid rgba(75,118,87,.32)", outlineOffset: -3 },
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 8,
                      height: 8,
                      flexShrink: 0,
                      borderRadius: "50%",
                      backgroundColor: DESIGN_STAGE_META[designStageFor(item.status)].dot,
                    }}
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, color: "#202936" }}>
                      {item.title}
                    </Typography>
                    <Typography sx={{ mt: 0.25, fontSize: 12, color: "#9ba1aa", fontFamily: "'DM Mono', monospace" }}>
                      {item.case_no}
                    </Typography>
                  </Box>
                  <Typography sx={{ flexShrink: 0, fontSize: 12, color: "#9ba1aa" }}>
                    {new Date(item.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </Typography>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Box>
    </Box>
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
  const [profile, setProfile] = useState<WorkspaceProfile>({ full_name: "Workspace", avatar_url: null, email: null });
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const [rfq, setRfq] = useState<{
    record: WorkspaceRfq;
    attachments: RfqAttachment[];
    initialPhase?: RfqPhase;
  } | null>(null);
  const loadHistoryPage = useCallback(async ({ cursor }: { cursor: { updatedAt: string; id: string } | null; signal: AbortSignal }) => listRfqCasesPage({ cursor, limit: 40 }), []);
  const { items: historyItems, setItems: setHistoryItems, loading: historyLoading, loadingMore: historyLoadingMore, hasMore: historyHasMore, loadMore: loadHistory } = useInfiniteList<StoredRfq>("workspace-rfq-requests", loadHistoryPage);
  const [rfqLoading, setRfqLoading] = useState(false);
  const [messageUnreadCount, setMessageUnreadCount] = useState<number | null>(null);
  const refreshMessageUnreadCount = useCallback(() => {
    void getWorkspaceOpsUnreadCount()
      .then((next) => setMessageUnreadCount(next.unread_count))
      .catch(() => setMessageUnreadCount(null));
  }, []);
  useEffect(() => {
    let active = true;
    void getSession()
      .then((session) => {
        if (!active) return;
        if (!session) return;
        void getWorkspaceProfile().then((next) => { if (active) setProfile(next); });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => { refreshMessageUnreadCount(); }, [refreshMessageUnreadCount]);
  const requestDetailId = requestDetailIdFromPath(path);
  const messageCaseId = /^\/dashboard\/messages\/([^/]+)$/.exec(path)?.[1] || null;
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
      : path === "/dashboard/messages" || /^\/dashboard\/messages\/[^/]+$/.test(path)
        ? "messages"
        : path === "/dashboard/invoices" ||
            /^\/dashboard\/invoices\/[^/]+$/.test(path)
          ? "invoices"
          : path === "/dashboard/settings"
            ? "settings"
            : path === "/dashboard/new-product-request" ||
                path === "/dashboard/new-rfq"
              ? "new"
              : "dashboard";
  useEffect(() => {
    if (
      path === "/dashboard/products" ||
      /^\/dashboard\/products(\/|$)/.test(path) ||
      path === "/dashboard/favourites" ||
      path === "/dashboard/library"
    ) {
      history.replaceState({}, "", "/dashboard/requests");
      dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [path]);
  useEffect(() => {
    // Landing on Home or a fresh "new request" clears any open RFQ so the
    // prompt is shown (command-palette / deep-link entry points bypass go()).
    if (
      path === "/dashboard" ||
      path === "/dashboard/new-rfq" ||
      path === "/dashboard/new-product-request"
    ) {
      setRfq(null);
    }
  }, [path]);
  const breadcrumbRoot =
    view === "requests"
      ? "Requests"
      : view === "messages"
        ? "Messages"
        : view === "invoices"
          ? "Invoices"
          : view === "settings"
            ? "Settings"
            : "Home";
  const breadcrumbSub =
    view === "requests" && requestDetailId && rfq ? rfq.record.case_no : "";
  const workspaceOpen = Boolean(
    rfq && (view === "dashboard" || view === "new" || requestDetailId),
  );
  function go(item: (typeof navItems)[number]) {
    setMobileOpen(false);
    if (item.view === "new" || item.view === "requests") setRfq(null);
    navigate(item.href);
  }
  async function startRfq(brief: string, files: UploadFile[]): Promise<boolean> {
    setMessage("");
    try {
      const intake = classifyRfqIntake(brief);
      const initialFields = fieldsFromInitialPrompt(brief, intake);
      const initialBrief = briefFromFields(brief, initialFields, intake);
      const createdRecord = await createRfqCase({
        title: brief.length > 120 ? `${brief.slice(0, 120).trim()}…` : brief,
        brief: initialBrief,
      });
      // The create RPC is authoritative for the RFQ row. Keep the exact
      // buyer-state payload used for that create operation while the route
      // changes so the live document never waits for a subsequent list read
      // or agent turn before showing explicit facts from the first prompt.
      // A later workspace reload still reads the persisted server record.
      const record: WorkspaceRfq = { ...createdRecord, brief: initialBrief };
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
      navigateToDraft(`/dashboard/requests/${encodeURIComponent(record.id)}`);
      return true;
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Could not save your sourcing brief.",
      );
      return false;
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
        <RfqWorkspaceBoundary key={rfq.record.id}>
          <RfqWorkspace
            key={rfq.record.id}
          caseId={rfq.record.id}
          caseNo={rfq.record.case_no}
          brief={summary}
          initialFields={fieldsFromBrief(rfq.record.brief)}
          initialIntake={intakeFromBrief(rfq.record.brief)}
          files={rfq.attachments}
          status={rfq.record.status}
          submittedAt={rfq.record.submitted_at}
          initialRevision={rfq.record.agent_revision ?? 0}
          initialPhase={rfq.initialPhase}
          onMessage={setMessage}
          onAgentDraftPatched={(nextFields, revision, nextIntake) => {
            setRfq((current) =>
              current
                ? {
                    ...current,
                    record: {
                      ...current.record,
                      brief: briefFromFields(summary, nextFields, nextIntake ?? intakeFromBrief(current.record.brief)),
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
                      brief: briefFromFields(summary, nextFields, nextIntake ?? intakeFromBrief(item.brief)),
                      agent_revision: revision,
                    }
                  : item,
              ),
            );
          }}
          />
        </RfqWorkspaceBoundary>
      );
    }
    if (view === "requests")
      return (
        <WorkspaceRequests
          requests={historyItems}
          hasMore={historyHasMore}
          loadingMore={historyLoadingMore}
          onLoadMore={() => { void loadHistory(); }}
          onOpen={(item) => {
            void restoreHistory(item);
          }}
        />
      );
    if (view === "invoices") return <WorkspaceInvoices path={path} />;
    if (view === "messages")
      return <RfqOpsMessagesWorkspace
        selectedCaseId={messageCaseId ? decodeURIComponent(messageCaseId) : null}
        onSelectCase={(caseId) => navigate(`/dashboard/messages/${encodeURIComponent(caseId)}`)}
        unreadCount={messageUnreadCount}
        onUnreadCount={refreshMessageUnreadCount}
      />;
    if (view === "settings")
      return (
        <WorkspaceSettings
          profile={profile}
          onEditProfile={() => setProfileEditorOpen(true)}
        />
      );
    return (
      <DashboardHome
        isNew={view === "new"}
        onStart={startRfq}
        onMessage={setMessage}
        recent={historyItems}
        onOpenRequest={(item) => {
          void restoreHistory(item);
        }}
      />
    );
  }
  return (
    <ThemeProvider theme={dashboardTheme}>
      <CssBaseline />
      <MotionConfig reducedMotion="user">
        <Box
          className="dashboard-root workspace-shell"
          sx={{
            display: "flex",
            width: "100%",
            maxWidth: "100vw",
            minHeight: "100vh",
            height: "100dvh",
            overflowX: "hidden",
            overflowY: "hidden",
            color: "text.primary",
            backgroundColor: "#fbfbfc",
          }}
        >
          {!mobile && (
            <Box
              component="aside"
              className="workspace-shell__navigation"
              sx={{
                width: sidebarCollapsed ? 76 : 264,
                height: "100vh",
                minHeight: 0,
                maxHeight: "100vh",
                flexShrink: 0,
                borderRight: "1px solid #ececef",
                backgroundColor: "#fff",
                transition: "background-color 160ms ease",
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
                profile={profile}
                onEditProfile={() => setProfileEditorOpen(true)}
              />
            </Box>
          )}
          <Box className="workspace-shell__main" sx={{ minWidth: 0, width: 0, flex: 1 }}>
            <Box
              component="header"
              className="workspace-shell__header"
              sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: { xs: 1, sm: 1.75 },
                minWidth: 0,
                width: "100%",
                minHeight: 58,
                px: { xs: 2, sm: 2.75 },
                borderBottom: "1px solid #ececef",
                backgroundColor: "#fff",
              }}
            >
              {mobile && (
                <IconButton
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open navigation"
                  sx={{ flexShrink: 0 }}
                >
                  <MenuIcon />
                </IconButton>
              )}
              <Box
                sx={{
                  display: { xs: "none", sm: "flex" },
                  alignItems: "center",
                  gap: 0.75,
                  minWidth: 0,
                  flexShrink: 0,
                }}
              >
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: "#697586" }}>
                  {breadcrumbRoot}
                </Typography>
                {breadcrumbSub && (
                  <>
                    <ChevronRight sx={{ fontSize: 15, color: "#9ba1aa" }} />
                    <Typography
                      noWrap
                      sx={{ fontSize: 13.5, fontWeight: 600, color: "#202936", fontFamily: "'DM Mono', monospace" }}
                    >
                      {breadcrumbSub}
                    </Typography>
                  </>
                )}
              </Box>
              <Box sx={{ flex: 1, display: "flex", justifyContent: "center", px: { xs: 1, sm: 2 } }}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  aria-label="Search everything"
                  aria-keyshortcuts="Meta+K Control+K"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    width: "100%",
                    maxWidth: 420,
                    height: 38,
                    px: 1.5,
                    border: "1px solid #ececef",
                    borderRadius: "11px",
                    backgroundColor: "#fbfbfc",
                    color: "#9ba1aa",
                    font: "inherit",
                    cursor: "pointer",
                    "&:hover": { borderColor: "#c7ccd4" },
                    "&:focus-visible": { outline: "3px solid rgba(75,118,87,.32)", outlineOffset: 1 },
                  }}
                >
                  <Search sx={{ fontSize: 17 }} />
                  <Box component="span" sx={{ flex: 1, textAlign: "left", fontSize: 13 }}>
                    Search everything…
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      display: { xs: "none", sm: "flex" },
                      alignItems: "center",
                      gap: 0.25,
                      color: "#9ba1aa",
                      fontSize: 11,
                    }}
                  >
                    <KeyboardCommandKey sx={{ fontSize: 12 }} />K
                  </Box>
                </Box>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                <NotificationBell mode="buyer" onNavigate={navigate} />
              </Box>
            </Box>
            <Box
              component="main"
              className="workspace-shell__content"
              id="main"
              sx={{
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                ...(view === "messages"
                  ? {
                      overflowY: { xs: "auto", md: "hidden" },
                      display: "flex",
                      flexDirection: "column",
                    }
                  : {}),
              }}
            >
              {view === "messages" ? (
                content()
              ) : (
                <Box
                  sx={{
                    width: "100%",
                    maxWidth: workspaceOpen
                      ? "none"
                      : {
                            xs: "calc(100vw - 32px)",
                            sm: "min(1060px, calc(100% - 48px))",
                          },
                    px: workspaceOpen ? { xs: 2, sm: 3, md: 4 } : 0,
                    mx: "auto",
                    py: { xs: 3, sm: 4, md: 5 },
                    boxSizing: "border-box",
                  }}
                >
                  {content()}
                </Box>
              )}
            </Box>
            {message && (
              <Box
                role="status"
                aria-live="polite"
                sx={{
                  position: "fixed",
                  right: { xs: 16, sm: 24 },
                  bottom: 20,
                  zIndex: 1200,
                  maxWidth: { xs: "calc(100vw - 32px)", sm: 420 },
                  px: 1.25,
                  py: 1,
                  borderRadius: "14px",
                  backgroundColor: "#4F795B",
                  color: "#fff",
                  boxShadow: "0 12px 28px rgba(52, 93, 65, .24)",
                }}
              >
                <Stack
                  direction="row"
                  spacing={1.1}
                  sx={{ alignItems: "center" }}
                >
                  <CheckCircle sx={{ fontSize: 19, flex: "0 0 auto" }} />
                  <Typography sx={{ fontSize: 13.5, fontWeight: 650, lineHeight: 1.35, color: "inherit" }}>
                    {message}
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label="Dismiss notification"
                    onClick={() => setMessage("")}
                    sx={{ ml: "auto", width: 36, height: 36, color: "#fff", "&:hover": { backgroundColor: "rgba(255,255,255,.14)" }, "&:focus-visible": { outline: "2px solid #fff", outlineOffset: 2 } }}
                  >
                    <Close fontSize="small" />
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
                profile={profile}
                onEditProfile={() => setProfileEditorOpen(true)}
              />
            </Box>
          </Drawer>
          <WorkspaceCommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            recent={historyItems.slice(0, 6).map((item) => ({
              id: item.id,
              title: item.title,
              case_no: item.case_no,
            }))}
            onNavigate={navigate}
          />
          <ProfileMenu
            hideTrigger
            profile={profile}
            onProfileChange={setProfile}
            editOpen={profileEditorOpen}
            onEditOpenChange={setProfileEditorOpen}
          />
        </Box>
      </MotionConfig>
    </ThemeProvider>
  );
}
