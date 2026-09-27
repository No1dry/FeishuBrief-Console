import { z } from "zod";
import type { Article, ReportRecord, Source } from "./types";

z.config({ jitless: true });

const keyword = z.string().trim().min(2).max(100);
const topicSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(60),
    name: z.string().trim().min(1).max(50),
    enabled: z.boolean(),
    priority: z.enum(["P0", "P1", "P2"]),
    weight: z.number().min(0).max(2),
    keywords: z.array(keyword).min(1).max(40),
    aliases: z.array(keyword).max(40),
    excludeKeywords: z.array(keyword).max(40),
    scope: z.string().trim().min(1).max(1200).optional(),
    exclusions: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
    positiveExamples: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
    negativeExamples: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
    subtopics: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/).max(60), name: z.string().trim().min(1).max(60), keywords: z.array(keyword).min(1).max(20) }).strict()).max(20).refine(items => new Set(items.map(t => t.id)).size === items.length, "子方向 ID 不能重复").optional(),
    relevanceThreshold: z.number().int().min(70).max(100).optional(),
    radarLimit: z.number().int().min(1).max(100).optional(),

  })
  .strict();
const countsSchema = z
  .object({
    tech: z.number().int().min(3).max(12),
    finance: z.number().int().min(3).max(12),
    politics: z.number().int().min(2).max(8),
  })
  .strict();
export const configSchema = z
  .object({
    schemaVersion: z.literal(3),
    name: z.string().trim().min(1).max(60),
    researchTopics: z
      .array(topicSchema)
      .min(1)
      .max(12)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "主题 ID 不能重复",
      ),
    papers: z
      .object({
        minimumScore: z.number().int().min(20).max(100),
        dailyMaximum: z.number().int().min(1).max(40),
        historyDays: z.number().int().min(1).max(90),
        arxivMaximum: z.number().int().min(1).max(20),
        requireAbstract: z.boolean(),
      })
      .strict(),
    sourceOverrides: z.record(
      z.string().regex(/^[a-z0-9_-]+$/),
      z
        .object({
          enabled: z.boolean().optional(),
          priority: z.enum(["P0", "P1", "P2"]).optional(),
          dailyLimit: z.number().int().min(1).max(100).optional(),
        })
        .strict(),
    ),
    daily: z
      .object({
        editorCandidates: z
          .object({
            tech: z.number().int().min(10).max(60),
            finance: z.number().int().min(5).max(40),
            politics: z.number().int().min(5).max(30),
          })
          .strict(),
        webMaximum: z.number().int().min(20).max(200),
      })
      .strict(),
    notifications: z
      .object({
        feishu: countsSchema,
        pushplus: countsSchema,
        overview: z.boolean(),
        market: z.boolean(),
      })
      .strict(),
    weekly: z
      .object({
        enabled: z.boolean(),
        weekday: z.number().int().min(0).max(6),
        requireCompleteDays: z.literal(7),
        reviewMinimumScore: z.number().int().min(80).max(100),
      })
      .strict(),
    personalBriefs: z.object({ enabled: z.boolean().default(false) }).strict().default({ enabled: false }),
    models: z
      .object({
        workerConcurrency: z.number().int().min(1).max(8),
        editorTimeout: z.number().int().min(120).max(600),
        reviewerThreshold: z.number().int().min(80).max(100),
      })
      .strict(),
  })
  .strict()
  .refine(
    (c) => c.researchTopics.some((t) => t.enabled && t.weight > 0),
    "至少启用一个研究主题",
  );
