import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  CloudUpload,
  Command,
  Download,
  Eye,
  FileText,
  GitBranch,
  History,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Newspaper,
  PanelLeftClose,
  Plus,
  Redo2,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
  Waypoints,
  Workflow,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  ExternalLink,
  IconButton,
  Modal,
} from "./components";
import { matchTopics, previewPapers, sourceEnabled } from "./policy";
import { type Article, type PageId, type Snapshot } from "./types";
import { downloadJson, useWorkspace } from "./workspace";
import { DiffTable } from "./pages/Operations";
import { useRemote } from "./remote";
import { ConnectionGate, PublishDialog } from "./Connection";
const Overview = lazy(() => import("./pages/Overview"));
const Research = lazy(() => import("./pages/Research"));
const Sources = lazy(() => import("./pages/Sources"));
const Papers = lazy(() => import("./pages/Papers"));
const Reports = lazy(() => import("./pages/Reports"));
const Messages = lazy(() =>
  import("./pages/Reports").then((m) => ({ default: m.Messages })),
);
const Models = lazy(() =>
  import("./pages/Operations").then((m) => ({ default: m.Models })),
);
const Runs = lazy(() =>
  import("./pages/Operations").then((m) => ({ default: m.Runs })),
);
const Versions = lazy(() =>
  import("./pages/Operations").then((m) => ({ default: m.Versions })),
);
const Settings = lazy(() =>
  import("./pages/Operations").then((m) => ({ default: m.Settings })),
);

const navigation: {
  id: PageId;
  name: string;
  icon: typeof Search;
  group: string;
}[] = [
  { id: "overview", name: "情报总览", icon: LayoutDashboard, group: "工作区" },
  {
    id: "research",
    name: "研究重点",
    icon: SlidersHorizontal,
    group: "编辑策略",
  },
  { id: "sources", name: "信源管理", icon: Waypoints, group: "编辑策略" },
  { id: "papers", name: "论文策略", icon: BookOpen, group: "编辑策略" },
  { id: "reports", name: "日报与周报", icon: FileText, group: "内容与发布" },
  {
    id: "messages",
    name: "消息摘要",
    icon: MessageSquare,
    group: "内容与发布",
  },
  { id: "models", name: "模型与质量", icon: ShieldCheck, group: "系统" },
  { id: "runs", name: "运行中心", icon: Workflow, group: "系统" },
  { id: "versions", name: "配置版本", icon: History, group: "系统" },
];
function readPage(): PageId {
  const id = location.hash.replace("#/", "");
  return [...navigation.map((p) => p.id), "settings"].includes(id)
    ? (id as PageId)
    : "overview";
}

function Loading() {
  return (
    <div className="loading-content" aria-label="正在加载" aria-busy="true">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-panel" />
      <div className="skeleton skeleton-panel" />
    </div>
  );
}

function Preview({ data, onClose }: { data: Snapshot; onClose: () => void }) {
  const { config, baseline } = useWorkspace();
  const latest = data.reports[0];
  const before = previewPapers(
    latest,
    data.reports,
    data.sources,
    baseline,
  ).filter((p) => p.accepted);
  const after = previewPapers(
    latest,
    data.reports,
    data.sources,
    config,
  ).filter((p) => p.accepted);
  const added = after.filter(
      (p) => !before.some((q) => q.article.url === p.article.url),
    ),
    removed = before.filter(
      (p) => !after.some((q) => q.article.url === p.article.url),
    );
  return (
    <Modal title="策略影响预览" onClose={onClose} wide>
      <div className="preview-context">
        <Badge tone="blue">历史回放</Badge>
        <span>{latest?.date} · 不调用模型</span>
      </div>
      <div className="comparison-metrics">
        <div>
          <span>启用信源</span>
          <strong>
            {data.sources.filter((s) => sourceEnabled(s, baseline)).length}
            <ArrowRight size={17} />
            {data.sources.filter((s) => sourceEnabled(s, config)).length}
          </strong>
        </div>
        <div>
          <span>回放入选论文</span>
          <strong>
            {before.length}
            <ArrowRight size={17} />
            {after.length}
          </strong>
        </div>
        <div>
          <span>消息目标条数</span>
          <strong>
            {Object.values(baseline.notifications.feishu).reduce(
              (a, b) => a + b,
              0,
            )}
            <ArrowRight size={17} />
            {Object.values(config.notifications.feishu).reduce(
              (a, b) => a + b,
              0,
            )}
          </strong>
        </div>
      </div>
      <div className="preview-delta">
        <h3>
          新增入选 <Badge tone="green">{added.length}</Badge>
        </h3>
        {added.map((p) => (
          <p key={p.article.url}>
            <Plus size={14} />
            {p.article.title}
          </p>
        ))}
        <h3>
          不再入选 <Badge tone="amber">{removed.length}</Badge>
        </h3>
        {removed.map((p) => (
          <p key={p.article.url}>
            <X size={14} />
            {p.article.title}
          </p>
        ))}
      </div>
      <DiffTable before={baseline} after={config} />
      <p className="data-note">
        预览依据已归档候选和关键词规则；新增信源尚未采集的内容无法估计。提交配置后由下一次日报运行采用。
      </p>
    </Modal>
  );
}

