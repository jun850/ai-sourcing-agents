export type IntakeRoute = "finished_goods" | "production_or_materials" | "unclassified";
export type ProcurementMode = "wholesale" | "blank" | "private_label" | "white_label" | "oem" | "odm" | "cmt" | "unspecified";
export type IntakeCategory = "apparel" | "footwear" | "bags_accessories" | "jewelry" | "beauty_personal_care" | "home_textiles" | "fibre_yarn" | "fabric" | "leather" | "interlining" | "trims_labels" | "packaging" | "other" | "unclassified";
export type IntakeSubtype = Exclude<ProcurementMode, "unspecified"> | Exclude<IntakeCategory, "unclassified"> | "unclassified";
export type IntakeFieldState = "provided" | "missing" | "not_applicable";
export type IntakeField = { key: string; label: string; state: IntakeFieldState; value: string };
export type RfqIntakeItem = { id: string; subtype: IntakeSubtype; category: IntakeCategory; procurementMode: ProcurementMode; fields: IntakeField[] };
export type RfqIntake = { route: IntakeRoute; subtype: IntakeSubtype; confidence: "high" | "medium" | "low"; items: RfqIntakeItem[] };

/**
 * The RFQ copilot's server-side classifier has a smaller internal shape than
 * the workspace's editable intake model. Never let that internal response
 * replace the UI model unless it has the complete, renderable workspace shape.
 */
export function isRfqIntake(value: unknown): value is RfqIntake {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const intake = value as Partial<RfqIntake>;
  return (
    typeof intake.route === "string" &&
    typeof intake.subtype === "string" &&
    typeof intake.confidence === "string" &&
    Array.isArray(intake.items) &&
    intake.items.every(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof item.id === "string" &&
        typeof item.subtype === "string" &&
        typeof item.category === "string" &&
        typeof item.procurementMode === "string" &&
        Array.isArray(item.fields) &&
        item.fields.every(
          (field) =>
            field &&
            typeof field === "object" &&
            !Array.isArray(field) &&
            typeof field.key === "string" &&
            typeof field.label === "string" &&
            typeof field.state === "string" &&
            typeof field.value === "string",
        ),
    )
  );
}

