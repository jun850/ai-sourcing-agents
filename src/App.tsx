import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Button, SkipLink } from "./components";
import { AtelixLandingPage } from "./landing/landing";
import { getSession, isSupabaseConfigured, signInWithMagicLink, supabase } from "./supabase";

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

function RouteLoading() {
  return <main id="main-content" className="route-loading" aria-live="polite">Loading…</main>;
}

function Landing(){ return <><SkipLink/><AtelixLandingPage/></>; }
function SignIn(){
  const [error,setError]=useState(""); const [notice,setNotice]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form=new FormData(event.currentTarget); const email=String(form.get("email")||""); const password=String(form.get("password")||"");
    try {
      if (!supabase || !isSupabaseConfigured) throw new Error("Sign in is not configured for this environment.");
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      const next = new URLSearchParams(location.search).get("next") || "/dashboard";
      history.pushState({},"",next); dispatchEvent(new PopStateEvent("popstate"));
    } catch(cause) { setError(cause instanceof Error?cause.message:"Could not sign in."); } finally { setBusy(false); }
  }
  async function sendMagicLink(){
    const form = document.querySelector<HTMLFormElement>(".auth-card");
    const email=form ? String(new FormData(form).get("email")||"").trim() : "";
    if (!email) { setError("Enter your work email first."); return; }
    setBusy(true); setError(""); setNotice("");
    try { await signInWithMagicLink(email, `${location.origin}/auth/callback?next=${encodeURIComponent(new URLSearchParams(location.search).get("next") || "/dashboard")}`); setNotice("Check your email for a secure sign-in link."); }
    catch(cause) { setError(cause instanceof Error?cause.message:"Could not send the sign-in link."); } finally { setBusy(false); }
  }
  return <><SkipLink/><main id="main-content" className="auth"><form className="auth-card" onSubmit={submit} aria-labelledby="sign-in-title"><a href="/" className="wordmark">atelix<span>.</span></a><h1 id="sign-in-title">Welcome back</h1><p>Sign in to continue your sourcing work.</p><label htmlFor="email">Work email<input id="email" name="email" type="email" autoComplete="email" required/></label><label htmlFor="password">Password<input id="password" type="password" name="password" autoComplete="current-password" required/></label>{error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="success" role="status">{notice}</p>}<Button type="submit" disabled={busy} ariaBusy={busy}>{busy?"Signing in…":"Log in"}</Button><Button type="button" kind="secondary" disabled={busy} onClick={sendMagicLink}>Email me a sign-in link</Button><p className="auth-footnote">New to Atelix? <a href="/sign-up">Sign up</a></p></form></main></>;
}
function AuthCallback(){
  const [error,setError]=useState("");
  useEffect(()=>{ void (async()=>{ const code=new URLSearchParams(location.search).get("code"); if (code && supabase) { const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code); if (exchangeError) throw exchangeError; } const session=await getSession(); if (!session) throw new Error("This sign-in link is invalid or has expired."); const next=new URLSearchParams(location.search).get("next") || "/dashboard"; history.replaceState({},"",next); dispatchEvent(new PopStateEvent("popstate")); })().catch((cause)=>setError(cause instanceof Error?cause.message:"Could not complete sign in.")); },[]);
  return error ? <main id="main-content" className="auth"><section className="auth-card"><h1>Sign-in link unavailable</h1><p className="error" role="alert">{error}</p><a className="button" href="/sign-in">Return to sign in</a></section></main> : <RouteLoading/>;
}
export function App(){
  const [path,setPath]=useState(location.pathname); const [authReady,setAuthReady]=useState(false); const [authError,setAuthError]=useState("");
  useEffect(()=>{const listener=()=>setPath(location.pathname);addEventListener("popstate",listener);return()=>removeEventListener("popstate",listener)},[]);
  useEffect(()=>{const section=path.startsWith("/dashboard")?"Dashboard":path==="/intools" || path.startsWith("/intools/suppliers")?"Intools":path==="/sign-up"?"Sign up":path==="/sign-in"?"Sign in":"Fashion sourcing";document.title=`${section} — Atelix`;},[path]);
  useEffect(()=>{ let active=true; setAuthReady(false); setAuthError(""); if (!path.startsWith("/dashboard")) { setAuthReady(true); return; } void getSession().then((session)=>{ if (!active) return; if (!session) { const next=`/sign-in?next=${encodeURIComponent(path)}`; history.replaceState({},"",next); setPath("/sign-in"); } else setAuthReady(true); }).catch((cause)=>{ if (!active) return; setAuthError(cause instanceof Error?cause.message:"Could not verify your session."); setAuthReady(true); }); return()=>{active=false}; },[path]);
  if (!authReady) return <RouteLoading/>;
  if (authError && path.startsWith("/dashboard")) return <main id="main-content" className="auth"><section className="auth-card"><h1>Workspace unavailable</h1><p className="error" role="alert">{authError}</p></section></main>;
  const route=path==="/auth/callback"?<AuthCallback/>:path==="/sign-in"?<SignIn/>:path==="/sign-up"?<><SkipLink/><SignUp/></>:path==="/intools" || path.startsWith("/intools/suppliers")?<Intools/>:path.startsWith("/dashboard")?<Dashboard path={path}/>:isFooterPagePath(path)?<><SkipLink/><FooterPage path={path}/></>:<Landing/>;return <Suspense fallback={<RouteLoading/>}>{route}</Suspense>
}
