import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Button, SkipLink } from "./components";
import { AtelixLandingPage } from "./landing/landing";
import { getSession, isSupabaseConfigured, signInWithEmailOtp, signInWithMagicLink, supabase } from "./supabase";

const Dashboard = lazy(() => import("./dashboard").then(({ Dashboard: Route }) => ({ default: Route })));
const Intools = lazy(() => import("./intools").then(({ Intools: Route }) => ({ default: Route })));
const SignUp = lazy(() => import("./registration").then(({ SignUp: Route }) => ({ default: Route })));
const FooterPage = lazy(() => import("./footer-pages").then(({ FooterPage: Route }) => ({ default: Route })));

const footerPagePaths = [
  "/sourcing-guide",
  "/private-label",
  "/quality-control",
  "/alibaba-alternative",
  "/about",
  "/supplier-guide",
  "/privacy-policy",
  "/terms-of-service",
] as const;
type FooterPagePath = typeof footerPagePaths[number];
function isFooterPagePath(path: string): path is FooterPagePath {
  return footerPagePaths.includes(path as FooterPagePath);
}

const AUTH_FALLBACK_PATH = "/dashboard";
export function sanitizeInternalPath(value: string | null | undefined, fallback = AUTH_FALLBACK_PATH) {
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

function RouteLoading() {
  return <main id="main-content" className="route-loading" aria-live="polite">Loading…</main>;
}

function Landing(){ return <><SkipLink/><AtelixLandingPage/></>; }
function SignIn(){
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<"password" | "email-code">("password");
  const [codeSent, setCodeSent] = useState(false);

  function completeSignIn() {
    const next = sanitizeInternalPath(new URLSearchParams(location.search).get("next"));
    history.pushState({}, "", next);
    dispatchEvent(new PopStateEvent("popstate"));
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    const password = String(new FormData(event.currentTarget).get("password") || "");
    try {
      if (!supabase || !isSupabaseConfigured) throw new Error("Sign in is not configured for this environment.");
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      completeSignIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally { setBusy(false); }
  }

  async function sendEmailCode() {
    const safeEmail = email.trim();
    if (!safeEmail) { setError("Enter your work email first."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const next = sanitizeInternalPath(new URLSearchParams(location.search).get("next"));
      await signInWithMagicLink(safeEmail, `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`);
      setCodeSent(true);
      setNotice("We sent a sign-in link and a 6-digit code to your work email.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the sign-in email.");
    } finally { setBusy(false); }
  }

  async function verifyEmailCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("email-code") || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(token)) { setError("Enter the 6-digit code from your email."); return; }
    setBusy(true); setError("");
    try {
      await signInWithEmailOtp(email.trim(), token);
      completeSignIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That code is invalid or has expired.");
    } finally { setBusy(false); }
  }

  function switchMethod(nextMethod: "password" | "email-code") {
    setMethod(nextMethod); setError(""); setNotice(""); setCodeSent(false);
  }

  const emailField = <label htmlFor="email">Work email<input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>;
  return <><SkipLink/><main id="main-content" className="auth"><section className="auth-card auth-login" aria-labelledby="sign-in-title"><a href="/" className="wordmark">atelix<span>.</span></a><header className="auth-header"><p className="auth-eyebrow">Private sourcing workspace</p><h1 id="sign-in-title">{method === "password" ? "Welcome back" : codeSent ? "Enter your code" : "Sign in with a code"}</h1><p>{method === "password" ? "Sign in to continue your sourcing work." : codeSent ? <>Use the code we sent to <strong>{email.trim()}</strong>, or open the sign-in link in that email.</> : "We’ll email a secure link and a one-time code to your work address."}</p></header>{method === "password" ? <form className="auth-login-form" onSubmit={submitPassword}>{emailField}<label htmlFor="password">Password<input id="password" type="password" name="password" autoComplete="current-password" required /></label>{error && <p className="error auth-error" role="alert">{error}</p>}<Button type="submit" disabled={busy} ariaBusy={busy}>{busy ? "Signing in…" : "Log in"}</Button><button className="auth-method-link" type="button" onClick={() => switchMethod("email-code")} disabled={busy}>Use an email code instead</button></form> : codeSent ? <form className="auth-login-form" onSubmit={verifyEmailCode}><label htmlFor="email-code">6-digit sign-in code<input id="email-code" name="email-code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} placeholder="000000" required autoFocus /></label>{error && <p className="error auth-error" role="alert">{error}</p>}{notice && <p className="success auth-notice" role="status">{notice}</p>}<Button type="submit" disabled={busy} ariaBusy={busy}>{busy ? "Checking code…" : "Continue"}</Button><button className="auth-method-link" type="button" onClick={() => setCodeSent(false)} disabled={busy}>Use a different email</button><button className="auth-method-link" type="button" onClick={() => void sendEmailCode()} disabled={busy}>Send a new code</button></form> : <form className="auth-login-form" onSubmit={(event) => { event.preventDefault(); void sendEmailCode(); }}>{emailField}{error && <p className="error auth-error" role="alert">{error}</p>}{notice && <p className="success auth-notice" role="status">{notice}</p>}<Button type="submit" disabled={busy} ariaBusy={busy}>{busy ? "Sending…" : "Email my code and link"}</Button><button className="auth-method-link" type="button" onClick={() => switchMethod("password")} disabled={busy}>Use password instead</button></form>}<p className="auth-footnote">New to Atelix? <a href="/sign-up">Request access</a></p></section></main></>;
}
function AuthCallback(){
  const [error,setError]=useState("");
  useEffect(()=>{ void (async()=>{ const code=new URLSearchParams(location.search).get("code"); if (code && supabase) { const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code); if (exchangeError) throw exchangeError; } const session=await getSession(); if (!session) throw new Error("This sign-in link is invalid or has expired."); const next=sanitizeInternalPath(new URLSearchParams(location.search).get("next")); history.replaceState({},"",next); dispatchEvent(new PopStateEvent("popstate")); })().catch((cause)=>setError(cause instanceof Error?cause.message:"Could not complete sign in.")); },[]);
  return error ? <main id="main-content" className="auth"><section className="auth-card"><h1>Sign-in link unavailable</h1><p className="error" role="alert">{error}</p><a className="button" href="/sign-in">Return to sign in</a></section></main> : <RouteLoading/>;
}
export function App(){
  const [path,setPath]=useState(location.pathname); const [authReady,setAuthReady]=useState(false); const [authError,setAuthError]=useState("");
  useEffect(()=>{const listener=()=>setPath(location.pathname);addEventListener("popstate",listener);return()=>removeEventListener("popstate",listener)},[]);
  useEffect(()=>{const section=path.startsWith("/dashboard")?"Dashboard":path==="/intools" || path.startsWith("/intools/suppliers")?"Intools":path==="/sign-up"?"Sign up":path==="/sign-in"?"Sign in":"Fashion sourcing";document.title=`${section} — Atelix`;},[path]);
  useEffect(()=>{ let active=true; setAuthReady(false); setAuthError(""); if (!path.startsWith("/dashboard")) { setAuthReady(true); return; } void getSession().then((session)=>{ if (!active) return; if (!session) { const next=`/sign-in?next=${encodeURIComponent(sanitizeInternalPath(path))}`; history.replaceState({},"",next); setPath("/sign-in"); } else setAuthReady(true); }).catch((cause)=>{ if (!active) return; setAuthError(cause instanceof Error?cause.message:"Could not verify your session."); setAuthReady(true); }); return()=>{active=false}; },[path]);
  if (!authReady) return <RouteLoading/>;
  if (authError && path.startsWith("/dashboard")) return <main id="main-content" className="auth"><section className="auth-card"><h1>Workspace unavailable</h1><p className="error" role="alert">{authError}</p></section></main>;
  const route=path==="/auth/callback"?<AuthCallback/>:path==="/sign-in"?<SignIn/>:path==="/sign-up"?<><SkipLink/><SignUp/></>:path==="/intools" || path.startsWith("/intools/suppliers")?<Intools/>:path.startsWith("/dashboard")?<Dashboard path={path}/>:isFooterPagePath(path)?<><SkipLink/><FooterPage path={path}/></>:<Landing/>;return <Suspense fallback={<RouteLoading/>}>{route}</Suspense>
}
