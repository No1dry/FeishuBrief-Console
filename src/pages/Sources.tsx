import { useMemo, useState } from "react";
import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink as LinkIcon,
  Rss,
  Search,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  ExternalLink,
  IconButton,
  Modal,
  NumberInput,
  SearchInput,
  SectionHead,
  Select,
  Toggle,
} from "../components";
import { sourceEnabled, sourcePriority } from "../policy";
import {
  categoryLabels,
  type Article,
  type Snapshot,
  type Source,
} from "../types";
import { useWorkspace } from "../workspace";

const platforms: Record<string, string> = {
  rss: "RSS",
  api: "API",
  scrape: "网页",
  "web-list": "博客",
  "github-entity": "GitHub",
  "x-user": "X",
  rsshub: "RSSHub",
  "bilibili-user": "B站",
  "youtube-channel": "YouTube",
  "academic-author": "学术作者",
  "policy-list": "政策",
};
export default function Sources({
  data,
  inspect,
  initialSearch = "",
}: {
  data: Snapshot;
  inspect: (a: Article) => void;
  initialSearch?: string;
}) {
  const { config, update } = useWorkspace();
  const [query, setQuery] = useState(initialSearch),
    [category, setCategory] = useState("all"),
    [status, setStatus] = useState("all"),
    [platform, setPlatform] = useState("all"),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<Source | null>(null),
    [order, setOrder] = useState("default");
  const articles = data.reports[0]?.articles ?? [];
  const counts = useMemo(
    () =>
      Object.fromEntries(
        data.sources.map((s) => [
          s.id,
          articles.filter((a) => a.sourceId === s.id).length,
        ]),
      ),
    [data.sources, articles],
  );
  const filtered = data.sources
    .filter(
      (s) =>
        `${s.name} ${s.id} ${s.entity ?? ""} ${(s.topics ?? []).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (category === "all" || s.category === category) &&
        (platform === "all" || s.type === platform) &&
        (status === "all" ||
          (status === "enabled" && sourceEnabled(s, config)) ||
          (status === "disabled" && !sourceEnabled(s, config)) ||
          (status === "empty" && !counts[s.id])),
    )
    .sort((a, b) =>
      order === "count"
        ? counts[b.id] - counts[a.id]
        : a.name.localeCompare(b.name, "zh-CN"),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 15)),
    safePage = Math.min(page, pageCount),
    rows = filtered.slice((safePage - 1) * 15, safePage * 15);
  const changeSearch = (value: string) => {
    setQuery(value);
    setPage(1);
    setSelected([]);
  };
  const enabled = data.sources.filter((s) => sourceEnabled(s, config)).length;
  const batch = (value: boolean) => {
    update((draft) =>
      selected.forEach((id) => {
        draft.sourceOverrides[id] = {
          ...draft.sourceOverrides[id],
          enabled: value,
        };
      }),
    );
    setSelected([]);
  };
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>信源管理</h1>
          <p>机构、个人、媒体与社区，汇入同一份研究视野。</p>
        </div>
        <Badge tone="blue">{data.sources.length} 个登记信源</Badge>
      </header>
      <div className="source-summary">
        <button
          className={status === "all" ? "active" : ""}
          onClick={() => setStatus("all")}
        >
          全部信源<strong>{data.sources.length}</strong>
        </button>
        <button
          className={status === "enabled" ? "active" : ""}
          onClick={() => setStatus("enabled")}
        >
          已启用<strong>{enabled}</strong>
        </button>
        <button
          className={status === "disabled" ? "active" : ""}
          onClick={() => setStatus("disabled")}
        >
          未启用<strong>{data.sources.length - enabled}</strong>
        </button>
        <span className="muted small">
          中文模式 · {data.reports[0]?.date} 抓取快照
        </span>
      </div>
      <div className="table-toolbar">
        <SearchInput value={query} onChange={changeSearch} />
        <div className="toolbar-filters">
          <Select
            label="领域筛选"
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部领域" },
              ...Object.entries(categoryLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <Select
            label="平台筛选"
            value={platform}
            onChange={(v) => {
              setPlatform(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部平台" },
              ...Object.entries(platforms)
                .filter(([k]) => data.sources.some((s) => s.type === k))
                .map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            label="信源排序"
            value={order}
            onChange={setOrder}
            options={[
              { value: "default", label: "按名称" },
              { value: "count", label: "按抓取量" },
            ]}
          />
        </div>
      </div>
      {selected.length > 0 && (
        <div className="batch-bar">
          <span>已选择 {selected.length} 个信源</span>
          <Button onClick={() => batch(true)}>批量启用</Button>
          <Button onClick={() => batch(false)}>批量停用</Button>
          <IconButton
            icon={X}
            label="清空选择"
            onClick={() => setSelected([])}
          />
        </div>
      )}
      <div className="source-table">
        <div className="source-table-head">
          <label className="checkbox-hit">
            <input
              aria-label="选择本页信源"
              type="checkbox"
              checked={
                rows.length > 0 && rows.every((s) => selected.includes(s.id))
              }
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...new Set([...selected, ...rows.map((s) => s.id)])]
                    : selected.filter((id) => !rows.some((s) => s.id === id)),
                )
              }
            />
          </label>
          <span>信源</span>
          <span>平台 / 领域</span>
          <span>优先级</span>
          <span>本期内容</span>
          <span>每日上限</span>
          <span>启用</span>
        </div>
        {rows.map((source) => (
          <div className="source-row" key={source.id}>
            <label className="checkbox-hit">
              <input
                aria-label={`选择 ${source.name}`}
                type="checkbox"
                checked={selected.includes(source.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, source.id]
                      : selected.filter((id) => id !== source.id),
                  )
                }
              />
            </label>
            <div className="source-name-cell">
              <span className={`source-logo source-logo-${source.category}`}>
                {source.type === "x-user" ? "𝕏" : source.name.slice(0, 1)}
              </span>
              <div>
                <button
                  className="source-name"
                  onClick={() => setDetail(source)}
                >
                  {source.name}
                </button>
                <small>{source.entity || source.id}</small>
              </div>
            </div>
            <div className="source-platform">
              <span>{platforms[source.type] ?? source.type}</span>
              <small>{categoryLabels[source.category]}</small>
            </div>
            <div className="source-priority">
              <Select
                compact
                label={`${source.name} 优先级`}
                value={sourcePriority(source, config)}
                onChange={(v) =>
                  update((draft) => {
                    draft.sourceOverrides[source.id] = {
                      ...draft.sourceOverrides[source.id],
                      priority: v as "P0" | "P1" | "P2",
                    };
                  })
                }
                options={["P0", "P1", "P2"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </div>
            <div className="source-count">
              {counts[source.id] ? (
                <span className="observed">
                  <i />
                  {counts[source.id]} 条
                </span>
              ) : (
                <span className="muted">本期未见</span>
              )}
            </div>
            <span className="source-limit">
              {config.sourceOverrides[source.id]?.dailyLimit ??
                source.dailyLimit ??
                source.limit ??
                "默认"}
            </span>
            <Toggle
              label={`启用 ${source.name}`}
              checked={sourceEnabled(source, config)}
              disabled={!(source.locales ?? ["zh", "en"]).includes("zh")}
              onChange={(enabled) =>
                update((draft) => {
                  draft.sourceOverrides[source.id] = {
                    ...draft.sourceOverrides[source.id],
                    enabled,
                  };
                })
              }
            />
          </div>
        ))}
      </div>
      {!rows.length && (
        <Empty title="没有符合筛选条件的信源">
          <Button
            onClick={() => {
              setQuery("");
              setCategory("all");
              setPlatform("all");
              setStatus("all");
            }}
          >
            清除筛选
          </Button>
        </Empty>
      )}
      <div className="pagination">
        <span>
          共 {filtered.length} 个 · {rows.length ? (safePage - 1) * 15 + 1 : 0}–
          {Math.min(safePage * 15, filtered.length)}
        </span>
        <div>
          <IconButton
            icon={ChevronLeft}
            label="上一页"
            disabled={safePage === 1}
            onClick={() => setPage(safePage - 1)}
          />
          <span>
            {safePage} / {pageCount}
          </span>
          <IconButton
            icon={ChevronRight}
            label="下一页"
            disabled={safePage === pageCount}
            onClick={() => setPage(safePage + 1)}
          />
        </div>
      </div>
      <p className="data-note">
        “本期未见”表示归档里没有该信源内容；缺少抓取日志时，不推断为抓取失败。原始
        T 级别在此映射为 P0 / P1 / P2 草稿优先级。
      </p>
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)} wide>
          <div className="source-detail-top">
            <Badge>{platforms[detail.type]}</Badge>
            <Badge>{categoryLabels[detail.category]}</Badge>
            <ExternalLink href={detail.url}>原始信源</ExternalLink>
          </div>
          <NumberInput
            label="每日上限"
            value={
              config.sourceOverrides[detail.id]?.dailyLimit ??
              detail.dailyLimit ??
              detail.limit ??
              30
            }
            min={1}
            max={100}
            onChange={(dailyLimit) =>
              update((draft) => {
                draft.sourceOverrides[detail.id] = {
                  ...draft.sourceOverrides[detail.id],
                  dailyLimit,
                };
              })
            }
          />
          <SectionHead
            title="本期抓取内容"
            subtitle={`${counts[detail.id]} 条 · ${data.reports[0]?.date}`}
          />
          {articles
            .filter((a) => a.sourceId === detail.id)
            .slice(0, 12)
            .map((a, i) => (
              <div className="compact-article" key={`${a.url}-${i}`}>
                <div>
                  <button
                    className="article-title"
                    onClick={() => {
                      setDetail(null);
                      inspect(a);
                    }}
                  >
                    {a.title}
                  </button>
                  <span>
                    {a.summary?.slice(0, 100) || a.excerpt?.slice(0, 100)}
                  </span>
                </div>
              </div>
            ))}
          {!counts[detail.id] && (
            <Empty icon={Rss} title="归档中暂无该信源内容" />
          )}
        </Modal>
      )}
    </>
  );
}