export type Config = z.infer<typeof configSchema>;
export type Topic = Config["researchTopics"][number];
export const defaultConfig: Config = {
  schemaVersion: 3,
  personalBriefs: { enabled: false },
  name: "AI Frontier",
  researchTopics: [
  {
    "id": "vla",
    "name": "VLA",
    "enabled": true,
    "priority": "P0",
    "weight": 1.4,
    "keywords": [
      "VLA",
      "vision-language-action"
    ],
    "aliases": [
      "vision language action",
      "robotic foundation model",
      "视觉语言动作"
    ],
    "excludeKeywords": [],
    "scope": "将视觉、语言和动作统一建模的策略、训练、评测及部署；可与机器人、世界模型和强化学习交叉。",
    "exclusions": [
      "仅视觉语言理解而不生成动作的 VLM 不归入本主题。",
      "仅提到机器人或使用现成 VLA 且无研究贡献，不构成核心相关。"
    ],
    "positiveExamples": [
      "结合视觉与语言指令生成机械臂动作的策略模型。"
    ],
    "negativeExamples": [
      "通用图像问答 VLM，没有动作建模。"
    ],
    "subtopics": [
      {
        "id": "policy",
        "name": "动作策略",
        "keywords": [
          "action policy",
          "visuomotor"
        ]
      },
      {
        "id": "training",
        "name": "训练与适配",
        "keywords": [
          "fine-tuning",
          "post-training"
        ]
      },
      {
        "id": "evaluation",
        "name": "评测与部署",
        "keywords": [
          "benchmark",
          "deployment"
        ]
      }
    ],
    "relevanceThreshold": 70,
    "radarLimit": 20
  },
  {
    "id": "world-model",
    "name": "World Model",
    "enabled": true,
    "priority": "P0",
    "weight": 1,
    "keywords": [
      "world model",
      "world models"
    ],
    "aliases": [
      "latent dynamics",
      "video world model",
      "predictive world",
      "world modeling",
      "world modelling",
      "世界模型"
    ],
    "excludeKeywords": [],
    "scope": "学习环境状态转移、动力学或可用于预测与规划的世界表征；覆盖机器人及非机器人环境。",
    "exclusions": [
      "普通视频生成只有在环境动态、可交互仿真或规划贡献明确时纳入。",
      "标题中的 model 不表示 world model。"
    ],
    "positiveExamples": [
      "学习潜在环境动力学并用于长时规划。"
    ],
    "negativeExamples": [
      "纯视频美化与插帧，没有环境动态或规划贡献。"
    ],
    "subtopics": [
      {
        "id": "dynamics",
        "name": "动力学与表征",
        "keywords": [
          "latent dynamics",
          "representation"
        ]
      },
      {
        "id": "planning",
        "name": "预测与规划",
        "keywords": [
          "planning",
          "prediction"
        ]
      },
      {
        "id": "simulation",
        "name": "交互仿真",
        "keywords": [
          "simulation",
          "interactive"
        ]
      }
    ],
    "relevanceThreshold": 70,
    "radarLimit": 20
  },
  {
    "id": "agent",
    "name": "Agent",
    "enabled": true,
    "priority": "P0",
    "weight": 1.2,
    "keywords": [
      "agent",
      "agentic",
      "multi-agent"
    ],
    "aliases": [
      "tool use",
      "computer use",
      "autonomous research",
      "tool calling",
      "智能体"
    ],
    "excludeKeywords": [],
    "scope": "自主任务规划、工具使用、记忆、多智能体协作、评测与可靠性；可用于软件或物理环境。",
    "exclusions": [
      "仅在垂直应用中使用 agent 一词，且无可迁移的智能体方法贡献时降低相关性。",
      "强化学习中的 agent 并不自动归为 LLM Agent。"
    ],
    "positiveExamples": [
      "评测工具调用与长期记忆对自主研究智能体的作用。"
    ],
    "negativeExamples": [
      "市场代理人统计分析，没有智能体算法或系统贡献。"
    ],
    "subtopics": [
      {
        "id": "tools",
        "name": "工具与交互",
        "keywords": [
          "tool use",
          "computer use"
        ]
      },
      {
        "id": "memory",
        "name": "记忆与规划",
        "keywords": [
          "memory",
          "planning"
        ]
      },
      {
        "id": "multi-agent",
        "name": "多智能体",
        "keywords": [
          "multi-agent",
          "coordination"
        ]
      }
    ],
    "relevanceThreshold": 70,
    "radarLimit": 20
  },
  {
    "id": "robotics",
    "name": "Robotics",
    "enabled": true,
    "priority": "P1",
    "weight": 1,
    "keywords": [
      "robotics",
      "robot"
    ],
    "aliases": [
      "robot learning",
      "robot policy",
      "robotic manipulation",
      "locomotion",
      "visuomotor",
      "机器人",
      "机器人学习"
    ],
    "excludeKeywords": [],
    "scope": "机器人感知、控制、运动、操作、硬件与真实系统评测；VLA、世界模型、强化学习只有对机器人有明确贡献时交叉标注。",
    "exclusions": [
      "纯软件聊天机器人不纳入。",
      "仅以具身智能作愿景、没有机器人研究或系统证据时不纳入。"
    ],
    "positiveExamples": [
      "真实四足机器人在复杂地形中的运动控制与评测。"
    ],
    "negativeExamples": [
      "名为 robot 的客服聊天应用。"
    ],
    "subtopics": [
      {
        "id": "manipulation",
        "name": "操作",
        "keywords": [
          "manipulation",
          "grasping"
        ]
      },
      {
        "id": "locomotion",
        "name": "运动控制",
        "keywords": [
          "locomotion",
          "control"
        ]
      },
      {
        "id": "systems",
        "name": "感知与系统",
        "keywords": [
          "perception",
          "hardware",
          "sim-to-real"
        ]
      }
    ],
    "relevanceThreshold": 70,
    "radarLimit": 20
  },
  {
    "id": "reinforcement-learning",
    "name": "Reinforcement Learning",
    "enabled": true,
    "priority": "P1",
    "weight": 1,
    "keywords": [
      "reinforcement learning"
    ],
    "aliases": [
      "RL",
      "RLHF",
      "reinforcement fine-tuning",
      "policy optimization",
      "reward learning",
      "强化学习",
      "强化微调"
    ],
    "excludeKeywords": [],
    "scope": "通过奖励与环境交互进行策略学习，含离线/在线 RL、奖励建模及语言模型强化后训练；不限于机器人。",
    "exclusions": [
      "仅使用 reward、agent 等通用词并不能证明强化学习贡献。",
      "监督学习、模仿学习无强化优化环节时不纳入。"
    ],
    "positiveExamples": [
      "通过环境奖励优化机器人策略或语言模型推理策略。"
    ],
    "negativeExamples": [
      "只用标注动作做监督模仿学习，没有奖励优化。"
    ],
    "subtopics": [
      {
        "id": "policy",
        "name": "策略优化",
        "keywords": [
          "policy optimization",
          "actor critic"
        ]
      },
      {
        "id": "offline",
        "name": "离线强化学习",
        "keywords": [
          "offline RL",
          "offline reinforcement learning"
        ]
      },
      {
        "id": "post-training",
        "name": "强化后训练",
        "keywords": [
          "RLHF",
          "reasoning",
          "post-training"
        ]
      }
    ],
    "relevanceThreshold": 70,
    "radarLimit": 20
  }
],
  papers: {
    minimumScore: 52,
    dailyMaximum: 20,
    historyDays: 14,
    arxivMaximum: 6,
    requireAbstract: true,
  },
  sourceOverrides: {},
  daily: {
    editorCandidates: { tech: 25, finance: 20, politics: 15 },
    webMaximum: 200,
  },
  notifications: {
    feishu: { tech: 5, finance: 5, politics: 3 },
    pushplus: { tech: 5, finance: 5, politics: 3 },
    overview: true,
    market: true,
  },
  weekly: {
    enabled: false,
    weekday: 0,
    requireCompleteDays: 7,
    reviewMinimumScore: 85,
  },
  models: { workerConcurrency: 3, editorTimeout: 300, reviewerThreshold: 80 },
};
export const clone = <T>(value: T): T => structuredClone(value);
const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function includesKeyword(text: string, word: string): boolean {
  const haystack = normalize(text),
    needle = normalize(word);
  if (!needle) return false;
  if (/^[\x00-\x7F]+$/.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(
      haystack,
    );
  }
  return haystack.includes(needle);
}
export function matchTopics(article: Article, config: Config): Topic[] {
  const text = `${article.title}\n${article.excerpt ?? ""}\n${article.summary ?? ""}`;
  return config.researchTopics.filter(
    (topic) =>
      topic.enabled &&
      topic.weight > 0 &&
      !topic.excludeKeywords.some((word) => includesKeyword(text, word)) &&
      [
        ...topic.keywords,
        ...topic.aliases,
        ...(topic.id === "world-model"
          ? ["world modeling", "world modelling"]
          : []),
      ].some((word) => includesKeyword(text, word)),
  );
}
export function sourceEnabled(source: Source, config: Config): boolean {
  return (
    (config.sourceOverrides[source.id]?.enabled ?? source.enabled !== false) &&
    (source.locales ?? ["zh", "en"]).includes("zh")
  );
}
export function sourcePriority(source: Source, config: Config): string {
  return (
    config.sourceOverrides[source.id]?.priority ??
    (source.tier === "T0" || source.tier === "T1"
      ? "P0"
      : source.tier === "T2"
        ? "P1"
        : "P2")
  );
}
export function canonicalKey(article: Article): string {
  const arxiv = article.url.match(
    /(?:arxiv\.org\/(?:abs|pdf)\/|huggingface\.co\/papers\/)(\d{4}\.\d{4,5})/i,
  )?.[1];
  return arxiv
    ? `arxiv:${arxiv}`
    : normalize(article.title).replace(/[^a-z0-9\u3400-\u9fff]/g, "");
}
export function isPaper(article: Article, sources: Source[]): boolean {
  return (
    ["huggingface-papers", "arxiv-cs-ai", "arxiv-cs-lg", "openreview"].includes(
      article.sourceId,
    ) ||
    sources.find((s) => s.id === article.sourceId)?.type === "academic-author"
  );
}
export interface Assessment {
  article: Article;
  score: number;
  topics: Topic[];
  accepted: boolean;
  reason: string;
  evidence: string[];
}
export function previewPapers(
  report: ReportRecord | undefined,
  history: ReportRecord[],
  sources: Source[],
  config: Config,
): Assessment[] {
  if (!report) return [];
  const previous = new Set<string>();
  for (const day of history) {
    const delta = (Date.parse(report.date) - Date.parse(day.date)) / 86400000;
    if (delta <= 0 || delta > config.papers.historyDays) continue;
    day.articles
      .filter((a) => isPaper(a, sources))
      .forEach((a) => previous.add(canonicalKey(a)));
  }
  const seen = new Set<string>();
  let total = 0,
    arxivCount = 0;
  return report.articles
    .filter((a) => isPaper(a, sources))
    .map((article) => {
      const topics = matchTopics(article, config);
      const text = `${article.title} ${article.excerpt ?? ""} ${article.summary ?? ""}`;
      const evidence = [
        /benchmark|evaluation|experiment|ablation|评测|实验|消融/i.test(text)
          ? "实验 / 评测"
          : "",
        /open.source|github|code|dataset|开源|代码|数据集/i.test(text)
          ? "代码 / 数据"
          : "",
        (article.excerpt?.length ?? 0) >= 80 ? "摘要完整" : "",
      ].filter(Boolean);
      const score = Math.min(
        100,
        Math.round(
          topics.reduce((sum, t) => sum + 30 * t.weight, 0) +
            evidence.length * 8,
        ),
      );
      return { article, score, topics, accepted: false, reason: "", evidence };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => {
      const source = sources.find((s) => s.id === item.article.sourceId);
      const key = canonicalKey(item.article);
      if (source && !sourceEnabled(source, config)) item.reason = "信源未启用";
      else if (previous.has(key)) item.reason = "历史候选已出现";
      else if (!item.topics.length) item.reason = "研究方向不匹配";
      else if (config.papers.requireAbstract && !item.article.excerpt?.trim())
        item.reason = "缺少原始摘要";
      else if (item.score < config.papers.minimumScore)
        item.reason = "低于回放分阈值";
      else if (seen.has(key)) item.reason = "同日重复论文";
      else if (
        item.article.sourceId.startsWith("arxiv-") &&
        arxivCount >= config.papers.arxivMaximum
      )
        item.reason = "arXiv 已达上限";
      else if (total >= config.papers.dailyMaximum)
        item.reason = "已达当日上限";
      else {
        item.accepted = true;
        item.reason = "通过回放规则";
        total++;
        seen.add(key);
        if (item.article.sourceId.startsWith("arxiv-")) arxivCount++;
      }
      return item;
    });
}
export function diffConfig(
  before: unknown,
  after: unknown,
  prefix = "",
): { path: string; before: string; after: string }[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const a = before as Record<string, unknown>,
      b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
      diffConfig(a[key], b[key], prefix ? `${prefix}.${key}` : key),
    );
  }
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    prefix === "researchTopics"
  ) {
    const ids = [...new Set([...before, ...after].map((t: Topic) => t.id))];
    return ids.flatMap((id) =>
      diffConfig(
        before.find((t: Topic) => t.id === id),
        after.find((t: Topic) => t.id === id),
        `${prefix}.${id}`,
      ),
    );
  }
  return [
    {
      path: prefix,
      before: before === undefined ? "未设置" : JSON.stringify(before),
      after: after === undefined ? "未设置" : JSON.stringify(after),
    },
  ];
}
export function reportQuality(report: ReportRecord): {
  ok: boolean;
  counts: number[];
  issues: string[];
} {
  const r = report.report,
    counts = [
      r.tech_briefs?.length ?? 0,
      r.finance_briefs?.length ?? 0,
      r.politics_briefs?.length ?? 0,
    ];
  const issues = counts.flatMap((n, i) =>
    n < [3, 3, 2][i]
      ? [`${["科技", "财经", "时政"][i]}摘要 ${n} 条，低于 ${[3, 3, 2][i]} 条`]
      : [],
  );
  if (!r.daily_overview?.trim()) issues.push("缺少总览");
  if (!r.editor_note?.trim()) issues.push("缺少编辑结语");
  if ((r.keywords?.length ?? 0) < 5) issues.push("关键词不足 5 个");
  return { ok: issues.length === 0, counts, issues };
}
