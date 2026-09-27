import React, { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource-variable/noto-sans-sc";
import "../tokens.css";
import "./styles.css";
// Only the selected surface is imported. Members never load the PAT providers.
const isMemberRoute = () => /\/app(?:\/|$)/.test(location.pathname) || /^#\/app(?:\/|$)/.test(location.hash);
const MemberSurface = lazy(() => import("./MemberApp"));
const AdminSurface = lazy(() => import("./AdminApp"));
function Surface() {
  const [member, setMember] = useState(isMemberRoute);
  const declared = document.querySelector<HTMLMetaElement>('meta[name="feishubrief-surface"]')?.content;
  const [redirecting, setRedirecting] = useState(() => !!declared && (declared === "member") !== isMemberRoute());
  useEffect(() => {
    const changed = () => {
      const nextMember = isMemberRoute();
      // A server CSP is fixed for the current document. Reload when crossing surfaces
      // so a member page cannot inherit the administrator's GitHub connect permission.
      if (declared && (declared === "member") !== nextMember) {
        setRedirecting(true);
        const suffix = location.hash.match(/^#\/app(\/[^?#]*)?$/)?.[1] || "";
        location.replace(nextMember ? "/app" + suffix : "/admin" + (/^#\/[a-z-]+$/.test(location.hash) ? location.hash : ""));
      } else { setRedirecting(false); setMember(nextMember); }
    };
    changed();
    window.addEventListener("hashchange", changed); window.addEventListener("popstate", changed);
    return () => { window.removeEventListener("hashchange", changed); window.removeEventListener("popstate", changed); };
  }, []);
  if (redirecting) return <p role="status">正在切换工作台…</p>;
  return member ? <MemberSurface /> : <AdminSurface />;
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal-error">
        <h1>工作台暂时无法显示</h1>
          <p>请重新载入页面。</p>
        <button
          className="button button-primary"
          onClick={() => location.reload()}
        >
          重新载入
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<p role="status">正在加载…</p>}><Surface /></Suspense>
    </ErrorBoundary>
  </React.StrictMode>,
);
