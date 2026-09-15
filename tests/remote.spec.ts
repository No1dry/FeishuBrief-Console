import { test, expect } from "@playwright/test";
import { connect, mockGitHub, open, TEST_TOKEN } from "./github-fixture";

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
