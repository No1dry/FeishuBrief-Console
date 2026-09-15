import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleAlert,
  FileText,
  LayoutTemplate,
  LockKeyhole,
  Monitor,
  Smartphone,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  ExternalLink,
  IconButton,
  NumberInput,
  SectionHead,
  Select,
  Toggle,
} from "../components";
import { reportQuality } from "../policy";
import {
  categoryLabels,
  type Category,
  type ReportRecord,
  type Snapshot,
} from "../types";
import { useWorkspace } from "../workspace";

export function ReportContent({
  record,
  channel,
  compact = false,
}: {
  record: ReportRecord;
  channel?: "feishu" | "pushplus";
  compact?: boolean;
}) {
  const { config } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const report = record.report;
  return (
    <div
      className={`report-paper ${channel ? `channel-${channel}` : ""} ${compact ? "compact-paper" : ""}`}
    >
      <div className="report-masthead">
        <FileText size={18} />
        <span>每日简报</span>
        <time>{record.date}</time>
      </div>
      <div className="report-body">
        <h2>{report.hero_headline}</h2>
        {(!channel || config.notifications.overview) && (
          <p className="report-overview">{report.daily_overview}</p>
        )}
        {(["tech", "finance", "politics"] as Category[]).map((cat) => {
          const items = report[`${cat}_briefs`] ?? [];
          const limit = channel
            ? config.notifications[channel][cat]
            : expanded
              ? items.length
              : 3;
          return (
            <section key={cat} className="report-category">
              <h3>
                {categoryLabels[cat]}
                <small>{Math.min(items.length, limit)} 条</small>
              </h3>
              {items.slice(0, limit).map((item, i) => (
                <div className="report-item" key={`${item.url}-${i}`}>
                  <ExternalLink href={item.url}>{item.title}</ExternalLink>
                  <p>{item.summary}</p>
                  <small>{item.source}</small>
                </div>
              ))}
              {!items.length && (
                <p className="report-missing">该期归档没有此栏目摘要</p>
              )}
            </section>
          );
        })}
        {report.editor_note && (
          <div className="report-note">{report.editor_note}</div>
        )}
        {channel === "feishu" &&
          config.notifications.market &&
          report.trading?.market_overview && (
            <section className="report-category">
              <h3>市场观察</h3>
              <p className="report-overview">
                {report.trading.market_overview}
              </p>
            </section>
          )}
        <div className="report-keywords">
          {report.keywords?.map((word) => (
            <span key={word}>#{word}</span>
          ))}
        </div>
        {!channel && (
          <Button onClick={() => setExpanded(!expanded)}>
            {expanded ? "收起摘要" : "展开全部摘要"}
          </Button>
        )}
        <ExternalLink href={record.url}>查看完整网页版</ExternalLink>
      </div>
    </div>
  );
}

