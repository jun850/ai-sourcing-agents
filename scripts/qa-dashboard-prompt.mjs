import { readFile } from "node:fs/promises";

const dashboard = await readFile("src/dashboard.tsx", "utf8");
const responsive = await readFile("src/responsive-a11y.css", "utf8");
const cleanPrompt = dashboard.slice(
  dashboard.indexOf("function CleanPromptComposer"),
  dashboard.indexOf("function ConversationChatPanel"),
);
const conversationStart = dashboard.indexOf('className="conversation-composer"');
const conversation = dashboard.slice(
  conversationStart,
  dashboard.indexOf('component="textarea"', conversationStart),
);
const conversationPanel = dashboard.slice(
  dashboard.indexOf("function ConversationChatPanel"),
  dashboard.indexOf("function RfqField"),
);

const forbidden = [
  ["clean prompt bordered surface", /border:\s*["']1px solid/ , cleanPrompt],
  ["conversation bordered surface", /border:\s*["']1px solid/ , conversation],
  ["clean prompt green focus outline", /\.clean-prompt-form \.MuiPaper-root:focus-within\s*\{\s*outline:/, responsive],
  ["conversation green focus outline", /\.conversation-composer:focus-within\s*\{\s*outline:/, responsive],
  ["conversation assistant bubble has no bounded visual surface", /message\.from === "You" \? "#f0f1f3" : "transparent"/, conversationPanel],
];

for (const [label, pattern, source] of forbidden) {
  if (pattern.test(source)) {
    console.error(`fail - ${label}`);
    process.exit(1);
  }
}

if (dashboard.includes("Thanks — I’m building this RFQ from the details you shared.")) {
  console.error("fail - opening RFQ uses a canned assistant acknowledgement");
  process.exit(1);
}

for (const selector of [
  ".clean-prompt-form .MuiPaper-root",
  ".conversation-composer",
]) {
  if (!responsive.includes(selector)) {
    console.error(`fail - missing borderless override: ${selector}`);
    process.exit(1);
  }
}

for (const [label, expected] of [
  ["conversation panel remains viewport-bounded on desktop", 'md: "min(720px, calc(100dvh - 220px))"'],
  ["conversation panel remains visible beside a long RFQ", 'position: { md: "sticky" }'],
  ["conversation history announces new messages", 'aria-relevant="additions text"'],
  ["informational agent status stays out of the composer area", 'status && status.tone !== "info"'],
  ["first dashboard prompt is hydrated before route change", "const record: WorkspaceRfq = { ...createdRecord, brief: initialBrief };"],
  ["initial extraction retains ounce-based textile weights", "oz|ounces"],
  ["initial extraction normalizes common buyer shorthand", "normaliseBuyerPrompt"],
  ["initial extraction accepts a quantity-first target budget", "per)\\s*(?:pieces?|pcs?|units?)"],
]) {
  if (!dashboard.includes(expected) && !conversationPanel.includes(expected)) {
    console.error(`fail - missing ${label}`);
    process.exit(1);
  }
}

console.log("ok - dashboard prompt, conversation visibility, and authenticated composer remain hardened");
