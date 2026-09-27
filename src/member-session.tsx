import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MemberApi, MemberApiError, type MemberCapabilities, type MemberSession } from "./member-api";

type Phase = "loading" | "ready" | "login" | "unavailable" | "hidden" | "logout-unconfirmed";
interface SessionState {
  api: MemberApi | null; session: MemberSession | null; capabilities: MemberCapabilities | null;
  phase: Phase; message: string; epoch: number;
  refresh: () => void; expire: () => void; authenticated: () => void; logout: () => Promise<void>;
}
const Context = createContext<SessionState | null>(null);

export function MemberSessionProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<MemberApi | null>(null);
  const [session, setSession] = useState<MemberSession | null>(null);
  const [capabilities, setCapabilities] = useState<MemberCapabilities | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [epoch, setEpoch] = useState(0);
  const [reload, setReload] = useState(0);
  const client = useRef<MemberApi | null>(null);
  const generation = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const mounted = useRef(true);
  const logoutState = useRef<"none" | "pending" | "uncertain">("none");
  const logoutClient = useRef<MemberApi | null>(null);
  const clear = useCallback(() => { setSession(null); setCapabilities(null); setApi(null); setEpoch(n => n + 1); }, []);
  const refresh = useCallback(() => {
    generation.current++; client.current?.close(); client.current = null;
    clear(); setMessage("");
    if (document.visibilityState !== "visible") { setPhase("hidden"); return; }
    if (logoutState.current !== "none") {
      setPhase(logoutState.current === "pending" ? "loading" : "logout-unconfirmed");
      setMessage(logoutState.current === "pending" ? "正在退出…" : "本页数据已清空，服务端退出未确认，请重试退出。"); return;
    }
    setPhase("loading"); setReload(n => n + 1);
  }, [clear]);
  const expire = useCallback(() => {
    if (logoutState.current !== "none" || document.visibilityState !== "visible") { refresh(); return; }
    generation.current++; client.current?.close(); clear();
    const fresh = new MemberApi(); client.current = fresh; setApi(fresh);
    setPhase("login"); setMessage("会话已失效，请重新登录。");
  }, [clear, refresh]);
  const authenticated = useCallback(() => { channel.current?.postMessage("revalidate"); refresh(); }, [refresh]);

  useEffect(() => {
    if (document.visibilityState !== "visible") { clear(); setPhase("hidden"); return; }
    if (logoutState.current !== "none") return;
    const next = new MemberApi(); client.current = next; setApi(next);
    const id = ++generation.current;
    setPhase("loading"); setMessage("");
    void (async () => {
      const identity = await next.session();
      if (id !== generation.current) return;
      let capabilities: MemberCapabilities | null = null;
      try { capabilities = await next.capabilities(); }
      catch (error) {
        if (error instanceof MemberApiError && error.status === 401) throw error;
        // Legacy service keeps radar/member management; new pages need explicit support.
        if (!(error instanceof MemberApiError && [404, 501].includes(error.status))) throw error;
      }
      if (id !== generation.current) return;
      setSession(identity); setCapabilities(capabilities); setPhase("ready");
    })().catch(error => {
      if (id !== generation.current) return;
      clear();
      if (error instanceof MemberApiError && [401, 403].includes(error.status)) { setApi(next); setPhase("login"); }
      else { next.close(); client.current = null; setPhase("unavailable"); setMessage(error instanceof Error ? error.message : "成员服务暂时不可用"); }
    });
    return () => { generation.current++; next.close(); client.current?.close(); };
  }, [reload, clear]);

  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      generation.current++; client.current?.close(); client.current = null;
      clear(); setMessage(""); setPhase("hidden");
    };
    const visibility = () => { if (document.visibilityState === "visible") refresh(); else hide(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide); window.addEventListener("pageshow", restored);
    if (typeof BroadcastChannel !== "undefined") {
      const messages = new BroadcastChannel("feishubrief-member-session");
      messages.onmessage = () => refresh(); channel.current = messages;
    }
    return () => {
      mounted.current = false; logoutClient.current?.close();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", restored);
      channel.current?.close(); channel.current = null;
    };
  }, [refresh, clear]);

  const logout = async () => {
    if (logoutState.current === "pending") return;
    const connected = client.current;
    const target = connected ?? new MemberApi();
    const knownSession = !!session;
    logoutState.current = "pending"; logoutClient.current = target;
    generation.current++; client.current = null;
    clear(); setPhase("loading"); setMessage("正在退出…");
    try {
      if (!knownSession) await target.session();
      await target.logout();
      channel.current?.postMessage("revalidate");
      if (!mounted.current) return;
      logoutState.current = "none"; generation.current++; (client.current as MemberApi | null)?.close(); clear();
      if (document.visibilityState !== "visible") { setPhase("hidden"); setMessage(""); return; }
      const fresh = new MemberApi(); client.current = fresh; setApi(fresh);
      setPhase("login"); setMessage("已退出");
    } catch (error) {
      target.close();
      if (!mounted.current) return;
      generation.current++; client.current?.close(); client.current = null; clear();
      if (error instanceof MemberApiError && error.status === 401) {
        logoutState.current = "none";
        const fresh = new MemberApi(); client.current = fresh; setApi(fresh);
        setPhase("login"); setMessage("已退出"); channel.current?.postMessage("revalidate");
      } else { logoutState.current = "uncertain"; setPhase("logout-unconfirmed"); setMessage("本页数据已清空，服务端退出未确认，请重试退出。"); }
    } finally { logoutClient.current = null; }
  };
  return <Context.Provider value={{ api, session, capabilities, phase, message, epoch, refresh, expire, authenticated, logout }}>{children}</Context.Provider>;
}

export function useMemberSession() {
  const context = useContext(Context);
  if (!context) throw new Error("MemberSessionProvider is required");
  return context;
}
