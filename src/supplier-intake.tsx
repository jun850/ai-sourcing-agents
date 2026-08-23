import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, X } from "lucide-react";
import { api } from "./api";

type SupplierValues = {
  companyName: string; contactName: string; email: string; countryCode: string; phone: string; address: string;
  yearsInBusiness: string; website: string; language: string; companyOverview: string; categories: string[];
  leadTime: string; moq: string; monthlyCapacity: string; externalQc: string; exportsAbroad: string;
  exportRegions: string[]; certifications: string; thirdPartyQc: string; rawMaterials: string; catalog: string;
  paymentTerms: string; notes: string;
};

const initialValues: SupplierValues = {
  companyName: "", contactName: "", email: "", countryCode: "+62", phone: "", address: "", yearsInBusiness: "", website: "",
  language: "", companyOverview: "", categories: [], leadTime: "", moq: "", monthlyCapacity: "", externalQc: "", exportsAbroad: "",
  exportRegions: [], certifications: "", thirdPartyQc: "", rawMaterials: "", catalog: "", paymentTerms: "", notes: "",
};

const countryCodes = [
  ["+1", "United States / Canada"], ["+44", "United Kingdom"], ["+61", "Australia"], ["+62", "Indonesia"],
  ["+81", "Japan"], ["+86", "China"], ["+91", "India"], ["+64", "New Zealand"], ["+65", "Singapore"],
  ["+66", "Thailand"], ["+84", "Vietnam"], ["+971", "United Arab Emirates"],
] as const;
const categories = ["Textile / Garment / Apparel", "Furniture / Homegoods", "Essential Oil / Skincare / Fragrance", "Hardware / Utilities", "Other"];
const regions = ["North America", "Asia", "Australia", "New Zealand", "Europe"];

type Props = { open: boolean; onClose: () => void; returnFocusRef: RefObject<HTMLButtonElement | null> };

