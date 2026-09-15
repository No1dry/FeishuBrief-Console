import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  FileText,
  SlidersHorizontal,
  Waypoints,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Button, ExternalLink, SectionHead } from "../components";
import { isPaper, matchTopics, reportQuality, sourceEnabled } from "../policy";
import type { Article, PageId, Snapshot } from "../types";
import { useWorkspace } from "../workspace";

export default function Overview({
  data,
  navigate,
  inspect,
}: {
  data: Snapshot;
  navigate: (page: PageId) => void;
  inspect: (a: Article) => void;
}) {
  const { config } = useWorkspace();
  const latest = data.reports[0];
  if (!latest) return <p>暂无日报快照。</p>;
  const quality = reportQuality(latest);
  const enabled = data.sources.filter((s) => sourceEnabled(s, config)).length;
  const papers = latest.articles.filter((a) => isPaper(a, data.sources));
  const matched = latest.articles.filter((article) => {
    const source = data.sources.find((item) => item.id === article.sourceId);
    return (
      matchTopics(article, config).length &&
      (!source || sourceEnabled(source, config))
    );
  });
  const chart = [...data.reports].reverse().map((r) => ({
    date: r.date.slice(5).replace("-", "."),
    tech: r.articles.filter((a) => a.category === "tech").length,
    finance: r.articles.filter((a) => a.category === "finance").length,
    politics: r.articles.filter((a) => a.category === "politics").length,
  }));
  const picks = [
    ...matched,
    ...latest.articles.filter((a) => a.summary && !matched.includes(a)),
  ].slice(0, 4);
  return (
    <>
      <header className="page-heading">
        <div>
          <div className="title-row">
            <h1>情报总览</h1>
            <Badge tone="neutral">{latest.date}</Badge>
          </div>
          <p>研究的下一步，从今天值得关注的信息开始。</p>
        </div>
        <div className="page-actions">
          <Button icon={SlidersHorizontal} onClick={() => navigate("research")}>
            调整研究重点
          </Button>
          <Button
            icon={ArrowUpRight}
            variant="primary"
            onClick={() => navigate("reports")}
          >
            查看日报
          </Button>
        </div>
      </header>
      <div className="metric-strip">
        <div className="metric">
          <div className="metric-label">
            启用信源
            <Waypoints size={17} />
          </div>
          <div className="metric-value">
            {enabled}
            <span>/ {data.sources.length}</span>
          </div>
          <small>中文模式 · 当前草稿</small>
        </div>
        <div className="metric">
          <div className="metric-label">
            本期抓取
            <FileText size={17} />
          </div>
          <div className="metric-value">
            {latest.articles.length}
            <span>条</span>
          </div>
          <small>
            {new Set(latest.articles.map((a) => a.sourceId)).size} 个信源有内容
          </small>
        </div>
        <div className="metric">
          <div className="metric-label">
            研究方向命中
            <Waypoints size={17} />
          </div>
          <div className="metric-value">
            {matched.length}
            <span>条</span>
          </div>
          <small>
            {config.researchTopics.filter((t) => t.enabled).length} 个主题 ·
            关键词回放
          </small>
        </div>
        <div className="metric">
          <div className="metric-label">
            论文候选
            <BookOpen size={17} />
          </div>
          <div className="metric-value">
            {papers.length}
            <span>篇</span>
          </div>
          <small>进入质量与相关性筛选</small>
        </div>
      </div>
      <div className="overview-grid">
        <section className="volume-section">
          <SectionHead
            title="信息采集"
            subtitle="最近归档 · 各领域候选数量"
            action={
              <span className="muted small">
                {data.reports.length} 期历史数据
              </span>
            }
          />
          <div className="chart-legend">
            <span>
              <i className="legend-tech" />
              技术
            </span>
            <span>
              <i className="legend-finance" />
              财经
            </span>
            <span>
              <i className="legend-politics" />
              时政
            </span>
          </div>
          <div
            className="volume-chart"
            role="img"
            aria-label="历史日报各领域抓取数量柱状图"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chart}
                barSize={32}
                margin={{ top: 12, right: 0, left: -24, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--color-rule)"
                  strokeDasharray="3 5"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                />
                <Tooltip
                  itemStyle={{ color: "var(--color-ink-2)" }}
                  cursor={{ fill: "var(--color-hover)" }}
                  contentStyle={{
                    background: "var(--color-surface)",
                    borderColor: "var(--color-rule)",
                    borderRadius: "6px",
                    color: "var(--color-ink)",
                  }}
                />
                <Bar
                  dataKey="tech"
                  isAnimationActive={false}
                  name="技术"
                  stackId="a"
                  fill="var(--color-chart-tech)"
                />
                <Bar
                  dataKey="finance"
                  isAnimationActive={false}
                  name="财经"
                  stackId="a"
                  fill="var(--color-chart-finance)"
                />
                <Bar
                  dataKey="politics"
                  isAnimationActive={false}
                  name="时政"
                  stackId="a"
                  fill="var(--color-chart-politics)"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="focus-section">
          <SectionHead
            title="当前研究重点"
            action={
              <button
                className="text-button"
                onClick={() => navigate("research")}
              >
                编辑
                <ArrowUpRight size={14} />
              </button>
            }
          />
          <div className="profile-label">
            <span className="profile-symbol">
              <Waypoints size={20} />
            </span>
            <div>
              <strong>{config.name}</strong>
              <span>本地策略草稿</span>
            </div>
            <Badge tone="blue">
              {config.researchTopics.filter((t) => t.enabled).length} 个主题
            </Badge>
          </div>
          <div className="focus-rows">
            {config.researchTopics.map((t, i) => (
              <div key={t.id} className="focus-row">
                <span className={`topic-dot topic-color-${i % 4}`} />
                <span>{t.name}</span>
                <Badge tone={t.priority === "P0" ? "blue" : "neutral"}>
                  {t.priority}
                </Badge>
                <span className="focus-weight">
                  {t.enabled ? t.weight.toFixed(1) : "关闭"}
                </span>
              </div>
            ))}
          </div>
          <div className="focus-foot">
            <span>
              质量阈值 <strong>{config.papers.minimumScore}</strong>
            </span>
            <span>
              历史排重 <strong>{config.papers.historyDays} 天</strong>
            </span>
          </div>
        </section>
      </div>
      <section className="digest-section">
        <SectionHead
          title="本期值得查看"
          subtitle={`${latest.date} · 研究方向匹配及已有中文介绍`}
          action={
            <button className="text-button" onClick={() => navigate("papers")}>
              查看论文候选
              <ArrowRight size={15} />
            </button>
          }
        />
        <div className="article-rows">
          {picks.map((a, i) => (
            <div className="article-row" key={`${a.url}-${i}`}>
              <span className="article-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="article-copy">
                <button className="article-title" onClick={() => inspect(a)}>
                  {a.title}
                </button>
                <p>{a.summary || a.excerpt || "原文暂无摘要"}</p>
                <div className="article-meta">
                  <span>
                    {a.source ||
                      data.sources.find((s) => s.id === a.sourceId)?.name ||
                      a.sourceId}
                  </span>
                  {matchTopics(a, config)
                    .slice(0, 2)
                    .map((t) => (
                      <Badge key={t.id}>{t.name}</Badge>
                    ))}
                </div>
              </div>
              <button
                className="row-arrow"
                aria-label={`查看 ${a.title}`}
                onClick={() => inspect(a)}
              >
                <ArrowUpRight size={18} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <div className={`quality-notice ${quality.ok ? "good" : ""}`}>
        <span className="notice-icon">
          {quality.ok ? <Check size={20} /> : <CircleAlert size={20} />}
        </span>
        <div>
          <strong>
            {quality.ok ? "本期摘要结构通过检查" : "本期消息摘要需要检查"}
          </strong>
          <p>
            {quality.ok
              ? `科技 ${quality.counts[0]} 条 · 财经 ${quality.counts[1]} 条 · 时政 ${quality.counts[2]} 条`
              : quality.issues.slice(0, 3).join("；")}
          </p>
        </div>
        <button className="text-button" onClick={() => navigate("messages")}>
          查看消息
          <ArrowRight size={15} />
        </button>
      </div>
      <footer className="page-footer">
        <span>
          快照更新于{" "}
          {new Date(data.capturedAt).toLocaleString("zh-CN", { hour12: false })}
        </span>
        <ExternalLink href="https://github.com/No1dry/FeishuBrief">
          GitHub 仓库
        </ExternalLink>
      </footer>
    </>
  );
}
