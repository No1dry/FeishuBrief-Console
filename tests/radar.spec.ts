import { test, expect } from "@playwright/test";
import { mockGitHub, open } from "./github-fixture";
import { mockRadar, mockMember } from "./radar-fixture";

test("admin radar deduplicates overlaps, pins state and previews without mutation", async ({ page }) => {
  const github = await mockGitHub(page);
  const state = await mockRadar(page);
  await open(page, "/#/radar");
  await expect(page.locator(".radar-card")).toHaveCount(3);
  expect(state.refs.every(ref => ref === "e".repeat(40))).toBe(true);
  await page.getByRole("button", { name: "预览成员偏好", exact: true }).click();
  await page.getByLabel("主方向", { exact: true }).selectOption("vla");
  await page.getByLabel("次方向 Robotics", { exact: true }).check();
  await page.getByLabel("次方向 Reinforcement Learning", { exact: true }).check();
  await expect(page.locator(".radar-card")).toHaveCount(1);
  await page.getByLabel("个人排除词", { exact: true }).fill("robot");
  await expect(page.getByText("暂无符合条件的更新", { exact: true })).toBeVisible();
  expect(github.mutations).toHaveLength(0);
});

test("revoked items disappear and revocation read failure fails closed", async ({ page }) => {
  await mockGitHub(page); const state = await mockRadar(page);
  state.revoked = ["1".repeat(64)];
  await open(page, "/#/radar");
  await expect(page.locator(".radar-card")).toHaveCount(2);
  state.failRevocations = true;
  await page.getByRole("button", { name: "刷新雷达" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".radar-card")).toHaveCount(0);
});

test("admin edits boundaries and deletes a theme without changing old reports", async ({ page }) => {
  const github = await mockGitHub(page);
  await open(page, "/#/research");
  await page.locator(".topic-identity").getByRole("button", { name: "Robotics", exact: true }).click();
  await page.getByLabel("收录范围", { exact: true }).fill("机器人操作与触觉控制");
  await page.getByRole("button", { name: "保存主题", exact: true }).click();
  await expect(page.getByText("机器人操作与触觉控制", { exact: true })).toBeVisible();
  await page.locator(".topic-identity").getByRole("button", { name: "Robotics", exact: true }).click();
  await page.getByRole("button", { name: "删除主题", exact: true }).click();
  await page.getByRole("button", { name: "确认删除主题", exact: true }).click();
  await expect(page.locator(".topic-identity").getByRole("button", { name: "Robotics", exact: true })).toHaveCount(0);
  expect(github.mutations, "editing a draft never sends or publishes implicitly").toHaveLength(0);
});

test("member entry never loads private GitHub providers and persists only through own API", async ({ page }) => {
  const state = await mockMember(page);
  const requests: string[] = []; page.on("request", r => requests.push(r.url()));
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "我的主题雷达" })).toBeVisible();
  await expect(page.locator(".radar-card")).toHaveCount(1);
  await page.getByLabel("个人重点关键词", { exact: true }).fill("robot");
  await page.getByRole("button", { name: "保存我的偏好" }).click();
  await expect(page.getByRole("status")).toContainText("偏好已保存");
  expect(state.saveCalls).toHaveLength(1);
  expect(state.saveCalls[0]).toMatchObject({ body: { baseRevision: "subscription-1", preferences: { keywords: ["robot"] } }, csrf: "synthetic-csrf" });
  expect(requests.some(r => /api.github.com|\/src\/(github|remote|workspace)\./.test(r))).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("robot");
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.locator(".radar-card")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("已退出");
});

test("member conflict keeps unsaved preference and expired sessions clear data", async ({ page }) => {
  const state = await mockMember(page);
  await page.goto("/app");
  await page.getByLabel("个人重点关键词", { exact: true }).fill("robot");
  state.conflict = true;
  await page.getByRole("button", { name: "保存我的偏好" }).click();
  await expect(page.getByRole("status")).toContainText("其他页面更新");
  await expect(page.getByLabel("个人重点关键词", { exact: true })).toHaveValue("robot");
  state.active = false;
  await page.getByRole("button", { name: "保存我的偏好" }).click();
  await expect(page.locator(".radar-card")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("会话已失效");
});

test("member service unavailable does not fall back to PAT or local data", async ({ page }) => {
  await page.route("**/api/member/**", route => route.fulfill({ status: 501, contentType: "application/json", body: "{}" }));
  await page.goto("/app");
  await expect(page.getByRole("status")).toHaveText("成员服务尚未开放。");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.locator(".radar-card")).toHaveCount(0);
});

test("static hash member entry stays isolated when entering and leaving", async ({ page }) => {
  await mockGitHub(page); await mockMember(page);
  await page.goto("/#/app");
  await expect(page.locator(".radar-card")).toHaveCount(1);
  await page.evaluate(() => { location.hash = "#/overview"; });
  await expect(page.locator(".radar-card")).toHaveCount(0);
  await page.evaluate(() => { location.hash = "#/app"; });
  await expect(page.locator(".radar-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "我的主题雷达" })).toBeVisible();
});

test("member view fits mobile and clears on account revalidation", async ({ page }) => {
  const state = await mockMember(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/app");
  await expect(page.locator(".radar-card")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/member-radar-mobile.png", fullPage: true });
  state.user = "Member B";
  state.preferences = { ...state.preferences, primaryTopicId: "world-model", secondaryTopicIds: [] };
  await page.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(page.getByText(/Member B/)).toBeVisible();
  await expect(page.locator(".radar-card")).toHaveCount(1);
  await expect(page.locator(".radar-card")).toContainText("world model");
  await expect(page.locator(".radar-card")).not.toContainText("VLA");
});
