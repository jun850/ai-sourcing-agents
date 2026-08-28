export type IntakeSubtype = "wholesale" | "blank" | "private_label" | "white_label" | "cmt" | "fabric" | "leather" | "buttons_trims_labels" | "unclassified";

export function classifyIntake(message: string) {
  const text = message.toLowerCase();
  const subtype: IntakeSubtype = /\b(private label|private-label|oem)\b/.test(text) ? "private_label"
    : /\b(white label|white-label)\b/.test(text) ? "white_label"
    : /\b(cmt|cut[ -]?make[ -]?trim)\b/.test(text) ? "cmt"
    : /\b(leather|suede|nubuck)\b/.test(text) ? "leather"
    : /\b(buttons?|zippers?|zip|trims?|labels?|hangtags?)\b/.test(text) ? "buttons_trims_labels"
    : /\b(fabric|textile|yardage|gsm|oz\b|woven|knit)\b/.test(text) ? "fabric"
    : /\b(blank|unbranded)\b/.test(text) ? "blank"
    : /\b(wholesale|stock product|ready made|ready-made)\b/.test(text) ? "wholesale" : "unclassified";
  const route = ["wholesale", "blank", "private_label", "white_label"].includes(subtype) ? "finished_goods" : subtype === "unclassified" ? "unclassified" : "production_or_materials";
  return { route, subtype, confidence: subtype === "unclassified" ? "low" : "high" };
}

export function immediateQuestion(subtype: IntakeSubtype) {
  if (subtype === "unclassified") return "Are you sourcing finished goods, CMT production, fabric, leather, or trims such as buttons and labels?";
  if (subtype === "cmt") return "Do you have a tech pack or pattern, and will you supply the materials?";
  if (subtype === "fabric") return "What fibre, construction, weight, width, and quantity do you need?";
  if (subtype === "leather") return "What leather type, thickness, finish, dimensions, and quantity do you need?";
  if (subtype === "buttons_trims_labels") return "What component, material, dimensions, finish, and quantity do you need?";
  if (subtype === "private_label" || subtype === "white_label") return "What item, reference, quantity, branding, and delivery timeline should we record?";
  return "What item, quantity, delivery destination, and timeline should we record?";
}
