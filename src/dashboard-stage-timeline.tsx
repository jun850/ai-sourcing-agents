import { Box, Typography } from "@mui/material";
import { Check } from "@mui/icons-material";

export type RfqStatus =
  | "draft"
  | "needs_research"
  | "awaiting_supplier"
  | "supplier_replied"
  | "buyer_review"
  | "quote_selected"
  | "in_production"
  | "closed";

type StageState = "done" | "current" | "upcoming";

type Stage = {
  key: string;
  label: string;
  owner: string;
  detail?: string;
};

const STAGES: Stage[] = [
  { key: "brief", label: "Brief received", owner: "You" },
  { key: "structured", label: "RFQ structured", owner: "Atelix agent" },
  { key: "approval", label: "Your approval", owner: "Waiting on you" },
  { key: "review", label: "Atelix review", owner: "Atelix ops · typically within 1 business day" },
  { key: "outreach", label: "Supplier outreach", owner: "Atelix ops" },
  { key: "quotes", label: "Quotes normalised", owner: "Atelix ops" },
  { key: "invoice", label: "Invoice & payment", owner: "You · Stripe-settled" },
];

/** Index (0-based) of the stage the case currently sits at; stages before it are done, after are upcoming. Closed cases are treated as fully complete. */
export function currentStageIndex(status: string): number {
  switch (status as RfqStatus) {
    case "draft": return 2;
    case "needs_research": return 3;
    case "awaiting_supplier":
    case "supplier_replied": return 4;
    case "buyer_review": return 5;
    case "quote_selected":
    case "in_production": return 6;
    case "closed": return STAGES.length;
    default: return 0;
  }
}

export function nextStepOwner(status: string, invoiceUnpaid?: boolean): string {
  switch (status as RfqStatus) {
    case "draft": return "You";
    case "needs_research":
    case "awaiting_supplier":
    case "supplier_replied": return "Atelix ops";
    case "buyer_review": return "You";
    case "quote_selected": return "Atelix ops";
    case "in_production": return invoiceUnpaid ? "You" : "Atelix ops";
    case "closed": return "—";
    default: return "—";
  }
}

function stageState(index: number, current: number): StageState {
  if (index < current) return "done";
  if (index === current) return "current";
  return "upcoming";
}

function StageDot({ state }: { state: StageState }) {
  if (state === "done") return <Box sx={{ display: "grid", placeItems: "center", width: 20, height: 20, borderRadius: "50%", backgroundColor: "#4b7657", color: "#fff", flexShrink: 0 }}><Check sx={{ fontSize: 14 }} /></Box>;
  if (state === "current") return <Box sx={{ display: "grid", placeItems: "center", width: 20, height: 20, border: "2px solid #4b7657", borderRadius: "50%", backgroundColor: "#fff", flexShrink: 0 }}><Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#4b7657" }} /></Box>;
  return <Box sx={{ width: 20, height: 20, border: "2px solid #e0e4e9", borderRadius: "50%", backgroundColor: "#fff", flexShrink: 0 }} />;
}

/** Full 7-step stage rail, used in the Requests timeline rail (1c) and the RFQ workspace's Timeline tab (1a). */
export function StageTimeline({ status, onReviewDraft }: { status: string; onReviewDraft?: () => void }) {
  const current = currentStageIndex(status);
  return <Box sx={{ display: "grid", gap: 0 }}>
    {STAGES.map((stage, index) => {
      const state = stageState(index, current);
      const last = index === STAGES.length - 1;
      return <Box key={stage.key} sx={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr)", columnGap: 1.5 }}>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <StageDot state={state} />
          {!last && <Box sx={{ flex: 1, width: "2px", minHeight: 20, backgroundColor: state === "done" ? "#dfe8e1" : "#eef0f3" }} />}
        </Box>
        <Box sx={{ pb: last ? 0 : 2.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: state === "upcoming" ? "#9aa4b0" : "#202936" }}>{stage.label}</Typography>
          <Typography sx={{ mt: .35, fontSize: 11.5, fontWeight: state === "current" ? 600 : 400, color: state === "current" ? "#4b7657" : state === "upcoming" ? "#b6bdc6" : "#758091" }}>{stage.owner}</Typography>
          {state === "current" && stage.key === "approval" && onReviewDraft && <Box component="button" type="button" onClick={onReviewDraft} sx={{ mt: 1.1, px: 1.75, py: 1, border: 0, borderRadius: 1.25, backgroundColor: "#4b7657", color: "#fff", font: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", "&:hover": { backgroundColor: "#3d6548" } }}>Review draft</Box>}
        </Box>
      </Box>;
    })}
  </Box>;
}

const MINI_STAGES = [
  { key: "submitted", label: "Submitted" },
  { key: "review", label: "Atelix review" },
  { key: "outreach", label: "Supplier outreach" },
  { key: "quotes", label: "Quotes for your decision" },
] as const;

function miniStageIndex(status: string): number {
  switch (status as RfqStatus) {
    case "needs_research": return 1;
    case "awaiting_supplier":
    case "supplier_replied": return 2;
    case "buyer_review":
    case "quote_selected":
    case "in_production":
    case "closed": return 3;
    default: return 0;
  }
}

/** Compact 4-step "what happens next" rail used on the post-submit matching screen (1d). */
export function MiniStageTimeline({ status }: { status: string }) {
  const current = miniStageIndex(status);
  return <Box sx={{ display: "grid", gap: 0 }}>
    {MINI_STAGES.map((stage, index) => {
      const state = stageState(index, current);
      const last = index === MINI_STAGES.length - 1;
      return <Box key={stage.key} sx={{ display: "grid", gridTemplateColumns: "16px minmax(0,1fr)", columnGap: 1.35 }}>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Box sx={{ display: "grid", placeItems: "center", width: 16, height: 16, borderRadius: "50%", flexShrink: 0, backgroundColor: state === "done" ? "#4b7657" : "#fff", border: state === "current" ? "2px solid #4b7657" : state === "done" ? "0" : "2px solid #e0e4e9" }}>
            {state === "done" && <Check sx={{ fontSize: 12, color: "#fff" }} />}
            {state === "current" && <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#4b7657" }} />}
          </Box>
          {!last && <Box sx={{ flex: 1, width: "2px", minHeight: 16, backgroundColor: state === "done" ? "#dfe8e1" : "#eef0f3" }} />}
        </Box>
        <Box sx={{ pb: last ? 0 : 1.75 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: state === "upcoming" ? "#9aa4b0" : "#202936" }}>{stage.label}</Typography>
          {state === "current" && <Typography sx={{ mt: .25, fontSize: 11.5, fontWeight: 600, color: "#4b7657" }}>In progress</Typography>}
        </Box>
      </Box>;
    })}
  </Box>;
}
