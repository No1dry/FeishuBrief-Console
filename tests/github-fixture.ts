import { expect, type Page } from "@playwright/test";
import { defaultConfig, type Config } from "../src/policy";
import type { Article, DailyReport, Source } from "../src/types";

export const TEST_TOKEN = "console-test-access-token-only";
export const fixtureSources: Source[] = [
  {
    id: "openai-news",
    name: "OpenAI News",
    type: "rss",
    category: "tech",
    url: "https://example.com/news",
    enabled: true,
    locales: ["zh"],
  },
  {
    id: "arxiv-cs-ai",
    name: "arXiv AI",
    type: "rss",
    category: "tech",
    url: "https://example.com/papers",
    enabled: true,
  },
  {
    id: "huggingface-papers",
    name: "Hugging Face Papers",
    type: "api",
    category: "tech",
    url: "https://example.com/hf",
    enabled: true,
  },
  {
    id: "example-finance",
    name: "Test Finance",
    type: "rss",
    category: "finance",
    url: "https://example.com/finance",
    enabled: true,
  },
];
export const fixtureArticles: Article[] = [
  {
    sourceId: "openai-news",
    source: "OpenAI News",
    title: "Fixture: world model research",
    url: "https://example.com/wm",
    category: "tech",
    summary: "测试归档：世界模型研究，供自动化测试使用。",
  },
  {
    sourceId: "arxiv-cs-ai",
    source: "arXiv",
    title: "Fixture: world models benchmark",
    url: "https://arxiv.org/abs/2609.99991",
    category: "tech",
    excerpt:
      "We propose world models with open-source code and benchmark evaluation. ".repeat(
        4,
      ),
    summary: "测试论文：具有实验和开源代码的世界模型。",
  },
  {
    sourceId: "huggingface-papers",
    source: "Hugging Face Papers",
    title: "Fixture: VLA benchmark",
    url: "https://huggingface.co/papers/2609.99992",
    category: "tech",
    excerpt:
      "We propose vision-language-action models and an open-source evaluation benchmark. ".repeat(
        4,
      ),
    summary: "测试论文：视觉语言动作模型。",
  },
];
const brief = {
  title: "Fixture report",
  summary: "测试归档摘要，不是真实新闻。",
  url: "https://example.com/brief",
  source: "Fixture",
  importance: 5,
};
export const fixtureReport: DailyReport = {
  hero_headline: "测试日报",
  daily_overview: "这是一份用于工作台自动化测试的归档。",
  tech_briefs: [brief],
  finance_briefs: [],
  politics_briefs: [],
  keywords: [],
  editor_note: "",
};
export async function mockGitHub(page: Page) {
  const state = {
    config: structuredClone(defaultConfig),
    sha: "initial-config-sha",
    readOnly: false,
    unauthorized: false,
    report: structuredClone(fixtureReport),
    mutations: [] as {
      path: string;
      method: string;
      body: Record<string, unknown>;
    }[],
  };
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    const file = (value: unknown, sha = "fixture-blob") =>
      json({
        content: Buffer.from(JSON.stringify(value)).toString("base64"),
        encoding: "base64",
        sha,
      });
    if (state.unauthorized) return json({ message: "Bad credentials" }, 401);
    if (request.method() !== "GET") {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.mutations.push({ path, method: request.method(), body });
      if (state.readOnly) return json({ message: "Forbidden" }, 403);
      if (
        request.method() === "PUT" &&
        path.endsWith("/contents/config/editorial-profile.json")
      ) {
        if (body.sha !== state.sha) return json({ message: "Conflict" }, 409);
        state.config = JSON.parse(
          Buffer.from(body.content as string, "base64").toString(),
        ) as Config;
        state.sha = "updated-config-sha";
        return json(
          {
            content: { sha: state.sha },
            commit: {
              sha: "a".repeat(40),
              html_url: `https://github.com/No1dry/FeishuBrief/commit/${"a".repeat(40)}`,
            },
          },
          201,
        );
      }
      if (path.endsWith("/dispatches")) return route.fulfill({ status: 204 });
      return json({ message: "Unexpected mutation" }, 400);
    }
    if (path === "/user") return json({ login: "No1dry" });
    if (path === "/repos/No1dry/FeishuBrief")
      return json({ permissions: { push: !state.readOnly } });
    if (path.endsWith("/contents/config/editorial-profile.json"))
      return file(state.config, state.sha);
    if (path.endsWith("/contents/config/console-capabilities.json"))
      return file({
        version: 1,
        supportedConfigPaths: [
          "name",
          "researchTopics",
          "papers",
          "sourceOverrides",
          "daily",
          "notifications",
          "models.editorTimeout",
        ],
        workflows: { generate: "daily.yml", notify: "push-feishu-once.yml" },
      });
    if (path.endsWith("/contents/sources.config.json"))
      return file(fixtureSources);
    if (path.endsWith("/contents/sources.candidates.json")) return file([]);
    if (path.endsWith("/actions/runs"))
      return json({
        workflow_runs: [
          {
            id: 100,
            name: "Daily Brief",
            status: "completed",
            conclusion: "success",
            created_at: "2026-09-14T03:20:00Z",
            updated_at: "2026-09-14T03:40:00Z",
            event: "schedule",
            head_sha: "b".repeat(40),
            html_url: "https://github.com/No1dry/FeishuBrief/actions/runs/100",
          },
        ],
      });
    if (path === "/repos/No1dry/daily-brief-site/contents")
      return json([{ name: "2026-09-14", type: "dir" }]);
    if (path.endsWith("/2026-09-14.json")) return file(state.report);
    if (path.endsWith("/2026-09-14-articles.json"))
      return file({ articles: fixtureArticles });
    if (path.endsWith("/commits")) return json([]);
    return json({ message: "Fixture resource missing" }, 404);
  });
  return state;
}
export async function connect(page: Page) {
  await expect(
    page.getByRole("heading", { name: "连接 GitHub 工作区" }),
  ).toBeVisible();
  await page.getByLabel("GitHub 访问令牌", { exact: true }).fill(TEST_TOKEN);
  await page.getByRole("button", { name: "连接工作区", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "连接 GitHub 工作区" }),
  ).toHaveCount(0);
}
export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toBeVisible();
  if (await page.getByRole("heading", { name: "连接 GitHub 工作区" }).count())
    await connect(page);
}
export async function reconnect(page: Page) {
  await page.reload();
  await connect(page);
}
