import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clone,
  configSchema,
  defaultConfig,
  diffConfig,
  type Config,
} from "./policy";
import { z } from "zod";

const STORAGE_KEY = "feishubrief.console.workspace.v1";
export interface Version {
  id: string;
  name: string;
  createdAt: string;
  config: Config;
  changes: number;
}
interface Workspace {
  config: Config;
  baseline: Config;
  versions: Version[];
  revision: string;
  remoteBase: Config | null;
}
function initial(): Workspace {
  return {
    config: clone(defaultConfig),
    baseline: clone(defaultConfig),
    versions: [],
    revision: "",
    remoteBase: null,
  };
}
function readWorkspace(): { state: Workspace; error: string } {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return { state: initial(), error: "" };
    const value = JSON.parse(text);
    const config = configSchema.parse(value.config),
      baseline = configSchema.parse(value.baseline);
    if (!Array.isArray(value.versions) || typeof value.revision !== "string")
      throw new Error();
    const versions = z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1).max(60),
            createdAt: z.iso.datetime(),
            config: configSchema,
            changes: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(20)
      .parse(value.versions);
    return {
      state: {
        config,
        baseline,
        versions,
        revision: value.revision,
        remoteBase: value.remoteBase
          ? configSchema.parse(value.remoteBase)
          : null,
      },
      error: "",
    };
  } catch {
    return {
      state: initial(),
      error: "本地草稿无法读取，已载入默认策略。原存储尚未覆盖。",
    };
  }
}
function useWorkspaceState() {
  const [loaded] = useState(readWorkspace);
  const [state, setState] = useState<Workspace>(loaded.state);
  const [error, setError] = useState(loaded.error);
  const [conflict, setConflict] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [undoStack, setUndoStack] = useState<Config[]>([]),
    [redoStack, setRedoStack] = useState<Config[]>([]);
  const current = useRef(state);
  current.current = state;
  const recovered = useRef(!loaded.error);
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setConflict(true);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  const persist = (next: Workspace): boolean => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (
        recovered.current &&
        ((raw && JSON.parse(raw).revision !== current.current.revision) ||
          (!raw && current.current.revision))
      ) {
        setConflict(true);
        return false;
      }
      const revised = { ...next, revision: crypto.randomUUID() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(revised));
      recovered.current = true;
      current.current = revised;
      setState(revised);
      setError("");
      setSaveStatus("草稿已保存到此浏览器");
      return true;
    } catch {
      setError("本地存储不可用，请导出配置备份。");
      return false;
    }
  };
  const update = (change: (draft: Config) => void) => {
    if (conflict) return false;
    const previous = clone(current.current.config);
    const draft = clone(current.current.config);
    change(draft);
    const result = configSchema.safeParse(draft);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "配置无效");
      return false;
    }
    if (persist({ ...current.current, config: result.data })) {
      setUndoStack((stack) => [...stack.slice(-29), previous]);
      setRedoStack([]);
      return true;
    }
    return false;
  };
  const replace = (config: Config) =>
    update((draft) => Object.assign(draft, config));
  const rebase = (config: Config) => {
    const currentState = current.current;
    if (
      currentState.remoteBase &&
      JSON.stringify(currentState.remoteBase) === JSON.stringify(config)
    )
      return true;
    const dirty =
      diffConfig(
        currentState.remoteBase ?? currentState.baseline,
        currentState.config,
      ).length > 0;
    return persist({
      ...currentState,
      baseline: clone(config),
      remoteBase: clone(config),
      config: dirty ? currentState.config : clone(config),
    });
  };
  const markPublished = (config: Config) =>
    persist({
      ...current.current,
      baseline: clone(config),
      remoteBase: clone(config),
    });
  const undo = () => {
    const previous = undoStack.at(-1);
    if (previous && persist({ ...state, config: previous })) {
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((s) => [...s, state.config]);
    }
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (next && persist({ ...state, config: next })) {
      setRedoStack((s) => s.slice(0, -1));
      setUndoStack((s) => [...s, state.config]);
    }
  };
  const saveVersion = (name: string) => {
    const version: Version = {
      id: crypto.randomUUID(),
      name: name.trim() || state.config.name,
      createdAt: new Date().toISOString(),
      config: clone(state.config),
      changes: diffConfig(state.baseline, state.config).length,
    };
    if (
      persist({
        ...state,
        baseline: clone(state.config),
        versions: [version, ...state.versions].slice(0, 20),
      })
    ) {
      setSaveStatus("本地版本已保存");
      return true;
    }
    return false;
  };
  return {
    ...state,
    update,
    replace,
    rebase,
    markPublished,
    undo,
    redo,
    canUndo: !!undoStack.length,
    canRedo: !!redoStack.length,
    saveVersion,
    error,
    setError,
    conflict,
    saveStatus,
    changes: diffConfig(state.baseline, state.config),
  };
}
const Context = createContext<ReturnType<typeof useWorkspaceState> | null>(
  null,
);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  return (
    <Context.Provider value={useWorkspaceState()}>{children}</Context.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing workspace");
  return value;
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
