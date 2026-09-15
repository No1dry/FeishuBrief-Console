import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  CircleHelp,
  FlaskConical,
  SlidersHorizontal,
} from "lucide-react";
import {
  Badge,
  Empty,
  NumberInput,
  SearchInput,
  SectionHead,
  Select,
  Toggle,
} from "../components";
import { previewPapers } from "../policy";
import type { Article, Snapshot } from "../types";
import { useWorkspace } from "../workspace";

export default function Papers({
  data,
  inspect,
}: {
  data: Snapshot;
  inspect: (article: Article) => void;
}) {
  const { config, update } = useWorkspace();
  const [date, setDate] = useState(data.reports[0]?.date ?? ""),
    [tab, setTab] = useState("selected"),
    [query, setQuery] = useState("");
  const report = data.reports.find((r) => r.date === date);
  const papers = useMemo(
    () => previewPapers(report, data.reports, data.sources, config),
    [report, data, config],
  );
  const accepted = papers.filter((p) => p.accepted),
    repeats = papers.filter(
      (p) => p.reason.includes("历史") || p.reason.includes("重复"),
    );
  const filtered = papers.filter(
    (p) =>
      (tab === "all" || (tab === "selected" ? p.accepted : !p.accepted)) &&
      `${p.article.title} ${p.article.summary}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>论文策略</h1>
          <p>相关、扎实、值得读。数量是上限，质量是底线。</p>
        </div>
        <Select
          label="论文日期"
          value={date}
          onChange={setDate}
          options={data.reports.map((r) => ({ value: r.date, label: r.date }))}
        />
      </header>
      <div className="paper-stats">
        <div>
          <span>论文候选</span>
          <strong>{papers.length}</strong>
        </div>
        <div>
          <span>回放入选</span>
          <strong className="positive">
            {accepted.length}
            <small> / {config.papers.dailyMaximum}</small>
          </strong>
        </div>
        <div>
          <span>重复候选</span>
          <strong>{repeats.length}</strong>
        </div>
        <div>
          <span>未通过</span>
          <strong>{papers.length - accepted.length}</strong>
        </div>
      </div>
      <div className="paper-layout">
        <div>
          <div className="table-toolbar">
            <div className="filter-tabs">
              <button
                className={tab === "selected" ? "active" : ""}
                onClick={() => setTab("selected")}
              >
                入选 {accepted.length}
              </button>
              <button
                className={tab === "rejected" ? "active" : ""}
                onClick={() => setTab("rejected")}
              >
                未入选 {papers.length - accepted.length}
              </button>
              <button
                className={tab === "all" ? "active" : ""}
                onClick={() => setTab("all")}
              >
                全部
              </button>
            </div>
            <SearchInput
              label="搜索论文"
              placeholder="搜索论文…"
              value={query}
              onChange={setQuery}
            />
          </div>
          <div className="paper-list">
            {filtered.slice(0, 40).map((p, index) => (
              <article className="paper-row" key={`${p.article.url}-${index}`}>
                <div className={`score-square ${p.accepted ? "pass" : ""}`}>
                  <strong>{p.score}</strong>
                  <span>回放分</span>
                </div>
                <div className="paper-copy">
                  <div className="article-meta">
                    <span>
                      {p.article.source ||
                        data.sources.find((s) => s.id === p.article.sourceId)
                          ?.name ||
                        p.article.sourceId}
                    </span>
                    <Badge tone={p.accepted ? "green" : "neutral"}>
                      {p.reason}
                    </Badge>
                  </div>
                  <button
                    className="article-title"
                    onClick={() => inspect(p.article)}
                  >
                    {p.article.title}
                  </button>
                  <p>
                    {p.article.summary || p.article.excerpt || "暂无原始摘要"}
                  </p>
                  <div className="paper-tags">
                    {p.topics.map((t) => (
                      <Badge key={t.id} tone="blue">
                        {t.name}
                      </Badge>
                    ))}
                    {p.evidence.map((e) => (
                      <span key={e}>
                        <Check size={12} />
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  className="row-arrow"
                  aria-label={`查看 ${p.article.title}`}
                  onClick={() => inspect(p.article)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <Empty
              icon={BookOpen}
              title={
                tab === "selected"
                  ? "当前规则下暂无入选论文"
                  : "没有符合条件的论文"
              }
            >
              <p>可以查看全部候选和淘汰原因。</p>
            </Empty>
          )}
        </div>
        <aside className="policy-aside">
          <SectionHead
            title="筛选标准"
            action={<SlidersHorizontal size={17} />}
          />
          <div className="threshold">
            <div>
              <span>最低回放分</span>
              <strong>{config.papers.minimumScore}</strong>
            </div>
            <input
              aria-label="最低回放分"
              type="range"
              min="20"
              max="100"
              step="1"
              value={config.papers.minimumScore}
              onChange={(e) =>
                update((d) => {
                  d.papers.minimumScore = Number(e.target.value);
                })
              }
            />
            <div className="range-labels">
              <span>20</span>
              <span>100</span>
            </div>
          </div>
          <NumberInput
            label="每日最多"
            value={config.papers.dailyMaximum}
            min={1}
            max={40}
            unit="篇"
            onChange={(n) =>
              update((d) => {
                d.papers.dailyMaximum = n;
              })
            }
          />
          <NumberInput
            label="arXiv 上限"
            value={config.papers.arxivMaximum}
            min={1}
            max={20}
            unit="篇"
            onChange={(n) =>
              update((d) => {
                d.papers.arxivMaximum = n;
              })
            }
          />
          <NumberInput
            label="历史排重"
            value={config.papers.historyDays}
            min={1}
            max={90}
            unit="天"
            onChange={(n) =>
              update((d) => {
                d.papers.historyDays = n;
              })
            }
          />
          <div className="setting-row">
            <span>必须有原始摘要</span>
            <Toggle
              label="必须有原始摘要"
              checked={config.papers.requireAbstract}
              onChange={(v) =>
                update((d) => {
                  d.papers.requireAbstract = v;
                })
              }
            />
          </div>
          <div className="aside-note">
            <p>
              <FlaskConical size={15} />
              关键词回放
            </p>
            <span>
              分数来自主题权重与摘要中的实验、代码和数据线索，不代表学术质量结论。DeepSeek
              语义评审尚未接入。
            </span>
          </div>
          <details className="explanation">
            <summary>评分与排重口径</summary>
            <p>
              每个命中主题计 30 × 权重；实验、代码、完整摘要各加 8 分，上限
              100。跨平台合并 arXiv
              ID；历史排重按可用归档候选执行，不等于正式日报已展示历史。
            </p>
            <p>已读取 {data.reports.length} 期历史，缺失日期不补造数据。</p>
          </details>
        </aside>
      </div>
    </>
  );
}
