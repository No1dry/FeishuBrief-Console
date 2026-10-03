import { test, expect } from "@playwright/test";
import { connect, mockGitHub, open, TEST_TOKEN } from "./github-fixture";
import { GitHubClient } from "../src/github";
import { fixtureReport } from "./github-fixture";
import type { DailyReport, ReportRecord } from "../src/types";

test("notification dispatch pins an immutable report and rejects legacy reports", async () => {
  const requests: unknown[] = [];
  const client = new GitHubClient(TEST_TOKEN, async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  });
  const brief = fixtureReport.tech_briefs[0];
  const report = { ...structuredClone(fixtureReport), tech_briefs: [brief, brief, brief], finance_briefs: [brief, brief, brief], politics_briefs: [brief, brief], keywords: ["a", "b", "c", "d", "e"], editor_note: "fixture note" };
  report.quality_review = { status: "passed", reviewer: "fixture", score: 90, blockingIssues: [], suggestions: [], summary: "fixture", attempt: 1 };
  const record = { date: "2026-09-14", report, articles: [], url: "https://example.com/report" };
  await client.notify(record, { feishu: true, pushplus: false });
  expect(requests).toEqual([{ ref: "main", inputs: { report_date: record.date, report_revision: "a".repeat(64), chat_id: "", send_feishu: true, send_pushplus: false } }]);
  delete report.edition;
  await expect(client.notify(record, { feishu: true, pushplus: false })).rejects.toThrow("缺少不可变版本");
  expect(requests).toHaveLength(1);
});

test("notification accepts published review projections and rejects invalid or unapproved reviews", async () => {
  const requests: unknown[] = [];
  const client = new GitHubClient(TEST_TOKEN, async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  });
  const brief = fixtureReport.tech_briefs[0];
  const report: DailyReport = {
    ...structuredClone(fixtureReport), documentType: "public-report-projection",
    tech_briefs: [brief, brief, brief], finance_briefs: [brief, brief, brief], politics_briefs: [brief, brief],
    keywords: ["a", "b", "c", "d", "e"], editor_note: "Synthetic fixture note",
    quality_review: { status: "passed", score: 90, attempt: 1, maxAttempts: 4, exhausted: false },
  };
  const record: ReportRecord = { date: "2026-09-14", report, articles: [], url: "https://example.com/report" };
  await client.notify(record, { feishu: true, pushplus: false });
  const bestEffort = { status: "failed", score: 78, attempt: 1, maxAttempts: 4, exhausted: true, publicationDecision: "best_effort" } as const;
  report.quality_review = { ...bestEffort };
  await client.notify(record, { feishu: false, pushplus: true });
  expect(report.quality_review.status).toBe("failed");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({ ref: "main", inputs: {
    report_date: record.date, report_revision: "a".repeat(64), chat_id: "", send_feishu: false, send_pushplus: true,
  } });

  const invalidReviews = [
    { status: "failed", score: 78, attempt: 1, blockingIssues: [] },
    { status: "passed", score: 90, attempt: 1, blockingIssues: ["Synthetic unresolved blocker"] },
    { ...bestEffort, publicationDecision: undefined },
    { ...bestEffort, exhausted: false },
    { ...bestEffort, exhausted: "true" },
    { ...bestEffort, maxAttempts: undefined },
    { ...bestEffort, maxAttempts: 7 },
    { ...bestEffort, attempt: 5 },
    { ...bestEffort, attempt: 0 },
    { ...bestEffort, attempt: 1.5 },
    { ...bestEffort, score: "78" },
    { ...bestEffort, score: Number.NaN },
    { ...bestEffort, score: 101 },
    { ...bestEffort, score: -1 },
    { ...bestEffort, status: "unknown" },
    { ...bestEffort, blockingIssues: "not-an-array" },
    { ...bestEffort, blockingIssues: [null] },
    { status: "passed", score: 79, attempt: 1 },
    { status: "passed", score: 90, attempt: 1, publicationDecision: "best_effort" },
  ];
  for (const review of invalidReviews) {
    report.quality_review = review as unknown as DailyReport["quality_review"];
    await expect(client.notify(record, { feishu: true, pushplus: false })).rejects.toThrow("不能推送");
  }
  delete report.documentType;
  report.quality_review = { status: "passed", score: 90, attempt: 1 };
  await expect(client.notify(record, { feishu: true, pushplus: false })).rejects.toThrow("不能推送");
  expect(requests).toHaveLength(2);
});

test("a connection is ephemeral and never persists the token", async ({
  page,
}) => {
  await mockGitHub(page);
  await open(page, "/");
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(storage).not.toContain(TEST_TOKEN);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "连接 GitHub 工作区" }),
  ).toBeVisible();
});
test("commit only the fixed backend configuration path after review", async ({
  page,
}) => {
  const server = await mockGitHub(page);
  await open(page, "/#/research");
  await page.getByRole("slider", { name: "World Model 关注权重" }).fill("1.7");
  await page.getByRole("button", { name: "提交配置", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("研究主题 / world-model / 权重", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(server.mutations).toHaveLength(1);
  expect(server.mutations[0].path).toBe(
    "/repos/No1dry/FeishuBrief/contents/config/editorial-profile.json",
  );
  expect(server.mutations[0].body.branch).toBe("main");
  expect(
    server.config.researchTopics.find((t) => t.id === "world-model")?.weight,
  ).toBe(1.7);
  expect(server.mutations[0].body).not.toHaveProperty("token");
});
test("stale configuration cannot overwrite the remote file", async ({
  page,
}) => {
  const server = await mockGitHub(page);
  await open(page, "/#/research");
  await page.getByRole("slider", { name: "World Model 关注权重" }).fill("1.7");
  server.sha = "changed-by-another-client";
  await page.getByRole("button", { name: "提交配置", exact: true }).click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "远程配置已变化",
  );
  expect(server.mutations).toHaveLength(0);
});
test("generation dispatch always disables notifications", async ({ page }) => {
  const server = await mockGitHub(page);
  await open(page, "/#/runs");
  await page.getByRole("button", { name: "生成日报", exact: true }).click();
  await page.getByRole("button", { name: "确认生成", exact: true }).click();
  await expect(page.getByRole("heading", { name: "任务已提交" })).toBeVisible();
  expect(server.mutations).toEqual([
    {
      path: "/repos/No1dry/FeishuBrief/actions/workflows/daily.yml/dispatches",
      method: "POST",
      body: { ref: "main", inputs: { send_notifications: false } },
    },
  ]);
});
test("incomplete archived reports cannot be notified", async ({ page }) => {
  const server = await mockGitHub(page);
  await open(page, "/#/runs");
  await page.getByRole("button", { name: "推送已有日报", exact: true }).click();
  await page.getByLabel("飞书：仓库预设群").check();
  await expect(
    page.getByRole("button", { name: "确认推送", exact: true }),
  ).toBeDisabled();
  expect(server.mutations).toHaveLength(0);
});
test("read-only repository access keeps mutations disabled", async ({
  page,
}) => {
  const server = await mockGitHub(page);
  server.readOnly = true;
  await open(page, "/#/runs");
  await expect(
    page.getByRole("button", { name: "提交配置", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "生成日报", exact: true }),
  ).toBeDisabled();
});
test("invalid authentication returns an error without private data", async ({
  page,
}) => {
  const server = await mockGitHub(page);
  server.unauthorized = true;
  await page.goto("/");
  await page.getByLabel("GitHub 访问令牌", { exact: true }).fill(TEST_TOKEN);
  await page.getByRole("button", { name: "连接工作区", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("令牌无效");
  await expect(page.locator(".metric-strip")).toHaveCount(0);
});