export default function Reports({ data }: { data: Snapshot }) {
  const { config, update } = useWorkspace();
  const [tab, setTab] = useState("daily"),
    [date, setDate] = useState(data.reports[0]?.date ?? "");
  const record = data.reports.find((r) => r.date === date);
  if (!record) return <Empty title="没有可预览的日报" />;
  const base = Date.parse(record.date),
    weekDates = Array.from({ length: 7 }, (_, i) =>
      new Date(base - (6 - i) * 86400000).toISOString().slice(0, 10),
    );
  const available = weekDates.filter((day) =>
    data.reports.some((r) => r.date === day),
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>日报与周报</h1>
          <p>查看已生成内容，安排每天和每周的阅读节奏。</p>
        </div>
        <Select
          label="日报日期"
          value={date}
          onChange={setDate}
          options={data.reports.map((r) => ({ value: r.date, label: r.date }))}
        />
      </header>
      <div className="page-tabs">
        <button
          className={tab === "daily" ? "active" : ""}
          onClick={() => setTab("daily")}
        >
          <FileText size={16} />
          日报
        </button>
        <button
          className={tab === "weekly" ? "active" : ""}
          onClick={() => setTab("weekly")}
        >
          <CalendarDays size={16} />
          周报
        </button>
        <button
          className={tab === "web" ? "active" : ""}
          onClick={() => setTab("web")}
        >
          <LayoutTemplate size={16} />
          网页展示
        </button>
      </div>
      {tab === "daily" && (
        <div className="report-layout">
          <ReportContent record={record} />
          <aside className="policy-aside">
            <SectionHead title="主编候选" />
            <NumberInput
              label="技术"
              value={config.daily.editorCandidates.tech}
              min={10}
              max={60}
              onChange={(n) =>
                update((d) => {
                  d.daily.editorCandidates.tech = n;
                })
              }
            />
            <NumberInput
              label="财经"
              value={config.daily.editorCandidates.finance}
              min={5}
              max={40}
              onChange={(n) =>
                update((d) => {
                  d.daily.editorCandidates.finance = n;
                })
              }
            />
            <NumberInput
              label="时政"
              value={config.daily.editorCandidates.politics}
              min={5}
              max={30}
              onChange={(n) =>
                update((d) => {
                  d.daily.editorCandidates.politics = n;
                })
              }
            />
            <div className="aside-note">
              <p>归档日报</p>
              <span>
                当前显示已生成内容。策略调整保存在本地草稿，预览不会重新调用模型。
              </span>
            </div>
            <ExternalLink href={record.url}>在新窗口打开日报</ExternalLink>
          </aside>
        </div>
      )}
      {tab === "weekly" && (
        <div className="weekly-content">
          <div className="weekly-heading">
            <CalendarDays size={32} strokeWidth={1.2} />
            <div>
              <h2>一周重点，重新串起来。</h2>
              <p>跨日事件演进 · 研究进展 · 下周观察</p>
            </div>
            <Badge tone="amber">待接入生产流程</Badge>
          </div>
          <SectionHead
            title="七天内容窗口"
            subtitle={`${weekDates[0]} 至 ${weekDates[6]}`}
          />
          <div className="week-grid">
            {weekDates.map((day) => (
              <div
                className={available.includes(day) ? "available" : ""}
                key={day}
              >
                <span>{day.slice(5).replace("-", "/")}</span>
                {available.includes(day) ? (
                  <Check size={20} />
                ) : (
                  <span className="dash">—</span>
                )}
                <small>{available.includes(day) ? "有归档" : "缺少归档"}</small>
              </div>
            ))}
          </div>
          <div className="quality-notice">
            <CircleAlert size={19} />
            <div>
              <strong>{available.length} / 7 天数据可用</strong>
              <p>
                {available.length === 7
                  ? "窗口完整，后续可接入周报生成。"
                  : "七天完整性未满足，周报生成保持阻断。"}
              </p>
            </div>
          </div>
          <section className="settings-section">
            <SectionHead title="周报策略" />
            <fieldset disabled className="future-policy">
              <div className="setting-row">
                <span>启用周报策略</span>
                <Toggle
                  label="启用周报策略"
                  checked={config.weekly.enabled}
                  onChange={(v) =>
                    update((d) => {
                      d.weekly.enabled = v;
                    })
                  }
                />
              </div>
              <div className="setting-row">
                <span>计划星期</span>
                <Select
                  label="周报星期"
                  value={String(config.weekly.weekday)}
                  onChange={(v) =>
                    update((d) => {
                      d.weekly.weekday = Number(v);
                    })
                  }
                  options={[
                    "周日",
                    "周一",
                    "周二",
                    "周三",
                    "周四",
                    "周五",
                    "周六",
                  ].map((label, i) => ({ value: String(i), label }))}
                />
              </div>
              <NumberInput
                label="审稿最低分"
                min={80}
                max={100}
                value={config.weekly.reviewMinimumScore}
                onChange={(v) =>
                  update((d) => {
                    d.weekly.reviewMinimumScore = v;
                  })
                }
              />
              <div className="setting-row">
                <span>完整性要求</span>
                <Badge>
                  <LockKeyhole size={12} />
                  完整 7 天
                </Badge>
              </div>
            </fieldset>
          </section>
        </div>
      )}
      {tab === "web" && (
        <section className="settings-section">
          <SectionHead
            title="完整网页"
            subtitle="网页展示数量与消息摘要数量分别保存"
          />
          <NumberInput
            label="技术动态展示上限"
            min={20}
            max={200}
            value={config.daily.webMaximum}
            onChange={(v) =>
              update((d) => {
                d.daily.webMaximum = v;
              })
            }
          />
          <NumberInput
            label="其中论文上限"
            min={1}
            max={40}
            value={config.papers.dailyMaximum}
            onChange={(v) =>
              update((d) => {
                d.papers.dailyMaximum = v;
              })
            }
          />
          <div className="module-order">
            {["总览", "技术动态", "论文与研究", "财经", "时政", "市场观察"].map(
              (s, i) => (
                <div key={s}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <strong>{s}</strong>
                  <Badge>现有栏目</Badge>
                </div>
              ),
            )}
          </div>
          <ExternalLink href={record.url}>查看当前网页</ExternalLink>
        </section>
      )}
    </>
  );
}

