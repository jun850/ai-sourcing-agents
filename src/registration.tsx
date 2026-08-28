import { useState, type FormEvent } from "react";
import { signUpForReview } from "./supabase";

const revenues = ["Under $500K", "$500K – $1M", "$1M – $5M", "$5M – $10M", "$10M – $50M", "$50M+"];

/* Request Access is a mode of the sign-in screen, not a separate route: it
   records a review request and only promises an invitation after approval. */
export function RequestAccessForm({ onBackToSignIn }: { onBackToSignIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sourcing, setSourcing] = useState("");
  const [annualRevenue, setAnnualRevenue] = useState("");

  const invalid = !name.trim() || !email.trim() || !companyName.trim() || !sourcing.trim() || !annualRevenue;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalid) { setError("Please fill in all required fields."); return; }
    setBusy(true); setError("");
    try {
      await signUpForReview({
        name: name.trim(), email: email.trim(), companyName: companyName.trim(),
        sourcing: sourcing.trim(), annualRevenue, phone: phone.trim(), countryCode: "",
      });
      setSubmittedEmail(email.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not record your request.");
    } finally { setBusy(false); }
  }

  if (submittedEmail) return (
    <div role="status">
      <p className="signin-eyebrow">Request received</p>
      <h1 className="signin-heading">We’ll review your registration.</h1>
      <p className="signin-subheading">
        You’re on the waitlist. If your request is approved, we’ll send an invitation to{" "}
        <strong>{submittedEmail}</strong> so you can set up your login.
      </p>
      <p className="signin-switch">
        <button type="button" className="signin-link" onClick={onBackToSignIn}>Back to log in</button>
      </p>
    </div>
  );

  return (
    <>
      <p className="signin-eyebrow">Request access</p>
      <h1 className="signin-heading">Get started with Atelix</h1>
      <p className="signin-subheading">
        Tell us a little about your business. We’ll review your request before inviting you into the sourcing workspace.
      </p>
      {error && <div className="signin-otp-error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="signin-signup-fields">
          <div>
            <label className="signin-label" htmlFor="signup-name">Name</label>
            <input id="signup-name" className="signin-input" type="text" autoComplete="name"
              value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" required />
          </div>
          <div>
            <label className="signin-label" htmlFor="signup-email">Work email</label>
            <input id="signup-email" className="signin-input" type="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourcompany.com" required />
          </div>
          <div>
            <label className="signin-label" htmlFor="signup-phone">Phone (optional)</label>
            <input id="signup-phone" className="signin-input" type="tel" autoComplete="tel"
              value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62 812 3456 7890" />
          </div>
          <div>
            <label className="signin-label" htmlFor="signup-company">Company name</label>
            <input id="signup-company" className="signin-input" type="text" autoComplete="organization"
              value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" required />
          </div>
          <div>
            <label className="signin-label" htmlFor="signup-sourcing">What are you sourcing?</label>
            <input id="signup-sourcing" className="signin-input" type="text"
              value={sourcing} onChange={(e) => setSourcing(e.target.value)} placeholder="e.g. canvas tote bags, woven shirts" required />
          </div>
          <div>
            <label className="signin-label" htmlFor="signup-revenue">Annual revenue</label>
            <select id="signup-revenue" className="signin-select"
              value={annualRevenue} onChange={(e) => setAnnualRevenue(e.target.value)} required>
              <option value="" disabled>Select a range</option>
              {revenues.map((revenue) => <option key={revenue} value={revenue}>{revenue}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" className="signin-submit" disabled={busy || invalid} aria-busy={busy}>Sign up</button>
      </form>
      <p className="signin-switch">
        <button type="button" className="signin-link" onClick={onBackToSignIn}>Already have an account? Log in</button>
      </p>
    </>
  );
}
