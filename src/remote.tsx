import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GitHubClient, type GitHubSession } from "./github";
import type { Snapshot } from "./types";
import type { Config } from "./policy";
import { useWorkspace } from "./workspace";

function useRemoteState() {
  const workspace = useWorkspace();
  const [session, setSession] = useState<GitHubSession | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [lastCommit, setLastCommit] = useState("");
  const client = useRef<GitHubClient | null>(null),
    generation = useRef(0);
  const disconnect = () => {
    generation.current++;
    client.current?.disconnect();
    client.current = null;
    setSession(null);
    setSnapshot(null);
    setError("");
    setBusy(false);
  };
  const connect = async (token: string) => {
    disconnect();
    const id = generation.current;
    setBusy(true);
    setError("");
    try {
      const api = new GitHubClient(token);
      client.current = api;
      const next = await api.connect();
      const data = await api.readSnapshot();
      if (generation.current !== id) return false;
      if (!workspace.rebase(next.remote.config))
        throw new Error("本地草稿发生冲突，请导出备份并重新载入后连接。");
      setSession(next);
      setSnapshot(data);
      return true;
    } catch (e) {
      if (generation.current === id) {
        client.current?.disconnect();
        client.current = null;
        setError(e instanceof Error ? e.message : "GitHub 连接失败，请重试。");
      }
      return false;
    } finally {
      if (generation.current === id) setBusy(false);
    }
  };
  const refresh = async () => {
    if (!client.current || !session) return;
    const id = generation.current;
    setBusy(true);
    setError("");
    try {
      const [remote, data] = await Promise.all([
        client.current.readConfig(),
        client.current.readSnapshot(),
      ]);
      if (generation.current !== id) return;
      setSession({ ...session, remote });
      setSnapshot(data);
      workspace.rebase(remote.config);
    } catch (e) {
      if (generation.current === id)
        setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      if (generation.current === id) setBusy(false);
    }
  };
  const publish = async (config: Config) => {
    if (!client.current || !session) return false;
    const id = generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await client.current.publish(config, session);
      if (generation.current !== id) return false;
      setSession({ ...session, remote: result.remote });
      workspace.markPublished(result.remote.config);
      setLastCommit(result.url);
      return true;
    } catch (e) {
      if (generation.current === id)
        setError(e instanceof Error ? e.message : "提交失败");
      return false;
    } finally {
      if (generation.current === id) setBusy(false);
    }
  };
  return {
    session,
    snapshot,
    busy,
    error,
    setError,
    connect,
    disconnect,
    refresh,
    publish,
    lastCommit,
    api: client.current,
  };
}
const Remote = createContext<ReturnType<typeof useRemoteState> | null>(null);
export function RemoteProvider({ children }: { children: ReactNode }) {
  return <Remote.Provider value={useRemoteState()}>{children}</Remote.Provider>;
}
export function useRemote() {
  const context = useContext(Remote);
  if (!context) throw new Error("Missing GitHub context");
  return context;
}
