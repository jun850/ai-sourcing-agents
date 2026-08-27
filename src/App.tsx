import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Alert, Button as MaterialButton, IconButton, InputAdornment, TextField } from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { Button, CopyGuard, SkipLink } from "./components";
import { AtelixLandingPage } from "./landing/landing";
import { getSession, isSupabaseConfigured, signInWithMagicLink, supabase } from "./supabase";

const loadDashboard = () => import("./dashboard").then(({ Dashboard: Route }) => ({ default: Route }));
const Dashboard = lazy(loadDashboard);
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
    <>
      <div className="route-skeleton-bar" />
      <div className="route-skeleton-intools-panel">
        <i className="route-skeleton-title" />
        <i className="route-skeleton-copy route-skeleton-copy-short" />
        <div className="route-skeleton-tabs"><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className="route-skeleton-rows"><i /><i /><i /><i /></div>
      </div>
    </>
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
function SignIn(){
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<"password" | "magic-link">("password");
  const [linkSent, setLinkSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // The workspace code is safe to fetch before authentication and has no data
  // side effects. Starting it here prevents the first successful sign-in from
  // waiting for a second, large route download.
  useEffect(() => { void loadDashboard(); }, []);

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

  async function sendMagicLink() {
    const safeEmail = email.trim();
    if (!safeEmail) { setError("Enter your work email first."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const next = sanitizeInternalPath(new URLSearchParams(location.search).get("next"));
      await signInWithMagicLink(safeEmail, `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`);
      setLinkSent(true);
      setNotice("If this email is eligible, we’ll send a magic link shortly.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the magic link.");
    } finally { setBusy(false); }
  }
  async function sendPasswordReset() {
    if (!email.trim()) { setError("Enter your work email first."); return; }
    setBusy(true); setError(""); setNotice("");
    try { if (!supabase) throw new Error("Password recovery is not configured for this environment."); await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}` }); setNotice("If this email has an account, we’ll send a password reset link shortly."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send the password reset link."); }
    finally { setBusy(false); }
  }

  function switchMethod(nextMethod: "password" | "magic-link") {
    setMethod(nextMethod); setError(""); setNotice(""); setLinkSent(false);
  }

  const emailField = <TextField id="email" name="email" label="Work email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} slotProps={{ htmlInput: { required: true } }} fullWidth/>;
  const ErrorAlert = error ? <Alert severity="error" role="alert">{error}</Alert> : null;
  const NoticeAlert = notice ? <Alert severity="success" role="status">{notice}</Alert> : null;
  const passwordField=<TextField id="password" type={showPassword ? "text" : "password"} name="password" label="Password" autoComplete="current-password" slotProps={{ input: { endAdornment: <InputAdornment position="end" sx={{ mr: .5 }}><IconButton aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)} sx={{ width: 40, height: 40, p: 1 }}>{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }, htmlInput: { required: true } }} fullWidth/>;
  return <><SkipLink/><main id="main-content" className="auth"><section className="auth-card auth-login" aria-labelledby="sign-in-title"><a href="/" className="wordmark">atelix<span>.</span></a><header className="auth-header"><p className="auth-eyebrow">Private sourcing workspace</p><h1 id="sign-in-title">{method === "password" ? "Welcome back" : linkSent ? "Check your email" : "Sign in with a magic link"}</h1><p>{method === "password" ? "Sign in to continue your sourcing work." : linkSent ? <>If <strong>{email.trim()}</strong> is eligible, a magic link will arrive shortly.</> : "We’ll email you a secure link — no password needed."}</p></header>{method === "password" ? <form className="auth-login-form" onSubmit={submitPassword}>{emailField}{passwordField}{ErrorAlert}{NoticeAlert}<MaterialButton type="submit" variant="contained" disabled={busy} aria-busy={busy}>Log in</MaterialButton><button className="auth-method-link" type="button" onClick={() => void sendPasswordReset()} disabled={busy}>Forgot password?</button><button className="auth-method-link" type="button" onClick={() => switchMethod("magic-link")} disabled={busy}>Use a magic link instead</button></form> : linkSent ? <div className="auth-login-form">{ErrorAlert}{NoticeAlert}<button className="auth-method-link" type="button" onClick={() => setLinkSent(false)} disabled={busy}>Use a different email</button><button className="auth-method-link" type="button" onClick={() => void sendMagicLink()} disabled={busy}>Send another link</button></div> : <form className="auth-login-form" onSubmit={(event) => { event.preventDefault(); void sendMagicLink(); }}>{emailField}{ErrorAlert}{NoticeAlert}<MaterialButton type="submit" variant="contained" disabled={busy} aria-busy={busy}>Send magic link</MaterialButton><button className="auth-method-link" type="button" onClick={() => switchMethod("password")} disabled={busy}>Use password instead</button></form>}<p className="auth-footnote">New to Atelix? <a href="/sign-up">Request access</a></p></section></main></>;
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
  useEffect(()=>{const section=path.startsWith("/dashboard")?"Dashboard":path==="/intools" || path.startsWith("/intools/")?"Intools":path==="/sign-up"?"Sign up":path==="/sign-in"?"Sign in":"Fashion sourcing";document.title=`${section} — Atelix`;},[path]);
  useEffect(()=>{ let active=true; let settled=false; let timeoutId: number | undefined; setAuthReady(false); setAuthError(""); if (!path.startsWith("/dashboard")) { setAuthReady(true); return; }
    const complete=(session: Awaited<ReturnType<typeof getSession>>)=>{ if (!active || settled) return; settled=true; if (timeoutId) window.clearTimeout(timeoutId); if (!session) { const next=`/sign-in?next=${encodeURIComponent(sanitizeInternalPath(path))}`; history.replaceState({},"",next); setPath("/sign-in"); return; } setAuthReady(true); };
    const authSubscription=supabase?.auth.onAuthStateChange((_,session)=>complete(session)).data.subscription;
    timeoutId=window.setTimeout(()=>{ if (!active || settled) return; settled=true; setAuthError("We couldn’t verify your session. Try again."); setAuthReady(true); },8000);
    void getSession().then(complete).catch((cause)=>{ if (!active || settled) return; settled=true; if (timeoutId) window.clearTimeout(timeoutId); setAuthError(cause instanceof Error?cause.message:"Could not verify your session."); setAuthReady(true); });
    return()=>{active=false; if (timeoutId) window.clearTimeout(timeoutId); authSubscription?.unsubscribe();};
  },[path,authAttempt]);
  if (!authReady) return <RouteLoading variant="dashboard"/>;
  if (authError && path.startsWith("/dashboard")) return <main id="main-content" className="auth"><section className="auth-card"><h1>Workspace unavailable</h1><p className="error" role="alert">{authError}</p><MaterialButton variant="contained" onClick={()=>setAuthAttempt((attempt)=>attempt+1)}>Try again</MaterialButton></section></main>;
  const route=path==="/auth/callback"?<AuthCallback/>:path==="/auth/set-password"||path==="/auth/reset-password"?<PasswordSetup/>:path==="/sign-in"?<SignIn/>:path==="/sign-up"?<><SkipLink/><SignUp/></>:path==="/intools" || path.startsWith("/intools/")?<Intools/>:path.startsWith("/dashboard")?<Dashboard path={path}/>:isFooterPagePath(path)?<><SkipLink/><CopyGuard><FooterPage path={path}/></CopyGuard></>:<Landing/>;return <Suspense fallback={<RouteLoading variant={routeSkeletonVariant(path)}/>}>{route}</Suspense>
}
