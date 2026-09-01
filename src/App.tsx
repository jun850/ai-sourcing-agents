import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Alert, Button as MaterialButton, IconButton, InputAdornment, TextField } from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { CopyGuard, SkipLink } from "./components";
import { AtelixLandingPage } from "./landing/landing";
import { RequestAccessForm } from "./registration";
import { getSession, isSupabaseConfigured, signInWithMagicLink, supabase, verifyEmailOtp } from "./supabase";

const loadDashboard = () => import("./dashboard").then(({ Dashboard: Route }) => ({ default: Route }));
const Dashboard = lazy(loadDashboard);
const Intools = lazy(() => import("./intools").then(({ Intools: Route }) => ({ default: Route })));
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
const PASSWORD_SETUP_USER_KEY = "atelix.auth.password-setup-user";
export function sanitizeInternalPath(value: string | null | undefined, fallback = AUTH_FALLBACK_PATH) {
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

type RouteSkeletonVariant = "dashboard" | "intools" | "auth" | "content";

function routeSkeletonVariant(path: string): RouteSkeletonVariant {
  if (path === "/auth/callback" || path === "/sign-in" || path === "/sign-up") return "auth";
  if (path === "/intools" || path.startsWith("/intools/")) return "intools";
  if (path.startsWith("/dashboard")) return "dashboard";
  return "content";
}

function DashboardSkeletonBody() {
  return (
    <>
      <div className="route-skeleton-bar" />
      <div className="route-skeleton-grid">
        <div className="route-skeleton-rail">
          <i /><i /><i /><i />
        </div>
        <div className="route-skeleton-panel">
          <i className="route-skeleton-title" />
          <i className="route-skeleton-copy" />
          <i className="route-skeleton-copy route-skeleton-copy-short" />
          <div className="route-skeleton-rows"><i /><i /><i /></div>
        </div>
      </div>
    </>
  );
}

function IntoolsSkeletonBody() {
  return (
    <div className="route-skeleton-intools">
      <div className="route-skeleton-intools-sidebar">
        <i /><i /><i /><i /><i /><i /><i /><i /><i />
      </div>
      <div className="route-skeleton-intools-main">
        <div className="route-skeleton-bar" />
        <div className="route-skeleton-intools-panel">
          <i className="route-skeleton-title" />
          <i className="route-skeleton-copy route-skeleton-copy-short" />
          <div className="route-skeleton-rows"><i /><i /><i /><i /><i /></div>
        </div>
      </div>
    </div>
  );
}

function AuthSkeletonBody() {
  return (
    <div className="route-skeleton-auth-card">
      <i className="route-skeleton-auth-word" />
      <i className="route-skeleton-title" />
      <i className="route-skeleton-copy" />
      <div className="route-skeleton-auth-fields"><i /><i /><i /><i /></div>
      <i className="route-skeleton-auth-button" />
    </div>
  );
}

function ContentSkeletonBody() {
  return (
    <>
      <div className="route-skeleton-hero">
        <i className="route-skeleton-eyebrow" />
        <i className="route-skeleton-hero-title" />
        <i className="route-skeleton-copy route-skeleton-copy-center" />
      </div>
      <div className="route-skeleton-features">
        {[0, 1, 2].map((row) => (
          <div className="route-skeleton-feature" key={row}>
            <i className="route-skeleton-feature-icon" />
            <div>
              <i className="route-skeleton-feature-title" />
              <i className="route-skeleton-copy" />
              <i className="route-skeleton-copy route-skeleton-copy-short" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RouteLoading({ variant = "content" }: { variant?: RouteSkeletonVariant }) {
  const body =
    variant === "dashboard" ? <DashboardSkeletonBody /> :
    variant === "intools" ? <IntoolsSkeletonBody /> :
    variant === "auth" ? <AuthSkeletonBody /> :
    <ContentSkeletonBody />;
  return (
    <main
      id="main-content"
      className="route-loading"
      aria-busy="true"
      aria-label="Content pending"
    >
      <div className={`route-skeleton route-skeleton--${variant}`} aria-hidden="true">
        {body}
      </div>
    </main>
  );
}

function Landing(){ return <><SkipLink/><CopyGuard><AtelixLandingPage/></CopyGuard></>; }
type SignInMode = "password" | "magic-link" | "signup";
type PasswordStep = "email" | "password";

const EyeIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>;
const EyeOffIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61C4.06 8.14 2 12 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M2 2l20 20"/></svg>;
const AlertIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
const CheckIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>;

function nextPath() {
  return sanitizeInternalPath(new URLSearchParams(location.search).get("next"));
}

function SignIn(){
  const initialMode: SignInMode = location.pathname === "/sign-up" || new URLSearchParams(location.search).get("mode") === "signup" ? "signup" : "password";
  const [mode, setMode] = useState<SignInMode>(initialMode);
  const [step, setStep] = useState<PasswordStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");

  // The workspace bundle is safe to prefetch before authentication and has no
  // data side effects; it keeps the first successful sign-in from waiting on a
  // second large download.
  useEffect(() => { void loadDashboard(); }, []);

  function completeSignIn() {
    history.pushState({}, "", nextPath());
    dispatchEvent(new PopStateEvent("popstate"));
  }
  function resetFeedback() { setError(""); setNotice(""); setOtpError(""); }
  function goToMode(next: SignInMode) { setMode(next); setStep("email"); setPassword(""); setMagicSent(false); setOtp(""); resetFeedback(); }
  function editEmail() { setStep("email"); setPassword(""); resetFeedback(); }

  async function onPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "email") { if (email.trim()) { setStep("password"); resetFeedback(); } return; }
    if (!password.trim()) return;
    setBusy(true); resetFeedback();
    try {
      if (!supabase || !isSupabaseConfigured) throw new Error("Sign in is not configured for this environment.");
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      completeSignIn();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not sign in.";
      setError(/invalid login|invalid credentials/i.test(message) ? "bad-credentials" : message);
    } finally { setBusy(false); }
  }

  async function sendMagicLink() {
    const safeEmail = email.trim();
    if (!safeEmail) { setError("Enter your work email first."); return; }
    setBusy(true); resetFeedback();
    try {
      await signInWithMagicLink(safeEmail, `${location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`);
      setMagicSent(true); setOtp("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the sign-in link.");
    } finally { setBusy(false); }
  }
  async function onMagicSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await sendMagicLink(); }

  async function onOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (otp.length !== 6) return;
    setBusy(true); setOtpError("");
    try {
      await verifyEmailOtp(email.trim(), otp);
      completeSignIn();
    } catch (cause) {
      setOtpError(cause instanceof Error ? cause.message : "That code is incorrect or expired.");
    } finally { setBusy(false); }
  }

  async function sendPasswordReset() {
    if (!email.trim()) { setError("Enter your email first."); return; }
    setBusy(true); resetFeedback();
    try {
      if (!supabase) throw new Error("Password recovery is not configured for this environment.");
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}` });
      setNotice("If this email has an account, we’ll send a password reset link shortly.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the password reset link.");
    } finally { setBusy(false); }
  }

  const passwordStepActive = step === "password";
  const continueDisabled = busy || (step === "email" ? !email.trim() : !password.trim());
  const credentialError = error === "bad-credentials";

  const help = (
    <div className="signin-help">
      <div className="signin-help-mark" aria-hidden="true">✦</div>
      <div className="signin-help-text">Need help signing in? <a href="mailto:info@arcanawangsa.com">info@arcanawangsa.com</a></div>
    </div>
  );

  return (
    <>
      <SkipLink/>
      <main id="main-content" className="signin-screen">
        <div className="signin-shell">
          <div className="signin-form-pane">
            <div className="signin-form-scroll">
              <div className="signin-form-col">
                <a href="/" className="signin-wordmark">atelix<span>.</span></a>

                {mode === "password" && (
                  <>
                    <h1 className="sr-only">Sign in to Atelix</h1>
                    {error && (
                      <div className="signin-alert is-error" role="alert">
                        <AlertIcon/>
                        <div>
                          <div className="signin-alert-title">Sign-in failed</div>
                          <div className="signin-alert-body">{credentialError ? "Wrong email or password. Try again or reset your password." : error}</div>
                        </div>
                      </div>
                    )}
                    {notice && <div className="signin-alert is-success" role="status"><CheckIcon/><div><div className="signin-alert-body">{notice}</div></div></div>}

                    <form onSubmit={onPasswordSubmit}>
                      <div className="signin-field-row">
                        <label className="signin-label" htmlFor="signin-email">Email</label>
                        {passwordStepActive && <button type="button" className="signin-link" onClick={editEmail}>Edit</button>}
                      </div>
                      <input id="signin-email" className="signin-input" type="email" autoComplete="email" placeholder="you@company.com"
                        value={email} disabled={passwordStepActive} onChange={(e) => { setEmail(e.target.value); resetFeedback(); }} required/>

                      {passwordStepActive && (
                        <div className="signin-gap">
                          <label className="signin-label" htmlFor="signin-password">Password</label>
                          <div className="signin-password-wrap">
                            <input id="signin-password" className={`signin-input has-affix${credentialError ? " is-error" : ""}`} type={showPassword ? "text" : "password"}
                              autoComplete="current-password" placeholder="Enter your password" autoFocus
                              value={password} onChange={(e) => { setPassword(e.target.value); resetFeedback(); }} required/>
                            <button type="button" className="signin-reveal" aria-label={showPassword ? "Hide password" : "Show password"}
                              onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeOffIcon/> : <EyeIcon/>}</button>
                          </div>
                        </div>
                      )}

                      <button type="submit" className="signin-submit" disabled={continueDisabled} aria-busy={busy}>
                        {busy ? "Signing in…" : "Continue"}
                      </button>
                    </form>

                    <p className="signin-fineprint">By proceeding, you agree to our <a href="/privacy-policy">Privacy Policy</a>, which explains how we handle your sourcing data.</p>
                    <div className="signin-linkrow">
                      {passwordStepActive && <><button type="button" className="signin-link" onClick={() => void sendPasswordReset()} disabled={busy}>Forgot password?</button><span className="sep">·</span></>}
                      <button type="button" className="signin-link" onClick={() => goToMode("magic-link")}>Email me a sign-in link</button>
                    </div>
                    <p className="signin-switch">New to Atelix? <button type="button" className="signin-link" onClick={() => goToMode("signup")}>Create an account</button></p>
                  </>
                )}

                {mode === "magic-link" && (
                  <>
                    <h1 className="sr-only">Sign in with a link</h1>
                    {magicSent ? (
                      <>
                        <div className="signin-alert is-success" role="status">
                          <CheckIcon/>
                          <div>
                            <div className="signin-alert-title">Check your email</div>
                            <div className="signin-alert-body">If {email.trim()} has an Atelix account, we’ve sent a sign-in link to it.</div>
                          </div>
                        </div>
                        {otpError && <div className="signin-otp-error" role="alert">{otpError}</div>}
                        <div className="signin-otp-block">
                          <p className="signin-otp-hint">The link is broken? Enter the 6-digit code we sent instead.</p>
                          <form className="signin-otp-form" onSubmit={onOtpSubmit}>
                            <input className="signin-otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                              aria-label="Six-digit sign-in code" placeholder="000000"
                              value={otp} onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpError(""); }}/>
                            <button type="submit" className="signin-otp-verify" disabled={otp.length !== 6 || busy}>Verify</button>
                          </form>
                          <p style={{ margin: "10px 0 0", textAlign: "center" }}>
                            <button type="button" className="signin-link" onClick={() => void sendMagicLink()} disabled={busy}>Resend code</button>
                          </p>
                        </div>
                        <p className="signin-switch"><button type="button" className="signin-link" onClick={() => goToMode("password")}>Back to sign in</button></p>
                      </>
                    ) : (
                      <>
                        <form onSubmit={onMagicSubmit}>
                          <label className="signin-label" htmlFor="signin-magic-email">Email</label>
                          <input id="signin-magic-email" className="signin-input" type="email" autoComplete="email" placeholder="you@company.com"
                            value={email} onChange={(e) => { setEmail(e.target.value); resetFeedback(); }} required style={{ marginTop: 8 }}/>
                          {error && <div className="signin-otp-error" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
                          <button type="submit" className="signin-submit" disabled={busy || !email.trim()} aria-busy={busy}>Email me a sign-in link</button>
                        </form>
                        <p className="signin-fineprint">By proceeding, you agree to our <a href="/privacy-policy">Privacy Policy</a>, which explains how we handle your sourcing data.</p>
                        <p className="signin-switch"><button type="button" className="signin-link" onClick={() => goToMode("password")}>Use a password instead</button></p>
                      </>
                    )}
                  </>
                )}

                {mode === "signup" && <RequestAccessForm onBackToSignIn={() => goToMode("password")}/>}

                {help}
              </div>
            </div>
          </div>

          <div className="signin-photo-pane">
            <img src="/assets/generated/atelix-signin.jpg" alt="" />
          </div>
        </div>
      </main>
    </>
  );
}
function AuthCallback(){
  const [error,setError]=useState("");
  useEffect(()=>{ void loadDashboard(); void (async()=>{ if (!supabase) throw new Error("Sign-in is not configured for this environment."); const query=new URLSearchParams(location.search); const hash=new URLSearchParams(location.hash.slice(1)); const code=query.get("code"); const tokenHash=query.get("token_hash"); const type=query.get("type"); let session=null; if(code){ const {data,error:exchangeError}=await supabase.auth.exchangeCodeForSession(code); if(exchangeError)throw exchangeError; session=data.session; } else if(tokenHash&&(type==="invite"||type==="recovery"||type==="email")){ const {data,error:verifyError}=await supabase.auth.verifyOtp({token_hash:tokenHash,type}); if(verifyError)throw verifyError; session=data.session; } else if(hash.get("access_token")&&hash.get("refresh_token")){ const {data,error:setError}=await supabase.auth.setSession({access_token:hash.get("access_token")!,refresh_token:hash.get("refresh_token")!}); if(setError)throw setError; session=data.session; } else throw new Error("This sign-in link is invalid or has expired."); if(!session)throw new Error("This sign-in link is invalid or has expired."); const next=sanitizeInternalPath(query.get("next")); if(next==="/auth/set-password"||next==="/auth/reset-password") sessionStorage.setItem(PASSWORD_SETUP_USER_KEY,session.user.id); history.replaceState({},"",next); dispatchEvent(new PopStateEvent("popstate")); })().catch((cause)=>setError(cause instanceof Error?cause.message:"Could not complete sign in.")); },[]);
  return error ? <main id="main-content" className="auth"><section className="auth-card"><h1>Sign-in link unavailable</h1><p className="error" role="alert">{error}</p><a className="button" href="/sign-in">Return to sign in</a></section></main> : <RouteLoading variant="auth"/>;
}
function PasswordSetup(){
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [showPassword,setShowPassword]=useState(false);
  async function submit(event: FormEvent<HTMLFormElement>){ event.preventDefault(); const password=String(new FormData(event.currentTarget).get("password")||""); const confirmation=String(new FormData(event.currentTarget).get("confirmation")||""); if(password.length<8){setError("Use at least 8 characters for your password.");return;} if(password!==confirmation){setError("Your passwords do not match.");return;} setBusy(true);setError("");try{if(!supabase)throw new Error("Password setup is not configured for this environment.");const expectedUserId=sessionStorage.getItem(PASSWORD_SETUP_USER_KEY);const session=await getSession();if(!expectedUserId||!session||session.user.id!==expectedUserId)throw new Error("Open the password link from your email to set up this account.");const {error:updateError}=await supabase.auth.updateUser({password});if(updateError)throw updateError;sessionStorage.removeItem(PASSWORD_SETUP_USER_KEY);history.replaceState({},"","/dashboard");dispatchEvent(new PopStateEvent("popstate"));}catch(cause){setError(cause instanceof Error?cause.message:"Could not update your password.");}finally{setBusy(false);}}
  const passwordType=showPassword?"text":"password";
  const reveal=<InputAdornment position="end" sx={{mr:.5}}><IconButton aria-label={showPassword?"Hide password":"Show password"} onClick={()=>setShowPassword((visible)=>!visible)} sx={{width:40,height:40,p:1}}>{showPassword?<VisibilityOff/>:<Visibility/>}</IconButton></InputAdornment>;
  return <><SkipLink/><main id="main-content" className="auth"><section className="auth-card auth-login"><a href="/" className="wordmark">atelix<span>.</span></a><header className="auth-header"><h1>Set your password</h1><p>Finish setting up your sourcing workspace.</p></header><form className="auth-login-form" onSubmit={submit}><TextField name="password" type={passwordType} label="New password" autoComplete="new-password" slotProps={{input:{endAdornment:reveal},htmlInput:{required:true,minLength:8}}} fullWidth/><TextField name="confirmation" type={passwordType} label="Confirm password" autoComplete="new-password" slotProps={{htmlInput:{required:true,minLength:8}}} fullWidth/>{error&&<Alert severity="error" role="alert">{error}</Alert>}<MaterialButton type="submit" variant="contained" disabled={busy}>Finish setup</MaterialButton></form></section></main></>;
}
export function App(){
  const [path,setPath]=useState(location.pathname); const [authReady,setAuthReady]=useState(false); const [authError,setAuthError]=useState(""); const [authAttempt,setAuthAttempt]=useState(0);
  useEffect(()=>{const listener=()=>setPath(location.pathname);addEventListener("popstate",listener);return()=>removeEventListener("popstate",listener)},[]);
  useEffect(()=>{const section=path.startsWith("/dashboard")?"Dashboard":path==="/intools" || path.startsWith("/intools/")?"Intools":path==="/sign-in"||path==="/sign-up"?"Sign in":path==="/"?"AI sourcing agents for global brands":"Fashion sourcing";document.title=`${section} — Atelix`;},[path]);
  useEffect(()=>{ let active=true; let settled=false; let timeoutId: number | undefined; setAuthReady(false); setAuthError(""); if (!path.startsWith("/dashboard")) { setAuthReady(true); return; }
    const complete=(session: Awaited<ReturnType<typeof getSession>>)=>{ if (!active || settled) return; settled=true; if (timeoutId) window.clearTimeout(timeoutId); if (!session) { const next=`/sign-in?next=${encodeURIComponent(sanitizeInternalPath(path))}`; history.replaceState({},"",next); setPath("/sign-in"); return; } setAuthReady(true); };
    const authSubscription=supabase?.auth.onAuthStateChange((_,session)=>complete(session)).data.subscription;
    timeoutId=window.setTimeout(()=>{ if (!active || settled) return; settled=true; setAuthError("We couldn’t verify your session. Try again."); setAuthReady(true); },8000);
    void getSession().then(complete).catch((cause)=>{ if (!active || settled) return; settled=true; if (timeoutId) window.clearTimeout(timeoutId); setAuthError(cause instanceof Error?cause.message:"Could not verify your session."); setAuthReady(true); });
    return()=>{active=false; if (timeoutId) window.clearTimeout(timeoutId); authSubscription?.unsubscribe();};
  },[path,authAttempt]);
  if (!authReady) return <RouteLoading variant="dashboard"/>;
  if (authError && path.startsWith("/dashboard")) return <main id="main-content" className="auth"><section className="auth-card"><h1>Workspace unavailable</h1><p className="error" role="alert">{authError}</p><MaterialButton variant="contained" onClick={()=>setAuthAttempt((attempt)=>attempt+1)}>Try again</MaterialButton></section></main>;
  const route=path==="/auth/callback"?<AuthCallback/>:path==="/auth/set-password"||path==="/auth/reset-password"?<PasswordSetup/>:path==="/sign-in"||path==="/sign-up"?<SignIn/>:path==="/intools" || path.startsWith("/intools/")?<Intools/>:path.startsWith("/dashboard")?<Dashboard path={path}/>:isFooterPagePath(path)?<><SkipLink/><CopyGuard><FooterPage path={path}/></CopyGuard></>:<Landing/>;return <Suspense fallback={<RouteLoading variant={routeSkeletonVariant(path)}/>}>{route}</Suspense>
}
