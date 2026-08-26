import { Box, Button, Typography } from "@mui/material";
import { Check, ArrowForward } from "@mui/icons-material";
import { motion, useReducedMotion } from "framer-motion";

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

export function miniStageIndex(status: string): number {
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

type PipelineStage = {
  key: string;
  label: string;
  owner: string;
  activeOwner: string;
  timing: string;
};

const PIPELINE_STAGES: PipelineStage[] = [
  { key: "submitted", label: "Submitted", owner: "You · just now", activeOwner: "You · just now", timing: "RFQ saved in Requests" },
  { key: "review", label: "Atelix review", owner: "Atelix ops", activeOwner: "Atelix ops · in progress", timing: "1–2 business days" },
  { key: "outreach", label: "Supplier outreach", owner: "Atelix ops", activeOwner: "Atelix ops · in progress", timing: "1–5 business days" },
  { key: "quotes", label: "Quotes for your decision", owner: "Waiting on you", activeOwner: "Waiting on you", timing: "" },
];

function PipelineStageMarker({ state, reduceMotion }: { state: StageState; reduceMotion: boolean }) {
  if (state === "done") {
    return <Box sx={{ display: "grid", placeItems: "center", width: 56, height: 56, borderRadius: "50%", backgroundColor: "#4b7657", border: "2px solid #4b7657", color: "#fff" }}>
      <Check sx={{ fontSize: 22 }} />
    </Box>;
  }
  if (state === "current") {
    return <Box sx={{ position: "relative", display: "grid", placeItems: "center", width: 56, height: 56, borderRadius: "50%", backgroundColor: "#fff", border: "2px solid #4b7657" }}>
      {!reduceMotion && [0, 1.4].map((delay) => (
        <motion.span
          key={delay}
          aria-hidden="true"
          style={{ position: "absolute", inset: -2, border: "2px solid #4b7657", borderRadius: "50%" }}
          animate={{ scale: [1, 2.3], opacity: [0.5, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeOut", delay }}
        />
      ))}
      <Box sx={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: "#4b7657" }} />
    </Box>;
  }
  return <Box sx={{ display: "grid", placeItems: "center", width: 56, height: 56, borderRadius: "50%", backgroundColor: "#fff", border: "2px solid #e6e9ec" }}>
    <Box sx={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: "#d7dbe0" }} />
  </Box>;
}

/** Full-width "RFQ sent" holding screen shown right after submission, before the buyer tracks the request. Progress reflects the case's real server status, not a simulated timer. */
export function RfqReviewPipeline({
  caseNo,
  status,
  onTrack,
}: {
  caseNo: string;
  status: string;
  onTrack: () => void;
}) {
  const current = Math.max(1, miniStageIndex(status));
  const reduceMotion = Boolean(useReducedMotion());
  return <Box>
    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 3, flexWrap: "wrap", mb: { xs: 3, md: 4.5 } }}>
      <Box sx={{ maxWidth: 640 }}>
        <Typography sx={{ mb: 1, fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#7f8d84" }}>
          Request {caseNo} · sent
        </Typography>
        <Typography variant="h1" sx={{ mb: 1, fontSize: { xs: 26, md: 34 }, lineHeight: 1.15, fontWeight: 700, letterSpacing: "-.02em", color: "#121714" }}>
          We're reviewing your RFQ
        </Typography>
        <Typography sx={{ fontSize: { xs: 14.5, md: 15.5 }, lineHeight: 1.55, color: "#536059" }}>
          Nothing else is needed from you. An Atelix reviewer confirms the shortlist against your compliance requirements before any supplier is contacted.
        </Typography>
      </Box>
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1.1, px: 2, py: 1.1, border: "1px solid #dfe5e0", borderRadius: "999px", backgroundColor: "#fff", flexShrink: 0 }}>
        <motion.span
          aria-hidden="true"
          style={{ width: 7, height: 7, borderRadius: "50%", background: "#4b7657" }}
          animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#1d5a3c" }}>In progress</Typography>
      </Box>
    </Box>

    <Box sx={{ p: { xs: 3, md: 5 }, pb: { xs: 2.5, md: 3.5 }, border: "1px solid #e6ebe6", borderRadius: "20px", backgroundColor: "#fff" }}>
      <Box sx={{ position: "relative" }}>
        <Box aria-hidden="true" sx={{ position: "absolute", top: 27, left: "12.5%", right: "12.5%", display: "flex", zIndex: 0 }}>
          {PIPELINE_STAGES.slice(0, -1).map((stage, index) => {
            const segmentActive = index === current - 1;
            const segmentDone = index < current - 1;
            return <Box key={stage.key} sx={{ position: "relative", flex: 1, height: "2px", backgroundColor: segmentDone || segmentActive ? "#cfe0d3" : "#eef0f3" }}>
              {segmentActive && !reduceMotion && [0, 1.7].map((delay) => (
                <motion.span
                  key={delay}
                  style={{ position: "absolute", top: -3, marginLeft: -4, width: 8, height: 8, borderRadius: "50%", background: "#4b7657" }}
                  animate={{ left: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 3.4, repeat: Infinity, ease: "linear", delay, times: [0, 0.12, 0.84, 1] }}
                />
              ))}
            </Box>;
          })}
        </Box>

        <Box sx={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", columnGap: { xs: 1.5, md: 3 } }}>
          {PIPELINE_STAGES.map((stage, index) => {
            const state = stageState(index, current);
            return <Box key={stage.key} sx={{ display: "grid", justifyItems: "center", textAlign: "center" }}>
              <PipelineStageMarker state={state} reduceMotion={reduceMotion} />
              <Typography sx={{ mt: 2.75, px: 1, fontSize: { xs: 12.5, md: 15 }, lineHeight: 1.3, fontWeight: 700, color: state === "upcoming" ? "#9aa4b0" : "#121714" }}>
                {stage.label}
              </Typography>
              <Typography sx={{ mt: 0.9, fontSize: { xs: 11, md: 13 }, lineHeight: 1.4, fontWeight: state === "current" ? 700 : 500, color: state === "current" ? "#4b7657" : state === "done" ? "#758091" : "#b6bdc6" }}>
                {state === "current" ? stage.activeOwner : stage.owner}
              </Typography>
              {stage.timing && <Typography sx={{ mt: 0.9, fontSize: 11.5, lineHeight: 1.4, color: state === "upcoming" ? "#b6bdc6" : "#7f8d84" }}>
                {stage.timing}
              </Typography>}
            </Box>;
          })}
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, flexWrap: "wrap", mt: { xs: 4, md: 5 }, pt: 3.5, borderTop: "1px solid #eef0f3" }}>
        <Typography sx={{ maxWidth: 460, fontSize: 13.5, lineHeight: 1.5, color: "#7f8d84" }}>
          You'll be notified via Message for the next step within 48 hours.
        </Typography>
        <Button
          onClick={onTrack}
          endIcon={<ArrowForward />}
          variant="contained"
          sx={{ borderRadius: "999px", px: 3.5, py: 1.5, backgroundColor: "#1d5a3c", fontSize: 15, fontWeight: 700, textTransform: "none", "&:hover": { backgroundColor: "#16472f" } }}
        >
          Track this request
        </Button>
      </Box>
    </Box>
  </Box>;
}
