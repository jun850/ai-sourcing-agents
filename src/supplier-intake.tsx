import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, X } from "lucide-react";
import {
  Alert,
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
} from "@mui/material";
import { submitSupplierIntake } from "./supabase";

type SupplierValues = {
  companyName: string; contactName: string; email: string; phone: string; address: string;
  yearsInBusiness: string; website: string; language: string; companyOverview: string; categories: string[];
  leadTime: string; moq: string; monthlyCapacity: string; externalQc: string; exportsAbroad: string;
  certifications: string; thirdPartyQc: string; catalog: string;
  paymentTerms: string; notes: string;
};

const initialValues: SupplierValues = {
  companyName: "", contactName: "", email: "", phone: "", address: "", yearsInBusiness: "", website: "",
  language: "", companyOverview: "", categories: [], leadTime: "", moq: "", monthlyCapacity: "", externalQc: "", exportsAbroad: "",
  certifications: "", thirdPartyQc: "", catalog: "", paymentTerms: "", notes: "",
};

const languages = ["English", "Indonesian", "Mandarin", "Vietnamese", "Japanese", "Malay"];
const categories = [
  "Textile / Garment / Apparel", "Essential Oil / Skincare / Fragrance", "Furniture / Homegoods",
  "Hardware / Utilities", "Electronics", "Beauty / Skincare / Lifestyle", "Other",
];

type Props = { open: boolean; onClose: () => void; returnFocusRef: RefObject<HTMLButtonElement | null> };

function OptionalLabel({ label }: { label: string }) {
  return <>{label} <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>(optional)</Box></>;
}

function RadioField({ label, name, options, value, error, row = true, onChange }: { label: string; name: string; options: string[]; value: string; error?: string; row?: boolean; onChange: (value: string) => void }) {
  return (
    <FormControl component="fieldset" required error={!!error} sx={{ gridColumn: "1 / -1" }}>
      <FormLabel component="legend" required sx={{ mb: 1, fontSize: 16, fontWeight: 600, color: "text.primary", "&.Mui-focused": { color: "text.primary" } }}>{label}</FormLabel>
      <RadioGroup
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        sx={row
          ? { flexDirection: "row", flexWrap: "wrap", columnGap: 4, rowGap: .5 }
          : { display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, columnGap: 2, rowGap: .5 }}
      >
        {options.map((option) => <FormControlLabel key={option} value={option} control={<Radio />} label={option} />)}
      </RadioGroup>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  );
}

function CheckboxField({ label, hint, options, values, error, onToggle }: { label: string; hint?: string; options: string[]; values: string[]; error?: string; onToggle: (option: string) => void }) {
  return (
    <FormControl component="fieldset" required error={!!error} sx={{ gridColumn: "1 / -1" }}>
      <FormLabel component="legend" required sx={{ fontSize: 16, fontWeight: 600, color: "text.primary", "&.Mui-focused": { color: "text.primary" } }}>
        {label}{hint && <Box component="span" sx={{ ml: 1, color: "text.secondary", fontWeight: 400, fontSize: 14 }}>({hint})</Box>}
      </FormLabel>
      <FormGroup sx={{ mt: 1, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, columnGap: 3 }}>
        {options.map((option) => <FormControlLabel key={option} control={<Checkbox checked={values.includes(option)} onChange={() => onToggle(option)} />} label={option} />)}
      </FormGroup>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  );
}

