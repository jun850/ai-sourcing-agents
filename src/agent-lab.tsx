import { useMemo, useState } from "react";
import {
  ArrowForward,
  CheckCircleOutlined,
  FactCheckOutlined,
  GroupsOutlined,
  SmartToyOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

type Lens = "all" | "ops" | "suppliers";
type Idea = {
  id: string;
  lens: Exclude<Lens, "all">;
  title: string;
  summary: string;
  agent: string;
  evidence: string;
  approval: string;
  handoff: string;
  horizon: "Now" | "Next" | "Later";
};

const ideas: Idea[] = [
  {
    id: "rfq-compiler",
    lens: "ops",
    title: "RFQ compiler",
    summary: "Turn a buyer brief, tech pack, and references into an editable requirement packet, then ask only for material gaps.",
    agent: "Extracts stated requirements and proposes clarification questions.",
    evidence: "Every field retains its source: buyer-stated, attachment-extracted, or missing.",
    approval: "Atelix Ops approves the RFQ packet before any supplier outreach.",
    handoff: "Reviewed RFQ → matching queue",
    horizon: "Now",
  },
  {
    id: "match-dossier",
    lens: "ops",
    title: "Supplier match dossier",
    summary: "Prepare one comparable, evidence-backed dossier per potential supplier instead of an opaque recommendation.",
    agent: "Checks fit against structured requirements and surfaces conflicts or missing proof.",
    evidence: "Capability records, provenance, verification date, and open questions travel with the dossier.",
    approval: "Ops releases a reviewed shortlist to the buyer.",
    handoff: "Approved shortlist → supplier RFQ draft",
    horizon: "Now",
  },
  {
    id: "outreach-copilot",
    lens: "ops",
    title: "Outreach & follow-up copilot",
    summary: "Draft supplier RFQs, follow-ups, and reply summaries from the approved case context.",
    agent: "Creates a proposed message and a due-date-aware follow-up task.",
    evidence: "The exact source fields and attachments are attached to each draft.",
    approval: "A named operator reviews and sends every external message.",
    handoff: "Approved send → immutable supplier conversation",
    horizon: "Next",
  },
  {
    id: "supplier-onboarding",
    lens: "suppliers",
    title: "Guided supplier onboarding",
    summary: "Let suppliers build a private capability profile and submit documents without becoming a public storefront.",
    agent: "Extracts candidate fields from submitted documents and flags incomplete or conflicting details.",
    evidence: "Original documents remain linked; extracted values stay proposed until reviewed.",
    approval: "Supplier Operations verifies the record before it is usable for matching.",
    handoff: "Verified profile → private supplier network",
    horizon: "Next",
  },
  {
    id: "quote-normalizer",
    lens: "suppliers",
    title: "Quote & evidence normalizer",
    summary: "Convert supplier replies into a comparable quote packet while preserving the original response and exceptions.",
    agent: "Extracts supplied terms, highlights missing fields, and compares like-for-like assumptions.",
    evidence: "Each displayed term points back to the supplier reply, document, or an explicit unknown state.",
    approval: "Ops validates the normalized packet before buyer review.",
    handoff: "Reviewed quotes → buyer decision",
    horizon: "Next",
  },
  {
    id: "exception-brief",
    lens: "suppliers",
    title: "Production exception brief",
    summary: "Turn supplier updates, QC findings, and logistics exceptions into a concise mitigation draft for the case owner.",
    agent: "Detects a change, compiles the known facts, and drafts options without selecting one.",
    evidence: "Supplier update, inspection record, and timing impact stay visible together.",
    approval: "Ops chooses the response; the buyer approves any material commercial or timeline change.",
    handoff: "Approved decision → supplier and buyer update",
    horizon: "Later",
  },
];

const filters: Array<{ value: Lens; label: string }> = [
  { value: "all", label: "All ideas" },
  { value: "ops", label: "Atelix Ops" },
  { value: "suppliers", label: "Supplier network" },
];

export function AgentLab() {
  const [lens, setLens] = useState<Lens>("all");
  const visibleIdeas = useMemo(
    () => ideas.filter((idea) => lens === "all" || idea.lens === lens),
    [lens],
  );

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h2" sx={{ fontSize: { xs: 28, sm: 34 } }}>
          Agent Lab
        </Typography>
        <Typography sx={{ mt: 0.75, maxWidth: 760, color: "text.secondary", fontSize: 14, lineHeight: 1.6 }}>
          A working roadmap for agents that prepare the work, keep evidence attached,
          and stop at a named human decision. These are hypotheses for review—not
          autonomous commitments.
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, border: "1px solid #dfe4eb", borderRadius: "14px", backgroundColor: "#fff" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 800 }}>
              The operating rule
            </Typography>
            <Typography sx={{ mt: 0.45, color: "text.secondary", fontSize: 13, lineHeight: 1.55 }}>
              Let agents collect, structure, compare, and draft. Let people approve outreach,
              commercial terms, supplier visibility, and every material exception.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flex: "0 0 auto", alignItems: "center", color: "#526176" }} aria-label="Agent operating sequence">
            <SmartToyOutlined aria-hidden="true" fontSize="small" />
            <ArrowForward aria-hidden="true" fontSize="small" />
            <FactCheckOutlined aria-hidden="true" fontSize="small" />
            <ArrowForward aria-hidden="true" fontSize="small" />
            <GroupsOutlined aria-hidden="true" fontSize="small" />
          </Stack>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1} role="tablist" aria-label="Agent Lab focus">
        {filters.map((filter) => (
          <Button
            key={filter.value}
            role="tab"
            aria-selected={lens === filter.value}
            variant={lens === filter.value ? "contained" : "outlined"}
            onClick={() => setLens(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </Stack>

      <Box component="section" aria-label="Agent roadmap ideas" sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" } }}>
        {visibleIdeas.map((idea) => (
          <Paper key={idea.id} elevation={0} sx={{ display: "flex", flexDirection: "column", p: { xs: 2, sm: 2.5 }, border: "1px solid #dfe4eb", borderRadius: "14px", backgroundColor: "#fff" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h3" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25 }}>
                  {idea.title}
                </Typography>
                <Typography sx={{ mt: 0.65, color: "text.secondary", fontSize: 13, lineHeight: 1.55 }}>
                  {idea.summary}
                </Typography>
              </Box>
              <Chip label={idea.horizon} size="small" variant="outlined" sx={{ flex: "0 0 auto", fontWeight: 700 }} />
            </Stack>
            <Stack spacing={1.1} sx={{ mt: 2, pt: 1.75, borderTop: "1px solid #e8ecf1" }}>
              <RoadmapRow label="Agent does" detail={idea.agent} />
              <RoadmapRow label="Evidence" detail={idea.evidence} />
              <RoadmapRow label="Human gate" detail={idea.approval} />
            </Stack>
            <Box sx={{ mt: "auto", pt: 1.75, display: "flex", alignItems: "center", gap: 0.8, color: "#4b7657" }}>
              <CheckCircleOutlined aria-hidden="true" sx={{ fontSize: 17 }} />
              <Typography sx={{ fontSize: 12, fontWeight: 800 }}>{idea.handoff}</Typography>
            </Box>
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}

function RoadmapRow({ label, detail }: { label: string; detail: string }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "104px minmax(0, 1fr)" }, gap: { xs: 0.2, sm: 1 }, alignItems: "baseline" }}>
      <Typography sx={{ color: "#526176", fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Typography sx={{ color: "text.secondary", fontSize: 12, lineHeight: 1.45 }}>{detail}</Typography>
    </Box>
  );
}
