import { readFileSync } from "node:fs";

const files = {
  dashboard: readFileSync("src/dashboard.tsx", "utf8"),
  messages: readFileSync("src/rfq-ops-messages.tsx", "utf8"),
  supabase: readFileSync("src/supabase.ts", "utf8"),
  responsive: readFileSync("src/responsive-a11y.css", "utf8"),
  product: readFileSync("PRODUCT.md", "utf8"),
  design: readFileSync("DESIGN.md", "utf8"),
};

const checks = [
  ["dashboard shell owns viewport height", files.dashboard.includes('height: "100dvh"')],
  ["main workspace owns vertical scrolling", files.responsive.includes(".workspace-shell__content") && files.responsive.includes("overflow-y: auto")],
  ["dashboard request cursor contract exists", files.supabase.includes("listRfqCasesPage") && files.dashboard.includes("IntersectionObserver")],
  ["RFQ Operations conversation cursor appends", files.messages.includes("conversationCursor") && files.messages.includes("loadConversations(true)")],
  ["chat does not unconditionally jump to bottom", !files.dashboard.includes("node.scrollTop = node.scrollHeight")],
  ["shell avoids width layout animation", !files.dashboard.includes('transition: "width 220ms ease"')],
  ["sourcing-agent product rule is documented", files.product.includes("not marketplace") && files.design.includes("never as a marketplace")],
  ["borderless prompt contract remains", files.responsive.includes(".conversation-composer:focus-within") && files.responsive.includes("border: 0 !important")],
];

let failed = 0;
for (const [label, passed] of checks) {
  if (passed) console.log(`ok - ${label}`);
  else { failed += 1; console.error(`not ok - ${label}`); }
}
if (failed) process.exitCode = 1;
else console.log(`\n${checks.length} workspace scroll/loading contract checks passed.`);