function Section({ title, first = false, children }: { title: string; first?: boolean; children: ReactNode }) {
  return (
    <Box component="section" sx={{ display: "grid", gap: 3, pt: first ? 0 : 4, borderTop: first ? 0 : "1px solid #edf0f2" }}>
      <Box component="h3" sx={{ m: 0, color: "text.primary", fontSize: 14, letterSpacing: ".12em", lineHeight: 1.2, textTransform: "uppercase" }}>{title}</Box>
      {children}
    </Box>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 3, rowGap: 3 }}>{children}</Box>;
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
  function toggleCategory(item: string) { setValues((current) => ({ ...current, categories: current.categories.includes(item) ? current.categories.filter((value) => value !== item) : [...current.categories, item] })); setErrors((current) => ({ ...current, categories: "" })); }

  function validate() {
    const next: Record<string, string> = {};
    const required: Array<[keyof SupplierValues, string]> = [
      ["companyName", "Add your company name."], ["contactName", "Add a main contact name."], ["email", "Add a work email."],
      ["phone", "Add a contact phone number."], ["address", "Add your company address."], ["yearsInBusiness", "Add the years you have been in business."],
      ["language", "Choose a communication language."], ["companyOverview", "Tell us briefly about your company."], ["leadTime", "Add a typical lead time."],
      ["moq", "Add your minimum MOQ."], ["monthlyCapacity", "Add your monthly capacity."], ["externalQc", "Choose an option."], ["exportsAbroad", "Choose an option."],
      ["thirdPartyQc", "Choose an option."], ["catalog", "Choose an option."], ["paymentTerms", "Add your preferred payment terms."],
    ];
    required.forEach(([key, message]) => { if (!String(values[key]).trim()) next[key] = message; });
    if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) next.email = "Use a valid work email.";
    if (values.phone && values.phone.replace(/\D/g, "").length < 6) next.phone = "Use a valid contact number.";
    if (!values.categories.length) next.categories = "Choose at least one category.";
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
      await submitSupplierIntake(values);
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

  const hasErrors = Object.values(errors).some(Boolean);

  return <AnimatePresence>{open && <motion.div className="supplier-intake-backdrop" role="presentation" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduced ? undefined : { opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div ref={dialogRef} className="supplier-intake-dialog" role="dialog" aria-modal="true" aria-labelledby={`${formId}-title`} aria-describedby={`${formId}-description`} tabIndex={-1} initial={reduced ? false : { y: 18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? undefined : { opacity: 0, y: 12, scale: .985 }} transition={{ duration: .2 }} onKeyDown={handleDialogKeyDown}>
    <header className="supplier-intake-header"><div><h2 id={`${formId}-title`}>Join Atelix as Supplier</h2><p id={`${formId}-description`}>Takes about five minutes to complete. We'll use your answers to understand what you make and how you operate — suppliers who qualify get introduced directly to buyers actively sourcing through Atelix.</p></div><button type="button" className="supplier-intake-close" onClick={onClose} aria-label="Close supplier intake dialog"><X size={24} aria-hidden="true" /></button></header>
    {submitted ? <div className="supplier-intake-success" role="status"><span className="supplier-success-mark"><Check size={20} aria-hidden="true" /></span><h3>Thanks — your details are recorded.</h3><p>We’ll review your capabilities and contact you separately if there’s a fit for an Atelix sourcing conversation.</p><button type="button" className="supplier-intake-success-close" onClick={onClose}>Close</button></div> : <form id={`${formId}-form`} className="supplier-intake-form" onSubmit={submit} noValidate><div className="supplier-intake-body">
      {(serviceError || hasErrors) && <Stack spacing={1.5} sx={{ mb: 4 }}>
        {serviceError && <Alert severity="error" role="alert">{serviceError}</Alert>}
        {hasErrors && <Alert severity="warning" role="alert">Review the highlighted fields before submitting.</Alert>}
      </Stack>}

      <Section title="Company & contact" first>
        <FieldGrid>
          <TextField inputRef={firstFieldRef} label="Company name" required fullWidth sx={{ gridColumn: "1 / -1" }} value={values.companyName} onChange={(event) => setValue("companyName", event.target.value)} error={!!errors.companyName} helperText={errors.companyName} autoComplete="organization" />
          <TextField label="Main contact name" required fullWidth sx={{ gridColumn: "1 / -1" }} value={values.contactName} onChange={(event) => setValue("contactName", event.target.value)} error={!!errors.contactName} helperText={errors.contactName} autoComplete="name" />
          <TextField label="Contact email" required fullWidth type="email" value={values.email} onChange={(event) => setValue("email", event.target.value)} error={!!errors.email} helperText={errors.email} autoComplete="email" />
          <TextField label="Contact phone" required fullWidth type="tel" value={values.phone} onChange={(event) => setValue("phone", event.target.value)} error={!!errors.phone} helperText={errors.phone} autoComplete="tel" />
          <TextField label="Address" required fullWidth sx={{ gridColumn: "1 / -1" }} value={values.address} onChange={(event) => setValue("address", event.target.value)} error={!!errors.address} helperText={errors.address} autoComplete="street-address" />
          <TextField label="Years in business" required fullWidth inputMode="numeric" value={values.yearsInBusiness} onChange={(event) => setValue("yearsInBusiness", event.target.value)} error={!!errors.yearsInBusiness} helperText={errors.yearsInBusiness} />
          <TextField label={<OptionalLabel label="Company website" />} fullWidth type="url" placeholder="https://" value={values.website} onChange={(event) => setValue("website", event.target.value)} autoComplete="url" />
        </FieldGrid>
      </Section>

      <Section title="Communication">
        <FieldGrid>
          <RadioField label="Preferred language of communication" name="language" options={languages} value={values.language} error={errors.language} row={false} onChange={(value) => setValue("language", value)} />
          <TextField label="Tell us about your company" required fullWidth multiline minRows={3} sx={{ gridColumn: "1 / -1" }} placeholder="What you make, who you serve, what makes you different…" value={values.companyOverview} onChange={(event) => setValue("companyOverview", event.target.value)} error={!!errors.companyOverview} helperText={errors.companyOverview || "Two or three sentences: what you make, who you serve, and what makes you different."} />
        </FieldGrid>
      </Section>

      <Section title="What you make">
        <CheckboxField label="Manufacturing categories" hint="select all that apply" options={categories} values={values.categories} error={errors.categories} onToggle={toggleCategory} />
      </Section>

      <Section title="Operations">
        <FieldGrid>
          <TextField label="Typical lead time (days)" required fullWidth inputMode="numeric" value={values.leadTime} onChange={(event) => setValue("leadTime", event.target.value)} error={!!errors.leadTime} helperText={errors.leadTime} />
          <TextField label="Minimum MOQ" required fullWidth placeholder="e.g. 1,000 units" value={values.moq} onChange={(event) => setValue("moq", event.target.value)} error={!!errors.moq} helperText={errors.moq} />
          <TextField label="Max monthly order capacity" required fullWidth sx={{ gridColumn: "1 / -1" }} placeholder="e.g. 50,000 units / 20 MT" value={values.monthlyCapacity} onChange={(event) => setValue("monthlyCapacity", event.target.value)} error={!!errors.monthlyCapacity} helperText={errors.monthlyCapacity} />
          <RadioField label="Open to external quality control?" name="externalQc" options={["Yes", "No", "Maybe"]} value={values.externalQc} error={errors.externalQc} onChange={(value) => setValue("externalQc", value)} />
          <RadioField label="Has the company exported to the USA?" name="exportsAbroad" options={["Yes", "No"]} value={values.exportsAbroad} error={errors.exportsAbroad} onChange={(value) => setValue("exportsAbroad", value)} />
          <TextField label={<OptionalLabel label="Certifications" />} fullWidth sx={{ gridColumn: "1 / -1" }} placeholder="e.g. Sedex, WRAP, OEKO-TEX" value={values.certifications} onChange={(event) => setValue("certifications", event.target.value)} />
          <RadioField label="Does the company accept third-party quality control?" name="thirdPartyQc" options={["Yes", "No"]} value={values.thirdPartyQc} error={errors.thirdPartyQc} onChange={(value) => setValue("thirdPartyQc", value)} />
          <RadioField label="Do you have a product catalog?" name="catalog" options={["Yes", "No"]} value={values.catalog} error={errors.catalog} onChange={(value) => setValue("catalog", value)} />
          <TextField label="Preferred payment terms" required fullWidth sx={{ gridColumn: "1 / -1" }} placeholder="e.g. 50% deposit, 50% before shipment" value={values.paymentTerms} onChange={(event) => setValue("paymentTerms", event.target.value)} error={!!errors.paymentTerms} helperText={errors.paymentTerms} />
          <TextField label={<OptionalLabel label="Anything else we should know?" />} fullWidth multiline minRows={3} sx={{ gridColumn: "1 / -1" }} value={values.notes} onChange={(event) => setValue("notes", event.target.value)} />
        </FieldGrid>
      </Section>
    </div><footer className="supplier-intake-footer"><button className="supplier-intake-submit" type="submit" disabled={busy}>{busy ? "Recording intake…" : <>Submit supplier intake <ArrowRight size={18} aria-hidden="true" /></>}</button></footer></form>}
  </motion.div></motion.div>}</AnimatePresence>;
}
