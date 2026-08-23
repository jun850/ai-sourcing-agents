import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api";
import { Button, SkipLink } from "./components";
import { AtelixLandingPage } from "./landing/landing";

const Dashboard = lazy(() => import("./dashboard").then(({ Dashboard: Route }) => ({ default: Route })));
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
function SignIn(){ const [error,setError]=useState(""); const [busy,setBusy]=useState(false); async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");const form=new FormData(event.currentTarget);try{await api("/api/auth/login",{method:"POST",body:JSON.stringify({username:form.get("username"),password:form.get("password")})});history.pushState({},"","/dashboard");dispatchEvent(new PopStateEvent("popstate"));}catch(cause){setError(cause instanceof Error?cause.message:"Could not sign in.");}finally{setBusy(false)}}return <><SkipLink/><main id="main-content" className="auth"><form className="auth-card" onSubmit={submit} aria-labelledby="sign-in-title"><a href="/" className="wordmark">atelix<span>.</span></a><h1 id="sign-in-title">Welcome back</h1><p>Sign in to continue your sourcing work.</p><label htmlFor="username">Username<input id="username" name="username" defaultValue="admin" autoComplete="username" required/></label><label htmlFor="password">Password<input id="password" type="password" name="password" defaultValue="123456" autoComplete="current-password" required/></label>{error&&<p className="error" role="alert">{error}</p>}<Button type="submit" disabled={busy} ariaBusy={busy}>{busy?"Signing in…":"Log in"}</Button><p className="auth-footnote">New to Atelix? <a href="/sign-up">Sign up</a></p></form></main></>}
export function App(){const [path,setPath]=useState(location.pathname);useEffect(()=>{const listener=()=>setPath(location.pathname);addEventListener("popstate",listener);return()=>removeEventListener("popstate",listener)},[]);useEffect(()=>{const section=path.startsWith("/dashboard")?"Dashboard":path==="/sign-up"?"Sign up":path==="/sign-in"?"Sign in":"Fashion sourcing";document.title=`${section} — Atelix`;},[path]);const route=path==="/sign-in"?<SignIn/>:path==="/sign-up"?<><SkipLink/><SignUp/></>:path.startsWith("/dashboard")?<Dashboard path={path}/>:isFooterPagePath(path)?<><SkipLink/><FooterPage path={path}/></>:<Landing/>;return <Suspense fallback={<RouteLoading/>}>{route}</Suspense>}
