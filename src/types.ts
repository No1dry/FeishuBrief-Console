export type Category = "tech" | "finance" | "politics";
export interface Source {
  id: string;
  name: string;
  type: string;
  url: string;
  category: Category;
  subcategory?: string;
  enabled?: boolean;
  lang?: string;
  locales?: string[];
  limit?: number;
  dailyLimit?: number;
  keywords?: string[];
  entityType?: string;
  entity?: string;
  tier?: string;
  topics?: string[];
  shadowMode?: boolean;
}
export interface Article {
  sourceId: string;
  source?: string;
  title: string;
  url: string;
  excerpt?: string;
  summary?: string;
  publishedAt?: string;
  category: Category;
  meta?: string;
}
export interface Brief {
  title: string;
  summary: string;
  url: string;
  source: string;
  importance?: number;
}
export interface DailyReport {
  hero_headline: string;
  daily_overview: string;
  tech_briefs: Brief[];
  finance_briefs: Brief[];
  politics_briefs: Brief[];
  editor_note?: string;
  keywords?: string[];
  trading?: { market_overview?: string };
  quality_review?: {
    status: "passed" | "failed";
    reviewer: string;
    score: number;
    blockingIssues: string[];
    suggestions: string[];
    summary: string;
    attempt: number;
  };
}
export interface ReportRecord {
  date: string;
  report: DailyReport;
  articles: Article[];
  url: string;
}
export interface Run {
  databaseId: number;
  status: string;
  conclusion: string | null;
  workflowName: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
  event: string;
  url: string;
}
export interface Snapshot {
  schemaVersion: number;
  capturedAt: string;
  origin: string;
  repository: string;
  sources: Source[];
  reports: ReportRecord[];
  runs: Run[];
  warnings: string[];
}
export type PageId =
  | "overview"
  | "research"
  | "sources"
  | "papers"
  | "reports"
  | "messages"
  | "models"
  | "runs"
  | "versions"
  | "settings";
export const categoryLabels: Record<Category, string> = {
  tech: "技术动态",
  finance: "财经",
  politics: "时政",
};
export function safeUrl(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
