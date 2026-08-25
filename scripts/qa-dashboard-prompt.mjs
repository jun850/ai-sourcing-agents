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

const forbidden = [
  ["clean prompt bordered surface", /border:\s*["']1px solid/ , cleanPrompt],
  ["conversation bordered surface", /border:\s*["']1px solid/ , conversation],
  ["clean prompt green focus outline", /\.clean-prompt-form \.MuiPaper-root:focus-within\s*\{\s*outline:/, responsive],
  ["conversation green focus outline", /\.conversation-composer:focus-within\s*\{\s*outline:/, responsive],
];

for (const [label, pattern, source] of forbidden) {
  if (pattern.test(source)) {
    console.error(`fail - ${label}`);
    process.exit(1);
  }
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

console.log("ok - dashboard prompt and authenticated composer remain borderless");
