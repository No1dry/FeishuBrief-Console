import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  IconButton,
  Modal,
  SectionHead,
  Select,
  Toggle,
} from "../components";
import {
  matchTopics,
  previewPapers,
  sourceEnabled,
  type Topic,
} from "../policy";
import type { Article, Snapshot } from "../types";
import { useWorkspace } from "../workspace";

const descriptions: Record<string, string> = {
  vla: "视觉、语言与动作的统一建模",
  agent: "智能体、工具调用与自主研究",
  "world-model": "世界表征、动态预测与交互仿真",
  embodied: "机器人学习、感知与环境交互",
};
export function KeywordList({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState(""),
    [error, setError] = useState("");
  const add = () => {
    const value = input.trim();
    if (value.length < 2 || value.length > 100) {
      setError("关键词长度需要在 2 到 100 个字符之间。");
      return;
    }
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setError("这个关键词已经存在。");
      return;
    }
    onChange([...values, value]);
    setInput("");
    setError("");
  };
  return (
    <div className="keyword-field">
      <label>{label}</label>
      <div className="keyword-box">
        {values.map((v) => (
          <span className="keyword" key={v}>
            {v}
            <button
              type="button"
              aria-label={`移除 ${v}`}
              onClick={() => onChange(values.filter((item) => item !== v))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          aria-label={`添加${label}`}
          placeholder={values.length ? "添加…" : "输入关键词"}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError("");
          }}
          aria-invalid={!!error}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <IconButton icon={Plus} label={`添加${label}`} onClick={add} />
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export default function Research({
  data,
  inspect,
  openPreview,
}: {
  data: Snapshot;
  inspect: (a: Article) => void;
  openPreview: () => void;
}) {
  const { config, update } = useWorkspace();
  const [editing, setEditing] = useState<Topic | null>(null),
    [adding, setAdding] = useState(false),
    [filter, setFilter] = useState("all");
  const [modalError, setModalError] = useState("");
  const latest = data.reports[0];
  const matched = useMemo(
    () =>
      (latest?.articles ?? []).filter(
        (a) =>
          matchTopics(a, config).length &&
          sourceEnabled(
            data.sources.find((s) => s.id === a.sourceId) ?? {
              ...a,
              id: a.sourceId,
              name: a.sourceId,
              type: "rss",
            },
            config,
          ),
      ),
    [config, data.sources, latest],
  );
  const visible = matched.filter(
    (a) =>
      filter === "all" || matchTopics(a, config).some((t) => t.id === filter),
  );
  const papers = previewPapers(latest, data.reports, data.sources, config);
  const applyPreset = (id: string) =>
    update((draft) => {
      draft.name =
        id === "world-model"
          ? "World Model Focus"
          : id === "vla"
            ? "VLA Focus"
            : id === "agent"
              ? "Agent Systems"
              : "AI Frontier";
      draft.researchTopics.forEach((t) => {
        t.weight = id === "balanced" ? 1 : t.id === id ? 1.8 : 0.6;
        t.priority = id === "balanced" || t.id === id ? "P0" : "P1";
      });
    });
  const edit = (topic: Topic) => {
    setEditing(structuredClone(topic));
    setAdding(false);
    setModalError("");
  };
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>研究重点</h1>
          <p>VLA、Agent、World Model，以及你接下来想探索的方向。</p>
        </div>
        <div className="page-actions">
          <Button
            icon={Plus}
            onClick={() => {
              setAdding(true);
              setEditing({
                id: "",
                name: "",
                enabled: true,
                priority: "P1",
                weight: 1,
                keywords: [],
                aliases: [],
                excludeKeywords: [],
              });
              setModalError("");
            }}
          >
            新增主题
          </Button>
          <Button
            variant="primary"
            icon={SlidersHorizontal}
            onClick={openPreview}
          >
            预览影响
          </Button>
        </div>
      </header>
      <div className="research-workspace">
        <div className="research-main">
          <div className="profile-toolbar">
            <div>
              <span className="muted small">研究策略</span>
              <strong>{config.name}</strong>
              <Badge>草稿</Badge>
            </div>
            <Select
              label="切换研究策略"
              value="choose"
              onChange={applyPreset}
              options={[
                { value: "choose", label: "选择预设策略" },
                { value: "balanced", label: "均衡关注" },
                { value: "vla", label: "VLA Focus" },
                { value: "agent", label: "Agent Systems" },
                { value: "world-model", label: "World Model Focus" },
              ]}
            />
          </div>
          <div className="topic-table-head">
            <span>研究主题</span>
            <span>优先级</span>
            <span>关注权重</span>
            <span>启用</span>
          </div>
          {config.researchTopics.map((topic, index) => (
            <div
              className={`topic-row ${topic.enabled ? "" : "is-off"}`}
              key={topic.id}
            >
              <div className="topic-identity">
                <span className={`topic-monogram topic-color-${index % 4}`}>
                  {topic.name === "World Model"
                    ? "WM"
                    : topic.name === "具身智能"
                      ? "E"
                      : topic.name === "Agent"
                        ? "A"
                        : topic.name.slice(0, 3)}
                </span>
                <div>
                  <button className="topic-name" onClick={() => edit(topic)}>
                    {topic.name}
                  </button>
                  <p>{descriptions[topic.id] ?? topic.keywords.join(" · ")}</p>
                  <div className="topic-keywords">
                    {topic.keywords.slice(0, 2).map((k) => (
                      <span key={k}>{k}</span>
                    ))}
                    <button
                      aria-label={`编辑 ${topic.name} 关键词`}
                      onClick={() => edit(topic)}
                    >
                      +{topic.aliases.length}
                    </button>
                  </div>
                </div>
              </div>
              <Select
                compact
                label={`${topic.name} 优先级`}
                value={topic.priority}
                onChange={(value) =>
                  update((draft) => {
                    draft.researchTopics[index].priority =
                      value as Topic["priority"];
                  })
                }
                options={["P0", "P1", "P2"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
              <div className="weight-control">
                <input
                  aria-label={`${topic.name} 关注权重`}
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={topic.weight}
                  onChange={(e) =>
                    update((draft) => {
                      draft.researchTopics[index].weight = Number(
                        e.target.value,
                      );
                    })
                  }
                />
                <output>{topic.weight.toFixed(1)}</output>
              </div>
              <Toggle
                label={`启用 ${topic.name}`}
                checked={topic.enabled}
                onChange={(value) =>
                  update((draft) => {
                    draft.researchTopics[index].enabled = value;
                  })
                }
              />
            </div>
          ))}
          <div className="topic-bottom">
            <Check size={14} />
            <span>
              质量优先 · 上限不足时不补齐 · 跨日排重 {config.papers.historyDays}{" "}
              天
            </span>
          </div>
          <section className="matched-section">
            <SectionHead
              title="匹配内容"
              subtitle={`${latest?.date ?? ""} · 当前策略的关键词回放`}
              action={<Badge>{matched.length} 条命中</Badge>}
            />
            <div className="filter-tabs" role="group" aria-label="主题筛选">
              <button
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
              >
                全部
              </button>
              {config.researchTopics.map((topic) => (
                <button
                  key={topic.id}
                  className={filter === topic.id ? "active" : ""}
                  onClick={() => setFilter(topic.id)}
                >
                  {topic.name}
                </button>
              ))}
            </div>
            {visible.slice(0, 8).map((a, i) => (
              <div className="compact-article" key={`${a.url}-${i}`}>
                <div>
                  <button className="article-title" onClick={() => inspect(a)}>
                    {a.title}
                  </button>
                  <span>
                    {a.source ||
                      data.sources.find((s) => s.id === a.sourceId)?.name ||
                      a.sourceId}
                  </span>
                </div>
                <Badge tone="blue">
                  {matchTopics(a, config)
                    .map((t) => t.name)
                    .join(" / ")}
                </Badge>
              </div>
            ))}
            {!visible.length && <Empty title="本期没有匹配这个方向的内容" />}
          </section>
        </div>
        <aside className="impact-aside">
          <SectionHead
            title="策略影响"
            action={
              <span className="live-label">
                <span />
                实时回放
              </span>
            }
          />
          <div className="impact-total">
            <strong>{matched.length}</strong>
            <span>条相关内容</span>
          </div>
          <div className="coverage-bars">
            {config.researchTopics.map((topic, i) => {
              const count = matched.filter((a) =>
                matchTopics(a, config).some((t) => t.id === topic.id),
              ).length;
              return (
                <div className="coverage-row" key={topic.id}>
                  <div>
                    <span>{topic.name}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="coverage-track">
                    <span
                      className={`topic-fill-${i % 4}`}
                      style={{
                        width: `${matched.length ? (count / matched.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <dl className="impact-facts">
            <div>
              <dt>可用信源</dt>
              <dd>
                {data.sources.filter((s) => sourceEnabled(s, config)).length}
              </dd>
            </div>
            <div>
              <dt>论文通过回放</dt>
              <dd>
                {papers.filter((p) => p.accepted).length}
                <small> / {papers.length}</small>
              </dd>
            </div>
            <div>
              <dt>飞书摘要目标</dt>
              <dd>
                {config.notifications.feishu.tech +
                  config.notifications.feishu.finance +
                  config.notifications.feishu.politics}
                <small> 条</small>
              </dd>
            </div>
            <div>
              <dt>数据窗口</dt>
              <dd>{latest?.date}</dd>
            </div>
          </dl>
          <div className="aside-note">
            <p>回放范围</p>
            <span>
              仅使用已归档候选。信源未抓到的内容、语义评审结果和模型费用不在估计范围内。
            </span>
          </div>
          <button className="text-button" onClick={openPreview}>
            比较保存前后的结果
            <ArrowRight size={14} />
          </button>
        </aside>
      </div>
      {editing && (
        <Modal
          title={adding ? "新增研究主题" : `编辑 ${editing.name}`}
          onClose={() => setEditing(null)}
        >
          <div className="form-stack">
            <label className="field">
              主题名称
              <input
                value={editing.name}
                maxLength={50}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            {adding && (
              <label className="field">
                主题 ID
                <input
                  value={editing.id}
                  placeholder="robot-learning"
                  onChange={(e) =>
                    setEditing({ ...editing, id: e.target.value.toLowerCase() })
                  }
                />
              </label>
            )}
            <KeywordList
              label="关键词"
              values={editing.keywords}
              onChange={(keywords) => setEditing({ ...editing, keywords })}
            />
            <KeywordList
              label="同义词"
              values={editing.aliases}
              onChange={(aliases) => setEditing({ ...editing, aliases })}
            />
            <KeywordList
              label="排除词"
              values={editing.excludeKeywords}
              onChange={(excludeKeywords) =>
                setEditing({ ...editing, excludeKeywords })
              }
            />
            {modalError && (
              <p role="alert" className="field-error">
                {modalError}
              </p>
            )}
            <div className="modal-actions">
              <Button onClick={() => setEditing(null)}>取消</Button>
              <Button
                variant="primary"
                icon={Check}
                onClick={() => {
                  if (
                    !editing.name.trim() ||
                    !/^[a-z0-9-]+$/.test(editing.id) ||
                    !editing.keywords.length
                  ) {
                    setModalError(
                      "填写主题名称、字母数字 ID 和至少一个关键词。",
                    );
                    return;
                  }
                  if (
                    adding &&
                    config.researchTopics.some((t) => t.id === editing.id)
                  ) {
                    setModalError("主题 ID 已存在，请换一个。");
                    return;
                  }
                  const saved = update((draft) => {
                    if (adding) draft.researchTopics.push(editing);
                    else
                      draft.researchTopics = draft.researchTopics.map((t) =>
                        t.id === editing.id ? editing : t,
                      );
                  });
                  if (saved) setEditing(null);
                }}
              >
                保存主题
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