function Palette({
  data,
  navigate,
  onClose,
  inspect,
  searchSource,
}: {
  data: Snapshot;
  navigate: (id: PageId) => void;
  onClose: () => void;
  inspect: (a: Article) => void;
  searchSource: (q: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const q = query.toLowerCase();
  const results = [
    ...navigation
      .filter((n) => !q || n.name.includes(q))
      .map((n) => ({
        key: n.id,
        title: n.name,
        group: "页面",
        icon: n.icon,
        run: () => navigate(n.id),
      })),
    ...(q
      ? data.sources
          .filter((s) => `${s.name} ${s.id}`.toLowerCase().includes(q))
          .slice(0, 5)
          .map((s) => ({
            key: s.id,
            title: s.name,
            group: "信源",
            icon: Waypoints,
            run: () => searchSource(s.name),
          }))
      : []),
    ...(q
      ? (data.reports[0]?.articles ?? [])
          .filter((a) => a.title.toLowerCase().includes(q))
          .slice(0, 5)
          .map((a, i) => ({
            key: `a-${i}`,
            title: a.title,
            group: "内容",
            icon: FileText,
            run: () => inspect(a),
          }))
      : []),
  ];
  return (
    <Modal title="搜索工作台" onClose={onClose}>
      <div className="palette-search">
        <Search size={20} />
        <input
          autoFocus
          value={query}
          aria-label="搜索页面、信源和内容"
          placeholder="搜索页面、信源和内容…"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((n) => Math.min(n + 1, results.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((n) => Math.max(0, n - 1));
            }
            if (e.key === "Enter" && results[active]) {
              onClose();
              results[active].run();
            }
          }}
          aria-controls="command-results"
          aria-activedescendant={
            results[active] ? `command-${results[active].key}` : undefined
          }
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
        />
      </div>
      <div id="command-results" role="listbox" className="palette-results">
        {results.map((r, i) => (
          <button
            key={r.key}
            id={`command-${r.key}`}
            role="option"
            aria-selected={i === active}
            onClick={() => {
              onClose();
              r.run();
            }}
            onMouseEnter={() => setActive(i)}
          >
            <r.icon size={17} />
            <span>{r.title}</span>
            <small>{r.group}</small>
          </button>
        ))}
      </div>
      {!results.length && <Empty title="没有找到匹配项" />}
    </Modal>
  );
}

export default function App() {
  const workspace = useWorkspace();
  const remote = useRemote();
  const { config, baseline, changes, versions, saveVersion } = workspace;
  const [page, setPage] = useState<PageId>(readPage),
    [mobileNav, setMobileNav] = useState(false);
  const data = remote.snapshot;
  const loading = remote.busy && !data;
  const error = remote.error;
  const [publishOpen, setPublishOpen] = useState(false);
  const [palette, setPalette] = useState(false),
    [preview, setPreview] = useState(false),
    [article, setArticle] = useState<Article | null>(null),
    [saveOpen, setSaveOpen] = useState(false),
    [versionName, setVersionName] = useState(""),
    [sourceSearch, setSourceSearch] = useState("");
  const mainRef = useRef<HTMLElement>(null);
  const reload = remote.refresh;
  useEffect(() => {
    const change = () => {
      setPage(readPage());
      setMobileNav(false);
      window.scrollTo(0, 0);
      mainRef.current?.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const navigate = (id: PageId) => {
    location.hash = `/${id}`;
    setPage(id);
    setMobileNav(false);
  };
  const openSave = () => {
    setVersionName(`${config.name} · v${versions.length + 1}`);
    setSaveOpen(true);
  };
  const title = navigation.find((n) => n.id === page)?.name ?? "系统设置";
  const renderPage = () => {
    if (!data) return null;
    if (page === "overview")
      return <Overview data={data} navigate={navigate} inspect={setArticle} />;
    if (page === "research")
      return (
        <Research
          data={data}
          inspect={setArticle}
          openPreview={() => setPreview(true)}
        />
      );
    if (page === "sources")
      return (
        <Sources
          key={sourceSearch}
          data={data}
          inspect={setArticle}
          initialSearch={sourceSearch}
        />
      );
    if (page === "papers") return <Papers data={data} inspect={setArticle} />;
    if (page === "reports") return <Reports data={data} />;
    if (page === "messages") return <Messages data={data} />;
    if (page === "models") return <Models data={data} />;
    if (page === "runs") return <Runs data={data} />;
    if (page === "versions") return <Versions />;
    return <Settings data={data} reload={() => void reload()} />;
  };
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        跳到主要内容
      </a>
      <aside className="sidebar">
        <a className="brand" href="#/overview">
          <span className="brand-mark">
            <Newspaper size={23} strokeWidth={1.8} />
          </span>
          <span>
            FeishuBrief<small>情报工作台</small>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">N</span>
          <div>
            <strong>个人研究空间</strong>
            <small>No1dry / FeishuBrief</small>
          </div>
          <Badge>V3</Badge>
        </div>
        <nav aria-label="主导航">
          {navigation.map((item, i) => (
            <div key={item.id}>
              {(i === 0 || navigation[i - 1].group !== item.group) && (
                <div className="nav-group-label">{item.group}</div>
              )}
              <a
                className={`nav-link ${page === item.id ? "active" : ""}`}
                href={`#/${item.id}`}
                aria-current={page === item.id ? "page" : undefined}
              >
                <item.icon size={18} strokeWidth={1.6} />
                <span>{item.name}</span>
                {item.id === "sources" && data && (
                  <small>{data.sources.length}</small>
                )}
                {item.id === "versions" && changes.length > 0 && (
                  <i className="nav-dirty" />
                )}
              </a>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className="status-dot" />
            <span>{remote.session ? "GitHub 已连接" : "等待连接"}</span>
            <small>{remote.session ? "远程配置" : "私有工作区"}</small>
          </div>
          <a
            className={`nav-link ${page === "settings" ? "active" : ""}`}
            href="#/settings"
          >
            <Settings2 size={18} strokeWidth={1.6} />
            <span>系统设置</span>
          </a>
          <div className="user-row">
            <span className="user-avatar">N</span>
            <div>
              <strong>No1dry</strong>
              <small>工作区所有者</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="mobile-nav-toggle">
              <IconButton
                icon={Menu}
                label="打开导航"
                onClick={() => setMobileNav(true)}
              />
            </span>
            <span className="breadcrumb-root">工作台</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="global-search"
              aria-label="搜索工作台"
              disabled={!data}
              onClick={() => setPalette(true)}
            >
              <Search size={16} />
              <span>搜索工作台</span>
            </button>
            <span className="top-divider" />
            <IconButton
              icon={Undo2}
              label="撤销更改"
              disabled={!workspace.canUndo || workspace.conflict}
              onClick={workspace.undo}
            />
            <IconButton
              icon={Redo2}
              label="重做更改"
              disabled={!workspace.canRedo || workspace.conflict}
              onClick={workspace.redo}
            />
            <span className="local-save-control">
              <Button
                icon={Save}
                onClick={openSave}
                disabled={workspace.conflict || !remote.session}
              >
                保存版本
              </Button>
            </span>
            <Button
              icon={CloudUpload}
              variant="primary"
              onClick={() => setPublishOpen(true)}
              disabled={
                !remote.session?.canWrite || remote.busy || workspace.conflict
              }
            >
              提交配置
            </Button>
          </div>
        </header>
        <main
          className="main-content"
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
        >
          {workspace.conflict && (
            <div role="alert" className="error-banner">
              <CircleAlert size={18} />
              <span>另一个窗口已更新配置。请重新载入后继续编辑。</span>
              <Button onClick={() => location.reload()}>重新载入</Button>
            </div>
          )}
          {workspace.error && (
            <div role="alert" className="error-banner">
              <CircleAlert size={18} />
              <span>{workspace.error}</span>
              <IconButton
                icon={X}
                label="关闭错误提示"
                onClick={() => workspace.setError("")}
              />
            </div>
          )}
          {!remote.session ? (
            <ConnectionGate />
          ) : loading ? (
            <Loading />
          ) : error ? (
            <Empty icon={CircleAlert} title={error}>
              <Button onClick={() => void reload()}>重新加载</Button>
            </Empty>
          ) : (
            <Suspense fallback={<Loading />}>{renderPage()}</Suspense>
          )}
        </main>
        <div className="draft-statusbar">
          <span>
            <GitBranch size={13} />
            {changes.length ? `${changes.length} 处草稿更改` : "本地配置"}
            <span className="statusbar-divider">·</span>
            <span className="draft-message" aria-live="polite">
              {remote.lastCommit
                ? "已提交 GitHub，下次运行生效"
                : remote.session
                  ? "已读取远程配置，编辑自动保存为草稿"
                  : "尚未连接 GitHub"}
            </span>
          </span>
          <button
            onClick={() => downloadJson(config, "editorial-profile.json")}
          >
            <Download size={13} />
            导出配置
          </button>
        </div>
      </div>
      {publishOpen && <PublishDialog onClose={() => setPublishOpen(false)} />}
      {mobileNav && (
        <Modal title="FeishuBrief" onClose={() => setMobileNav(false)}>
          <nav className="mobile-menu" aria-label="移动导航">
            {[
              ...navigation,
              {
                id: "settings" as PageId,
                name: "系统设置",
                icon: Settings2,
                group: "",
              },
            ].map((item) => (
              <button key={item.id} onClick={() => navigate(item.id)}>
                <item.icon size={18} />
                {item.name}
                {page === item.id && <Check size={16} />}
              </button>
            ))}
          </nav>
        </Modal>
      )}
      {palette && data && (
        <Palette
          data={data}
          onClose={() => setPalette(false)}
          navigate={navigate}
          inspect={setArticle}
          searchSource={(q) => {
            setSourceSearch(q);
            navigate("sources");
          }}
        />
      )}
      {preview && data && (
        <Preview data={data} onClose={() => setPreview(false)} />
      )}
      {article && (
        <Modal title="内容详情" onClose={() => setArticle(null)} wide>
          <div className="article-detail">
            <div className="article-meta">
              <Badge>
                {article.source ||
                  data?.sources.find((s) => s.id === article.sourceId)?.name ||
                  article.sourceId}
              </Badge>
              {article.publishedAt && (
                <span>{article.publishedAt.slice(0, 10)}</span>
              )}
            </div>
            <h2>{article.title}</h2>
            {article.summary && (
              <section>
                <h3>中文介绍</h3>
                <p>{article.summary}</p>
              </section>
            )}
            {article.excerpt && (
              <section>
                <h3>原始摘要</h3>
                <p>{article.excerpt}</p>
              </section>
            )}
            {!article.summary && !article.excerpt && (
              <Empty title="归档未保存摘要" />
            )}
            <ExternalLink href={article.url}>阅读原文</ExternalLink>
          </div>
        </Modal>
      )}
      {saveOpen && (
        <Modal title="保存本地配置版本" onClose={() => setSaveOpen(false)} wide>
          <label className="field">
            版本名称
            <input
              value={versionName}
              maxLength={60}
              onChange={(e) => setVersionName(e.target.value)}
            />
          </label>
          <DiffTable before={baseline} after={config} />
          <div className="save-boundary">
            <GitBranch size={16} />
            <span>保存在当前浏览器，生产日报配置暂未连接。</span>
          </div>
          <div className="modal-actions">
            <Button onClick={() => setSaveOpen(false)}>取消</Button>
            <Button
              variant="primary"
              icon={Save}
              disabled={!versionName.trim() || workspace.conflict}
              onClick={() => {
                if (saveVersion(versionName)) setSaveOpen(false);
              }}
            >
              保存版本
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