function SupplierField({ label, id, required = false, hint, error, children }: { label: string; id: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return <div className="supplier-intake-field"><label htmlFor={id}>{label}{required && <span className="supplier-required" aria-hidden="true"> *</span>}</label>{children}{hint && <small className="supplier-intake-hint">{hint}</small>}{error && <small className="supplier-intake-field-error" id={`${id}-error`}>{error}</small>}</div>;
}

export function SupplierIntakeModal({ open, onClose, returnFocusRef }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();
  const formId = useId();
  const [values, setValues] = useState<SupplierValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serviceError, setServiceError] = useState("");

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("supplier-intake-open");
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 40);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", closeOnEscape); document.body.classList.remove("supplier-intake-open"); };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    return () => { (returnFocusRef.current || previous)?.focus?.(); };
  }, [open, returnFocusRef]);

  function setValue<K extends keyof SupplierValues>(key: K, value: SupplierValues[K]) { setValues((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); }
  function toggleList(key: "categories" | "exportRegions", item: string) { setValues((current) => ({ ...current, [key]: current[key].includes(item) ? current[key].filter((value) => value !== item) : [...current[key], item] })); setErrors((current) => ({ ...current, [key]: "" })); }

  function validate() {
    const next: Record<string, string> = {};
    const required: Array<[keyof SupplierValues, string]> = [
      ["companyName", "Add your company name."], ["contactName", "Add a main contact name."], ["email", "Add a work email."],
      ["phone", "Add a contact phone number."], ["address", "Add your company address."], ["yearsInBusiness", "Add the years you have been in business."],
      ["language", "Choose a communication language."], ["companyOverview", "Tell us briefly about your company."], ["leadTime", "Add a typical lead time."],
      ["moq", "Add your minimum MOQ."], ["monthlyCapacity", "Add your monthly capacity."], ["externalQc", "Choose an option."], ["exportsAbroad", "Choose an option."],
      ["thirdPartyQc", "Choose an option."], ["rawMaterials", "Choose an option."], ["catalog", "Choose an option."], ["paymentTerms", "Add your preferred payment terms."],
    ];
    required.forEach(([key, message]) => { if (!String(values[key]).trim()) next[key] = message; });
    if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) next.email = "Use a valid work email.";
    if (values.phone && values.phone.replace(/\D/g, "").length < 6) next.phone = "Use a valid contact number.";
    if (!values.categories.length) next.categories = "Choose at least one category.";
    if (values.exportsAbroad === "yes" && !values.exportRegions.length) next.exportRegions = "Choose at least one region.";
    setErrors(next);
    return next;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServiceError("");
    const next = validate();
    if (Object.keys(next).length) {
      window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      await api<{ ok: true }>("/api/supplier-intake", { method: "POST", body: JSON.stringify(values) });
      setSubmitted(true);
    } catch (cause) {
      setServiceError(cause instanceof Error ? cause.message : "We could not record your intake. Please try again.");
    } finally { setBusy(false); }
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]") || []);
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <AnimatePresence>{open && <motion.div className="supplier-intake-backdrop" role="presentation" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduced ? undefined : { opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div ref={dialogRef} className="supplier-intake-dialog" role="dialog" aria-modal="true" aria-labelledby={`${formId}-title`} aria-describedby={`${formId}-description`} tabIndex={-1} initial={reduced ? false : { y: 18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? undefined : { opacity: 0, y: 12, scale: .985 }} transition={{ duration: .2 }} onKeyDown={handleDialogKeyDown}>
    <header className="supplier-intake-header"><div><h2 id={`${formId}-title`}>Join Atelix as Supplier</h2><p id={`${formId}-description`}>A short form so we can understand your capabilities and explore a sourcing partnership. Qualified suppliers will be introduced to relevant global buyers in our network.</p></div><button type="button" className="supplier-intake-close" onClick={onClose} aria-label="Close supplier intake dialog"><X size={24} aria-hidden="true" /></button></header>
    {submitted ? <div className="supplier-intake-success" role="status"><span className="supplier-success-mark"><Check size={20} aria-hidden="true" /></span><h3>Thanks — your details are recorded.</h3><p>We’ll review your capabilities and contact you separately if there’s a fit for an Atelix sourcing conversation.</p><button type="button" className="supplier-intake-success-close" onClick={onClose}>Close</button></div> : <form id={`${formId}-form`} className="supplier-intake-form" onSubmit={submit} noValidate><div className="supplier-intake-body">
      {serviceError && <p className="supplier-intake-service-error" role="alert">{serviceError}</p>}
      {Object.keys(errors).length > 0 && <p className="supplier-intake-summary" role="alert">Review the highlighted fields before submitting.</p>}
      <section className="supplier-intake-section" aria-labelledby={`${formId}-company`}><h3 id={`${formId}-company`}>Company &amp; contact</h3><div className="supplier-intake-grid">
        <SupplierField label="Company name" id={`${formId}-company-name`} required error={errors.companyName}><input ref={firstFieldRef} id={`${formId}-company-name`} name="companyName" value={values.companyName} onChange={(event) => setValue("companyName", event.target.value)} aria-invalid={!!errors.companyName} aria-describedby={errors.companyName ? `${formId}-company-name-error` : undefined} autoComplete="organization" /></SupplierField>
        <SupplierField label="Main contact name" id={`${formId}-contact-name`} required error={errors.contactName}><input id={`${formId}-contact-name`} name="contactName" value={values.contactName} onChange={(event) => setValue("contactName", event.target.value)} aria-invalid={!!errors.contactName} autoComplete="name" /></SupplierField>
        <SupplierField label="Contact email" id={`${formId}-email`} required error={errors.email}><input id={`${formId}-email`} name="email" type="email" value={values.email} onChange={(event) => setValue("email", event.target.value)} aria-invalid={!!errors.email} autoComplete="email" /></SupplierField>
        <SupplierField label="Contact phone" id={`${formId}-phone`} required error={errors.phone}><span className="supplier-intake-phone"><select aria-label="Country calling code" value={values.countryCode} onChange={(event) => setValue("countryCode", event.target.value)}>{countryCodes.map(([code, country]) => <option key={code} value={code}>{code} · {country}</option>)}</select><input id={`${formId}-phone`} name="phone" type="tel" value={values.phone} onChange={(event) => setValue("phone", event.target.value)} aria-invalid={!!errors.phone} autoComplete="tel" /></span></SupplierField>
        <SupplierField label="Address" id={`${formId}-address`} required error={errors.address}><input id={`${formId}-address`} name="address" value={values.address} onChange={(event) => setValue("address", event.target.value)} aria-invalid={!!errors.address} autoComplete="street-address" /></SupplierField>
        <SupplierField label="Years in business" id={`${formId}-years`} required error={errors.yearsInBusiness}><input id={`${formId}-years`} name="yearsInBusiness" inputMode="numeric" value={values.yearsInBusiness} onChange={(event) => setValue("yearsInBusiness", event.target.value)} aria-invalid={!!errors.yearsInBusiness} /></SupplierField>
        <SupplierField label="Company website" id={`${formId}-website`} hint="Optional"><input id={`${formId}-website`} name="website" type="url" placeholder="https://" value={values.website} onChange={(event) => setValue("website", event.target.value)} autoComplete="url" /></SupplierField>
      </div></section>
      <section className="supplier-intake-section" aria-labelledby={`${formId}-communication`}><h3 id={`${formId}-communication`}>Communication</h3><fieldset className="supplier-choice-field"><legend>Preferred language of communication <span className="supplier-required" aria-hidden="true"> *</span></legend><div className="supplier-choice-grid">{["English", "Indonesian", "Mandarin", "Other"].map((language) => <label className="supplier-choice" key={language}><input type="radio" name="language" value={language} checked={values.language === language} onChange={(event) => setValue("language", event.target.value)} /><span>{language}</span></label>)}</div>{errors.language && <small className="supplier-intake-field-error">{errors.language}</small>}</fieldset><SupplierField label="Tell us about your company" id={`${formId}-overview`} required hint="Two or three sentences: what you make, who you serve, and what makes you different." error={errors.companyOverview}><textarea id={`${formId}-overview`} name="companyOverview" value={values.companyOverview} onChange={(event) => setValue("companyOverview", event.target.value)} aria-invalid={!!errors.companyOverview} /></SupplierField></section>
      <section className="supplier-intake-section" aria-labelledby={`${formId}-make`}><h3 id={`${formId}-make`}>What you make</h3><fieldset className="supplier-choice-field"><legend>Manufacturing categories <span className="supplier-required" aria-hidden="true"> *</span><span className="supplier-legend-hint">Select all that apply</span></legend><div className="supplier-choice-grid">{categories.map((category) => <label className="supplier-choice" key={category}><input type="checkbox" name="categories" value={category} checked={values.categories.includes(category)} onChange={() => toggleList("categories", category)} /><span>{category}</span></label>)}</div>{errors.categories && <small className="supplier-intake-field-error">{errors.categories}</small>}</fieldset></section>
      <section className="supplier-intake-section" aria-labelledby={`${formId}-operations`}><h3 id={`${formId}-operations`}>Operations</h3><div className="supplier-intake-grid"><SupplierField label="Typical lead time (days)" id={`${formId}-lead-time`} required error={errors.leadTime}><input id={`${formId}-lead-time`} name="leadTime" inputMode="numeric" value={values.leadTime} onChange={(event) => setValue("leadTime", event.target.value)} aria-invalid={!!errors.leadTime} /></SupplierField><SupplierField label="Minimum MOQ" id={`${formId}-moq`} required error={errors.moq}><input id={`${formId}-moq`} name="moq" placeholder="e.g. 1,000 units" value={values.moq} onChange={(event) => setValue("moq", event.target.value)} aria-invalid={!!errors.moq} /></SupplierField></div><SupplierField label="Max monthly order capacity" id={`${formId}-capacity`} required error={errors.monthlyCapacity}><input id={`${formId}-capacity`} name="monthlyCapacity" placeholder="e.g. 50,000 units / 20 MT" value={values.monthlyCapacity} onChange={(event) => setValue("monthlyCapacity", event.target.value)} aria-invalid={!!errors.monthlyCapacity} /></SupplierField><SupplierRadioLegend label="Open to external quality control?" name="externalQc" options={["Yes", "No", "Maybe"]} value={values.externalQc} error={errors.externalQc} onChange={(value) => setValue("externalQc", value)} /><SupplierRadioLegend label="Have you ever exported your goods abroad?" name="exportsAbroad" options={["yes", "no"]} value={values.exportsAbroad} error={errors.exportsAbroad} onChange={(value) => { setValue("exportsAbroad", value); if (value === "no") setValue("exportRegions", []); }} /><AnimatePresence initial={false}>{values.exportsAbroad === "yes" && <motion.fieldset className="supplier-export-regions" initial={reduced ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduced ? undefined : { opacity: 0, height: 0 }}><legend>If yes, select the regions below <span className="supplier-required" aria-hidden="true"> *</span></legend><div className="supplier-choice-grid">{regions.map((region) => <label className="supplier-choice" key={region}><input type="checkbox" name="exportRegions" value={region} checked={values.exportRegions.includes(region)} onChange={() => toggleList("exportRegions", region)} /><span>{region}</span></label>)}</div>{errors.exportRegions && <small className="supplier-intake-field-error">{errors.exportRegions}</small>}</motion.fieldset>}</AnimatePresence><SupplierField label="Certifications" id={`${formId}-certifications`} hint="Optional — for example Sedex, WRAP, or OEKO-TEX"><input id={`${formId}-certifications`} name="certifications" value={values.certifications} onChange={(event) => setValue("certifications", event.target.value)} /></SupplierField><SupplierRadioLegend label="Does the company accept third-party quality control?" name="thirdPartyQc" options={["Yes", "No"]} value={values.thirdPartyQc} error={errors.thirdPartyQc} onChange={(value) => setValue("thirdPartyQc", value)} /><SupplierRadioLegend label="Looking to source raw materials at lower price + premium quality?" name="rawMaterials" options={["Interested", "Not really"]} value={values.rawMaterials} error={errors.rawMaterials} onChange={(value) => setValue("rawMaterials", value)} /><SupplierRadioLegend label="Do you have a product catalog?" name="catalog" options={["Yes", "No"]} value={values.catalog} error={errors.catalog} onChange={(value) => setValue("catalog", value)} /><SupplierField label="Preferred payment terms" id={`${formId}-terms`} required error={errors.paymentTerms}><input id={`${formId}-terms`} name="paymentTerms" placeholder="e.g. 30% deposit, 70% before shipment" value={values.paymentTerms} onChange={(event) => setValue("paymentTerms", event.target.value)} aria-invalid={!!errors.paymentTerms} /></SupplierField><SupplierField label="Anything else we should know?" id={`${formId}-notes`} hint="Optional"><textarea id={`${formId}-notes`} name="notes" value={values.notes} onChange={(event) => setValue("notes", event.target.value)} /></SupplierField></section>
    </div><footer className="supplier-intake-footer"><button className="supplier-intake-submit" type="submit" disabled={busy}>{busy ? "Recording intake…" : <>Submit supplier intake <ArrowRight size={18} aria-hidden="true" /></>}</button></footer></form>}
  </motion.div></motion.div>}</AnimatePresence>;
}

function SupplierRadioLegend({ label, name, options, value, error, onChange }: { label: string; name: string; options: string[]; value: string; error?: string; onChange: (value: string) => void }) {
  return <fieldset className="supplier-choice-field"><legend>{label} <span className="supplier-required" aria-hidden="true"> *</span></legend><div className="supplier-choice-grid supplier-choice-grid--inline">{options.map((option) => <label className="supplier-choice" key={option}><input type="radio" name={name} value={option} checked={value === option} onChange={(event) => onChange(event.target.value)} /><span>{option === "yes" ? "Yes" : option === "no" ? "No" : option}</span></label>)}</div>{error && <small className="supplier-intake-field-error">{error}</small>}</fieldset>;
}
