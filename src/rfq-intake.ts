export type IntakeRoute = "finished_goods" | "production_or_materials" | "unclassified";
export type IntakeSubtype = "wholesale" | "blank" | "private_label" | "white_label" | "cmt" | "fabric" | "leather" | "buttons_trims_labels" | "unclassified";
export type IntakeFieldState = "provided" | "missing" | "not_applicable";
export type IntakeField = { key: string; label: string; state: IntakeFieldState; value: string };
export type RfqIntakeItem = { id: string; subtype: IntakeSubtype; fields: IntakeField[] };
export type RfqIntake = { route: IntakeRoute; subtype: IntakeSubtype; confidence: "high" | "medium" | "low"; items: RfqIntakeItem[] };

type ProfileField = readonly [key: string, label: string, optional?: boolean];
const COMMON: ProfileField[] = [["item", "Item"], ["quantity", "Quantity"], ["timeline", "Timeline", true]];
const PROFILES: Record<Exclude<IntakeSubtype, "unclassified">, ProfileField[]> = {
  wholesale: [...COMMON, ["destination", "Delivery destination"], ["brand_requirement", "Branding requirement", true]],
  blank: [...COMMON, ["color", "Color", true], ["size_range", "Size range", true], ["brand_requirement", "Branding requirement", true]],
  private_label: [...COMMON, ["reference", "Reference or product direction"], ["material_construction", "Material or construction"], ["branding", "Branding"], ["size_color_scope", "Sizes and colors", true]],
  white_label: [...COMMON, ["reference", "Reference or product direction"], ["material_construction", "Material or construction", true], ["branding", "Branding"], ["size_color_scope", "Sizes and colors", true]],
  cmt: [...COMMON, ["tech_pack", "Tech pack or pattern status"], ["materials_supply", "Materials supplied or to procure"], ["stage", "Sample or bulk stage"]],
  fabric: [["material", "Fibre or material"], ["construction", "Knit or woven construction"], ["weight", "Weight"], ["width", "Width"], ["finish", "Finish", true], ["color_print", "Color or print", true], ["quantity", "Quantity and unit"], ["intended_use", "Intended use"]],
  leather: [["material", "Leather or material type"], ["thickness", "Thickness"], ["finish", "Finish"], ["color", "Color", true], ["dimensions", "Dimensions"], ["quantity", "Quantity and unit"], ["intended_use", "Intended use"]],
  buttons_trims_labels: [["component", "Component type"], ["material", "Material"], ["dimensions", "Dimensions"], ["finish_color", "Finish or color", true], ["function", "Function or attachment", true], ["quantity", "Quantity and unit"], ["reference", "Reference", true]],
};

function includes(text: string, pattern: RegExp) { return pattern.test(text); }
export function classifyRfqIntake(prompt: string): RfqIntake {
  const text = prompt.toLowerCase();
  const subtype: IntakeSubtype = includes(text, /\b(private label|private-label|oem)\b/) ? "private_label"
    : includes(text, /\b(white label|white-label)\b/) ? "white_label"
    : includes(text, /\b(cmt|cut[ -]?make[ -]?trim)\b/) ? "cmt"
    : includes(text, /\b(leather|suede|nubuck)\b/) ? "leather"
    : includes(text, /\b(buttons?|zippers?|zip|trims?|labels?|hangtags?)\b/) ? "buttons_trims_labels"
    : includes(text, /\b(fabric|textile|yardage|meters?|metres?|gsm|oz\b|woven|knit|cotton|silk|linen|wool|cashmere|viscose|rayon|polyester|nylon|denim|twill|satin|chiffon|jersey)\b/) ? "fabric"
    : includes(text, /\b(blank|unbranded)\b/) ? "blank"
    : includes(text, /\b(wholesale|stock product|ready made|ready-made)\b/) ? "wholesale"
    : "unclassified";
  const route: IntakeRoute = ["wholesale", "blank", "private_label", "white_label"].includes(subtype) ? "finished_goods" : subtype === "unclassified" ? "unclassified" : "production_or_materials";
  const fields: IntakeField[] = subtype === "unclassified" ? [] : PROFILES[subtype].map(([key, label, optional]) => ({ key, label, state: optional ? "not_applicable" as const : "missing" as const, value: "" }));
  return { route, subtype, confidence: subtype === "unclassified" ? "low" : "high", items: fields.length ? [{ id: "item-1", subtype, fields }] : [] };
}

export function intakeFromBrief(brief: Record<string, unknown>): RfqIntake | null {
  const value = brief.intake;
  return value && typeof value === "object" && !Array.isArray(value) ? value as RfqIntake : null;
}