export function Messages({ data }: { data: Snapshot }) {
  const { config, update } = useWorkspace();
  const [channel, setChannel] = useState<"feishu" | "pushplus">("feishu"),
    [width, setWidth] = useState("desktop"),
    [date, setDate] = useState(data.reports[0]?.date ?? "");
  const record = data.reports.find((r) => r.date === date);
  if (!record) return <Empty title="暂无归档消息" />;
  const q = reportQuality(record);
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>消息摘要</h1>
          <p>飞书与微信里，每条重点都值得占据一屏。</p>
        </div>
        <Select
          label="消息日期"
          value={date}
          onChange={setDate}
          options={data.reports.map((r) => ({ value: r.date, label: r.date }))}
        />
      </header>
      <div className="preview-toolbar">
        <div className="page-tabs">
          <button
            className={channel === "feishu" ? "active" : ""}
            onClick={() => setChannel("feishu")}
          >
            飞书
          </button>
          <button
            className={channel === "pushplus" ? "active" : ""}
            onClick={() => setChannel("pushplus")}
          >
            微信 · PushPlus
          </button>
        </div>
        <div className="segmented icon-segments">
          <button
            aria-label="桌面宽度"
            aria-pressed={width === "desktop"}
            onClick={() => setWidth("desktop")}
          >
            <Monitor size={17} />
          </button>
          <button
            aria-label="手机宽度"
            aria-pressed={width === "mobile"}
            onClick={() => setWidth("mobile")}
          >
            <Smartphone size={17} />
          </button>
        </div>
      </div>
      {!q.ok && (
        <div className="quality-notice">
          <CircleAlert size={20} />
          <div>
            <strong>归档摘要未通过完整性检查</strong>
            <p>{q.issues.join("；")}。该期在新规则下将阻止发送。</p>
          </div>
        </div>
      )}
      <div className="report-layout">
        <div className={`message-preview ${width}`}>
          <ReportContent
            record={record}
            channel={channel}
            compact={width === "mobile"}
          />
        </div>
        <aside className="policy-aside">
          <SectionHead
            title="消息篇幅"
            action={<Badge>{channel === "feishu" ? "飞书" : "PushPlus"}</Badge>}
          />
          {(["tech", "finance", "politics"] as Category[]).map((cat, i) => (
            <NumberInput
              key={cat}
              label={`${categoryLabels[cat]}条数`}
              min={[3, 3, 2][i]}
              max={[12, 12, 8][i]}
              value={config.notifications[channel][cat]}
              onChange={(n) =>
                update((d) => {
                  d.notifications[channel][cat] = n;
                })
              }
            />
          ))}
          <div className="setting-row">
            <span>显示总览</span>
            <Toggle
              label="显示总览"
              checked={config.notifications.overview}
              onChange={(v) =>
                update((d) => {
                  d.notifications.overview = v;
                })
              }
            />
          </div>
          <dl className="impact-facts">
            <div>
              <dt>草稿目标</dt>
              <dd>
                {Object.values(config.notifications[channel]).reduce(
                  (a, b) => a + b,
                  0,
                )}{" "}
                条
              </dd>
            </div>
            <div>
              <dt>归档实际</dt>
              <dd>{q.counts.reduce((a, b) => a + b, 0)} 条</dd>
            </div>
            <div>
              <dt>栏目最低条数</dt>
              <dd>3 / 3 / 2</dd>
            </div>
          </dl>
          <div className="aside-note">
            <p>
              <LockKeyhole size={14} />
              预览模式
            </p>
            <span>
              使用历史内容近似预览消息样式。真实客户端排版可能不同；实际推送需在运行中心单独确认。
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}
