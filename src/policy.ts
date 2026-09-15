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
    models: z
      .object({
        workerConcurrency: z.number().int().min(1).max(8),
        editorTimeout: z.number().int().min(120).max(600),
        reviewerThreshold: z.number().int().min(70).max(100),
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
  name: "AI Frontier",
  researchTopics: [
    {
      id: "vla",
      name: "VLA",
      enabled: true,
      priority: "P0",
      weight: 1.4,
      keywords: ["VLA", "vision-language-action"],
      aliases: [
        "vision language action",
        "robotic foundation model",
        "visuomotor",
      ],
      excludeKeywords: [],
    },
    {
      id: "agent",
      name: "Agent",
      enabled: true,
      priority: "P0",
      weight: 1.2,
      keywords: ["agent", "agentic", "multi-agent"],
      aliases: ["tool use", "computer use", "autonomous research"],
      excludeKeywords: ["air combat", "eye clinic"],
    },
    {
      id: "world-model",
      name: "World Model",
      enabled: true,
      priority: "P0",
      weight: 1,
      keywords: ["world model", "world models"],
      aliases: ["latent dynamics", "video world model", "predictive world"],
      excludeKeywords: [],
    },
    {
      id: "embodied",
      name: "具身智能",
      enabled: true,
      priority: "P1",
      weight: 0.8,
      keywords: ["具身智能", "embodied"],
      aliases: ["robot learning", "robot policy", "机器人学习"],
      excludeKeywords: [],
    },
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
      [...topic.keywords, ...topic.aliases].some((word) =>
        includesKeyword(text, word),
      ),
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
