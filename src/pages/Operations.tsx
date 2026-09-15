import { useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  History,
  Layers3,
  LockKeyhole,
  Rss,
  ShieldCheck,
  Upload,
  Workflow,
} from "lucide-react";
import {
  Badge,
  Button,
  CheckLine,
  Empty,
  ExternalLink,
  Modal,
  NumberInput,
  SectionHead,
} from "../components";
import {
  configSchema,
  diffConfig,
  reportQuality,
  type Config,
} from "../policy";
import type { Run, Snapshot } from "../types";
import { downloadJson, useWorkspace, type Version } from "../workspace";
import { useRemote } from "../remote";
import { RemoteStatus, RunDialog } from "../Connection";

const labels: Record<string, string> = {
  researchTopics: "研究主题",
  weight: "权重",
  keywords: "关键词",
  aliases: "同义词",
  excludeKeywords: "排除词",
  enabled: "启用",
  priority: "优先级",
  name: "策略名称",
  papers: "论文",
  minimumScore: "最低回放分",
  dailyMaximum: "每日上限",
  historyDays: "排重天数",
  arxivMaximum: "arXiv 上限",
  requireAbstract: "必须有摘要",
  sourceOverrides: "信源",
  dailyLimit: "每日上限",
  daily: "日报",
  editorCandidates: "主编候选",
  webMaximum: "网页上限",
  notifications: "消息摘要",
  feishu: "飞书",
  pushplus: "PushPlus",
  overview: "总览",
  market: "市场观察",
  tech: "技术",
  finance: "财经",
  politics: "时政",
  weekly: "周报",
  weekday: "星期",
  reviewMinimumScore: "审稿最低分",
  models: "模型",
  workerConcurrency: "并发",
  editorTimeout: "主编超时",
  reviewerThreshold: "审稿阈值",
};
export function DiffTable({
  before,
  after,
}: {
  before: Config;
  after: Config;
}) {
  const changes = diffConfig(before, after);
  return changes.length ? (
    <div className="diff-table">
      {changes.map((change) => (
        <div className="diff-row" key={change.path}>
          <strong>
            {change.path
              .split(".")
              .map((s) => labels[s] ?? s)
              .join(" / ")}
          </strong>
          <div>
            <span className="diff-before">{change.before}</span>
            <ArrowRight size={14} />
            <span className="diff-after">{change.after}</span>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty icon={CheckCheck} title="配置与上次保存的版本一致" />
  );
}

export function Models({ data }: { data: Snapshot }) {
  const { config, update } = useWorkspace();
  const [imageOpen, setImageOpen] = useState(false);
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>模型与质量</h1>
          <p>让处理、编写与审校各司其职。</p>
        </div>
        <Badge tone="amber">多模型协作待接入</Badge>
      </header>
      <section className="agent-section">
        <SectionHead
          title="模型角色"
          subtitle="V3 规划角色 · Kimi 为现有流程的单模型"
        />
        <div className="agent-row">
          <div className="agent-mark">
            <Layers3 size={23} />
          </div>
          <div>
            <h3>内容分析员</h3>
            <p>主题识别 · 中文摘要 · 论文语义初审</p>
          </div>
          <strong>DeepSeek Worker</strong>
          <Badge>待接入</Badge>
        </div>
        <div className="agent-row">
          <div className="agent-mark kimi">K</div>
          <div>
            <h3>日报主编</h3>
            <p>选题排序 · 总览编写 · 日报与周报成稿</p>
          </div>
          <strong>Kimi K2.6</strong>
          <Badge tone="blue">现有流程</Badge>
        </div>
        <div className="agent-row">
          <div className="agent-mark">
            <ShieldCheck size={23} />
          </div>
          <div>
            <h3>独立审稿员</h3>
            <p>事实核对 · 完整性审校 · 质量评分</p>
          </div>
          <strong>DeepSeek Reviewer</strong>
          <Badge>待接入</Badge>
        </div>
      </section>
      <section className="pipeline-section">
        <SectionHead
          title="内容生产流程"
          action={
            <button className="text-button" onClick={() => setImageOpen(true)}>
              架构参考
              <ArrowUpRight size={14} />
            </button>
          }
        />
        <div className="pipeline-track">
          {[
            { icon: Rss, name: "采集", detail: "RSS / API / 网页" },
            { icon: Layers3, name: "规范与去重", detail: "跨平台 · 跨日期" },
            { icon: Bot, name: "内容分析", detail: "Worker · 规划" },
            { icon: FileText, name: "主编成稿", detail: "Kimi" },
            { icon: ShieldCheck, name: "质量门", detail: "规则 + 审稿" },
            { icon: FileCheck2, name: "发布", detail: "网页 · 消息" },
          ].map(({ icon: Icon, name, detail }, i) => (
            <div className="pipeline-stage" key={name}>
              <span>
                <Icon size={20} />
              </span>
              <strong>{name}</strong>
              <small>{detail}</small>
              {i < 5 && <ArrowRight className="pipeline-arrow" size={16} />}
            </div>
          ))}
        </div>
      </section>
      <div className="two-settings">
        <section>
          <SectionHead title="调用策略" />
          <NumberInput
            label="Worker 并发"
            disabled
            value={config.models.workerConcurrency}
            min={1}
            max={8}
            onChange={(n) =>
              update((d) => {
                d.models.workerConcurrency = n;
              })
            }
          />
          <NumberInput
            label="主编超时"
            value={config.models.editorTimeout}
            min={120}
            max={600}
            step={30}
            unit="秒"
            onChange={(n) =>
              update((d) => {
                d.models.editorTimeout = n;
              })
            }
          />
          <NumberInput
            label="审稿最低分"
            disabled
            value={config.models.reviewerThreshold}
            min={70}
            max={100}
            onChange={(n) =>
              update((d) => {
                d.models.reviewerThreshold = n;
              })
            }
          />
        </section>
        <section>
          <SectionHead title="发布硬规则" action={<LockKeyhole size={16} />} />
          {[
            "摘要栏目不低于 3 / 3 / 2",
            "标题、总览与结语完整",
            "关键词不少于 5 个",
            "保留可追溯原文链接",
            "密钥与推送目标不进入输出",
          ].map((s) => (
            <CheckLine key={s}>{s}</CheckLine>
          ))}
        </section>
      </div>
      {imageOpen && (
        <Modal
          title="多智能体生产架构 · V2 参考"
          wide
          onClose={() => setImageOpen(false)}
        >
          <img
            className="architecture-image"
            src={`${import.meta.env.BASE_URL}data/architecture.png`}
            alt="FeishuBrief 多模型分析、主编、审校、周报与非模型基础设施架构"
            width="1672"
            height="941"
          />
        </Modal>
      )}
    </>
  );
}

export function Runs({ data }: { data: Snapshot }) {
  const remote = useRemote();
  const [runMode, setRunMode] = useState<"generate" | "notify" | null>(null);
  const [detail, setDetail] = useState<Run | null>(null),
    [filter, setFilter] = useState("all");
  const runs = data.runs.filter(
    (r) =>
      filter === "all" ||
      (filter === "daily"
        ? r.workflowName === "Daily Brief"
        : r.conclusion !== "success"),
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>运行中心</h1>
          <p>每一次抓取、生成与发布，都有迹可循。</p>
        </div>
        <div className="page-actions">
          <Button
            icon={Workflow}
            disabled={!remote.session?.canWrite}
            onClick={() => setRunMode("generate")}
          >
            生成日报
          </Button>
          <Button
            icon={Upload}
            disabled={!remote.session?.canWrite}
            onClick={() => setRunMode("notify")}
          >
            推送已有日报
          </Button>
          <Button onClick={() => void remote.refresh()} loading={remote.busy}>
            刷新状态
          </Button>
        </div>
      </header>
      <div className="filter-tabs">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          全部运行
        </button>
        <button
          className={filter === "daily" ? "active" : ""}
          onClick={() => setFilter("daily")}
        >
          日报
        </button>
        <button
          className={filter === "failed" ? "active" : ""}
          onClick={() => setFilter("failed")}
        >
          异常
        </button>
      </div>
      <div className="run-list">
        {runs.map((run) => {
          const day = run.createdAt.slice(0, 10);
          const report = data.reports.find((r) => r.date === day);
          const q =
            report && run.workflowName === "Daily Brief"
              ? reportQuality(report)
              : undefined;
          return (
            <div className="run-row" key={run.databaseId}>
              <span
                className={`run-symbol ${run.conclusion === "success" ? "success" : ""}`}
              >
                {run.conclusion === "success" ? (
                  <Check size={18} />
                ) : (
                  <CircleAlert size={18} />
                )}
              </span>
              <div className="run-name">
                <button
                  className="article-title"
                  onClick={() => setDetail(run)}
                >
                  {run.workflowName === "Daily Brief"
                    ? "每日简报"
                    : run.workflowName}
                </button>
                <small>
                  #{run.databaseId} ·{" "}
                  {run.event === "schedule" ? "定时触发" : "手动触发"}
                </small>
              </div>
              <div className="run-date">
                <span>{day}</span>
                <small>
                  {new Date(run.createdAt).toLocaleTimeString("zh-CN", {
                    hour12: false,
                  })}
                </small>
              </div>
              <span className="run-duration">
                {Math.round(
                  (Date.parse(run.updatedAt) - Date.parse(run.createdAt)) /
                    60000,
                )}{" "}
                分钟
              </span>
              <div className="run-badges">
                <Badge tone={run.conclusion === "success" ? "green" : "amber"}>
                  {run.conclusion === "success"
                    ? "执行成功"
                    : run.status === "completed"
                      ? "执行异常"
                      : "执行中"}
                </Badge>
                {q && !q.ok && <Badge tone="amber">摘要不完整</Badge>}
              </div>
              <button
                className="row-arrow"
                aria-label={`查看运行 ${run.databaseId}`}
                onClick={() => setDetail(run)}
              >
                <ArrowUpRight size={17} />
              </button>
            </div>
          );
        })}
      </div>
      {runMode && <RunDialog mode={runMode} onClose={() => setRunMode(null)} />}
      {!runs.length && <Empty icon={Workflow} title="当前筛选下没有运行记录" />}
      <p className="data-note">
        运行记录为 {new Date(data.capturedAt).toLocaleString("zh-CN")}{" "}
        快照。阶段日志与渠道回执尚未同步，执行成功不等于摘要质量通过。
      </p>
      {detail && (
        <Modal
          title={`运行 #${detail.databaseId}`}
          onClose={() => setDetail(null)}
        >
          <dl className="detail-list">
            <div>
              <dt>工作流</dt>
              <dd>{detail.workflowName}</dd>
            </div>
            <div>
              <dt>触发方式</dt>
              <dd>{detail.event}</dd>
            </div>
            <div>
              <dt>开始</dt>
              <dd>{new Date(detail.createdAt).toLocaleString("zh-CN")}</dd>
            </div>
            <div>
              <dt>结束</dt>
              <dd>{new Date(detail.updatedAt).toLocaleString("zh-CN")}</dd>
            </div>
            <div>
              <dt>代码版本</dt>
              <dd>{detail.headSha.slice(0, 12)}</dd>
            </div>
            <div>
              <dt>执行结果</dt>
              <dd>{detail.conclusion ?? detail.status}</dd>
            </div>
          </dl>
          <div className="aside-note">
            <p>阶段详情</p>
            <span>
              当前快照未包含阶段日志、API 调用费用和渠道回执；可打开原始 Actions
              记录核对。
            </span>
          </div>
          <ExternalLink href={detail.url}>打开这次运行</ExternalLink>
        </Modal>
      )}
    </>
  );
}

export function Versions() {
  const { config, baseline, versions, replace, changes } = useWorkspace();
  const [selected, setSelected] = useState<Version | null>(null);
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>配置版本</h1>
          <p>每次调整都有据可查，也随时可以回到上一个方向。</p>
        </div>
        <Button
          icon={Download}
          onClick={() => downloadJson(config, "editorial-profile.json")}
        >
          导出当前配置
        </Button>
      </header>
      <div className="version-draft">
        <GitBranch size={22} />
        <div>
          <strong>当前草稿</strong>
          <p>
            {config.name} · {changes.length} 处变更
          </p>
        </div>
        <Badge tone="blue">此浏览器</Badge>
      </div>
      <SectionHead title="尚未保存为版本的更改" />
      <DiffTable before={baseline} after={config} />
      <SectionHead
        title="本地版本记录"
        subtitle="恢复版本后仍是本地草稿，正式日报配置不会自动改变"
      />
      {versions.length ? (
        <div className="versions-list">
          {versions.map((version) => (
            <div className="version-row" key={version.id}>
              <History size={19} />
              <div>
                <button
                  className="article-title"
                  onClick={() => setSelected(version)}
                >
                  {version.name}
                </button>
                <small>
                  {new Date(version.createdAt).toLocaleString("zh-CN")} ·{" "}
                  {version.changes} 处变更
                </small>
              </div>
              <Button onClick={() => setSelected(version)}>查看差异</Button>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={History} title="还没有保存的版本">
          <p>当前草稿可通过右上角“保存版本”归档。</p>
        </Empty>
      )}
      {selected && (
        <Modal
          title={`版本：${selected.name}`}
          wide
          onClose={() => setSelected(null)}
        >
          <DiffTable before={config} after={selected.config} />
          <div className="modal-actions">
            <Button
              icon={Download}
              onClick={() =>
                downloadJson(
                  selected.config,
                  `editorial-profile-${selected.id.slice(0, 8)}.json`,
                )
              }
            >
              导出
            </Button>
            <Button
              icon={History}
              variant="primary"
              onClick={() => {
                if (replace(selected.config)) setSelected(null);
              }}
            >
              恢复为草稿
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Settings({
  data,
  reload,
}: {
  data: Snapshot;
  reload: () => void;
}) {
  const { config, replace } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(""),
    [imported, setImported] = useState<Config | null>(null);
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 200000) throw new Error("配置文件不能超过 200 KB。");
      const result = configSchema.safeParse(JSON.parse(await file.text()));
      if (!result.success)
        throw new Error(
          `配置不符合 V3 协议：${result.error.issues[0]?.path.join(".")} ${result.error.issues[0]?.message}`,
        );
      const unknown = Object.keys(result.data.sourceOverrides).filter(
        (id) => !data.sources.some((s) => s.id === id),
      );
      if (unknown.length)
        throw new Error(`未知信源 ID：${unknown.slice(0, 3).join("、")}`);
      setImported(result.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "配置文件读取失败。");
    }
    if (input.current) input.current.value = "";
  };
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>系统设置</h1>
          <p>工作区、数据与服务连接。</p>
        </div>
      </header>
      <div className="settings-content">
        <section className="settings-section">
          <SectionHead title="工作区" />
          <dl className="detail-list">
            <div>
              <dt>仓库</dt>
              <dd>No1dry / FeishuBrief</dd>
            </div>
            <div>
              <dt>配置模式</dt>
              <dd>
                <Badge tone="blue">本地草稿</Badge>
              </dd>
            </div>
            <div>
              <dt>数据来源</dt>
              <dd>
                {data.origin.startsWith("github")
                  ? "GitHub 在线数据"
                  : "本地归档快照"}
              </dd>
            </div>
            <div>
              <dt>快照时间</dt>
              <dd>{new Date(data.capturedAt).toLocaleString("zh-CN")}</dd>
            </div>
            <div>
              <dt>历史归档</dt>
              <dd>{data.reports.length} 期</dd>
            </div>
          </dl>
          <Button onClick={reload}>重新读取快照</Button>
          {data.warnings.length > 0 && (
            <div className="import-errors">
              {data.warnings.map((w) => (
                <p key={w}>
                  <CircleAlert size={14} />
                  {w}
                </p>
              ))}
            </div>
          )}
        </section>
        <RemoteStatus />
        <section className="settings-section">
          <SectionHead title="配置备份" />
          <div className="backup-row">
            <Button
              icon={Download}
              onClick={() => downloadJson(config, "editorial-profile.json")}
            >
              导出配置
            </Button>
            <Button icon={Upload} onClick={() => input.current?.click()}>
              导入配置
            </Button>
            <input
              ref={input}
              className="sr-only"
              type="file"
              accept="application/json,.json"
              aria-label="导入配置文件"
              onChange={(e) => void importFile(e.target.files?.[0])}
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <p className="data-note">
            草稿与版本保存在当前浏览器。清除浏览器数据前，请先导出备份。
          </p>
        </section>
      </div>
      {imported && (
        <Modal title="检查导入配置" wide onClose={() => setImported(null)}>
          <DiffTable before={config} after={imported} />
          <div className="modal-actions">
            <Button onClick={() => setImported(null)}>取消</Button>
            <Button
              icon={Check}
              variant="primary"
              onClick={() => {
                if (replace(imported)) setImported(null);
              }}
            >
              导入为草稿
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