type ProfileField = readonly [key: string, label: string, optional?: boolean];
const COMMON: ProfileField[] = [["item", "Item"], ["quantity", "Quantity"], ["timeline", "Timeline", true]];
const PROFILES: Record<Exclude<IntakeSubtype, "unclassified">, ProfileField[]> = {
  wholesale: [...COMMON, ["destination", "Delivery destination"], ["brand_requirement", "Branding requirement", true]], blank: [...COMMON, ["color", "Color", true], ["size_range", "Size range", true], ["brand_requirement", "Branding requirement", true]],
  private_label: [...COMMON, ["reference", "Reference or product direction"], ["material_construction", "Material or construction"], ["branding", "Branding"], ["size_color_scope", "Sizes and colors", true]], white_label: [...COMMON, ["reference", "Reference or product direction"], ["branding", "Branding"], ["size_color_scope", "Sizes and colors", true]],
  oem: [...COMMON, ["reference", "Reference or product direction"], ["tech_pack", "Tech pack or pattern status", true], ["material_construction", "Material or construction"], ["branding", "Branding", true]], odm: [...COMMON, ["product_direction", "Product direction"], ["customisation", "Requested customisation"], ["branding", "Branding", true]], cmt: [...COMMON, ["tech_pack", "Tech pack or pattern status"], ["materials_supply", "Materials supplied or to procure"], ["stage", "Sample or bulk stage"]],
  apparel: [...COMMON, ["material_construction", "Material or construction", true], ["size_color_scope", "Sizes and colors", true]], footwear: [...COMMON, ["material_construction", "Material or construction"], ["size_range", "Size range"], ["reference", "Reference", true]], bags_accessories: [...COMMON, ["material_construction", "Material or construction"], ["dimensions", "Dimensions", true], ["reference", "Reference", true]], jewelry: [...COMMON, ["material", "Material"], ["finish", "Finish", true], ["dimensions", "Dimensions", true]], beauty_personal_care: [...COMMON, ["formula_or_product", "Formula or product direction"], ["packaging", "Packaging", true], ["compliance_requirement", "Compliance requirement", true]], home_textiles: [...COMMON, ["material_construction", "Material or construction"], ["dimensions", "Dimensions"], ["reference", "Reference", true]],
  fibre_yarn: [["material", "Fibre or composition"], ["yarn_type", "Yarn type or count"], ["finish", "Finish", true], ["quantity", "Quantity and unit"], ["intended_use", "Intended use"]], fabric: [["material", "Fibre or material"], ["construction", "Knit or woven construction"], ["weight", "Weight", true], ["width", "Width", true], ["finish", "Finish", true], ["color_print", "Color or print", true], ["quantity", "Quantity and unit"], ["intended_use", "Intended use"]], leather: [["material", "Leather or material type"], ["thickness", "Thickness", true], ["finish", "Finish", true], ["color", "Color", true], ["dimensions", "Dimensions", true], ["quantity", "Quantity and unit"], ["intended_use", "Intended use"]], interlining: [["material", "Material"], ["construction", "Construction"], ["weight", "Weight", true], ["width", "Width", true], ["adhesive", "Fusible or sew-in", true], ["quantity", "Quantity and unit"]], trims_labels: [["component", "Component type"], ["material", "Material"], ["dimensions", "Dimensions", true], ["finish_color", "Finish or color", true], ["function", "Function or attachment", true], ["quantity", "Quantity and unit"], ["reference", "Reference", true]], packaging: [["component", "Packaging component"], ["material", "Material"], ["dimensions", "Dimensions", true], ["finish_color", "Finish or print", true], ["quantity", "Quantity and unit"], ["branding", "Branding", true]], other: [...COMMON, ["specification", "Specification or intended use", true]],
};
function modeFor(text: string): ProcurementMode { return /\b(private label|private-label)\b/.test(text) ? "private_label" : /\b(white label|white-label)\b/.test(text) ? "white_label" : /\b(oem|original equipment manufacturer)\b/.test(text) ? "oem" : /\b(odm|original design manufacturer)\b/.test(text) ? "odm" : /\b(cmt|cut[ -]?make[ -]?trim)\b/.test(text) ? "cmt" : /\b(blank|unbranded)\b/.test(text) ? "blank" : /\b(wholesale|stock product|ready made|ready-made)\b/.test(text) ? "wholesale" : "unspecified"; }
function categoryFor(text: string): IntakeCategory { return /\b(leather|suede|nubuck)\b/.test(text) ? "leather" : /\b(interlining|fusible|fusing)\b/.test(text) ? "interlining" : /\b(buttons?|zippers?|zip|trims?|labels?|hangtags?)\b/.test(text) ? "trims_labels" : /\b(packaging|polybag|carton|box|tissue paper|mailer)\b/.test(text) ? "packaging" : /\b(fibre|fiber|yarn|spun|filament)\b/.test(text) ? "fibre_yarn" : /\b(shirt|t-?shirt|tee|trouser|pants|dress|jacket|coat|hoodies?|garment|apparel|uniform|polo)\b/.test(text) ? "apparel" : /\b(fabric|textile|yardage|meters?|metres?|gsm|oz\b|woven|knit|cotton|silk|linen|wool|cashmere|viscose|rayon|polyester|nylon|denim|twill|satin|chiffon|jersey)\b/.test(text) ? "fabric" : /\b(shoe|shoes|footwear|sneaker|boot|sandal)\b/.test(text) ? "footwear" : /\b(bag|bags|handbag|backpack|wallet|belt|hat|cap|scarf|accessor)\b/.test(text) ? "bags_accessories" : /\b(jewell?ry|ring|bracelet|necklace|earring)\b/.test(text) ? "jewelry" : /\b(cosmetic|skincare|beauty|personal care|fragrance)\b/.test(text) ? "beauty_personal_care" : /\b(home textile|bedding|curtain|cushion|towel|table linen)\b/.test(text) ? "home_textiles" : "unclassified"; }
export function classifyRfqIntake(prompt: string): RfqIntake { const text = prompt.toLowerCase(), procurementMode = modeFor(text), category = categoryFor(text); const subtype: IntakeSubtype = procurementMode !== "unspecified" ? procurementMode : category; const route: IntakeRoute = procurementMode !== "unspecified" ? (["wholesale", "blank", "private_label", "white_label", "oem", "odm"].includes(procurementMode) ? "finished_goods" : "production_or_materials") : category === "unclassified" ? "unclassified" : ["apparel", "footwear", "bags_accessories", "jewelry", "beauty_personal_care", "home_textiles"].includes(category) ? "finished_goods" : "production_or_materials"; const fields = subtype === "unclassified" ? [] : PROFILES[subtype].map(([key, label, optional]) => ({ key, label, state: optional ? "not_applicable" as const : "missing" as const, value: "" })); return { route, subtype, confidence: subtype === "unclassified" ? "low" : procurementMode === "unspecified" ? "medium" : "high", items: fields.length ? [{ id: "item-1", subtype, category, procurementMode, fields }] : [] }; }
export function intakeFromBrief(brief: Record<string, unknown>): RfqIntake | null { const value = brief.intake; return isRfqIntake(value) ? value : null; }
