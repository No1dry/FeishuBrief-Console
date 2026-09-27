import { test, expect } from "@playwright/test";
import { mockPersonal, syntheticEdition } from "./member-personal-fixture";

test("first subscription guides draft preview and saves without generation or sending", async ({ page }) => {
  const state = await mockPersonal(page);
  await page.goto("/app/subscription");
  await expect(page.getByRole("heading", { name: "建立第一份个人订阅" })).toBeVisible();
  await page.getByLabel("订阅重点关键词", { exact: true }).fill("robot, policy");
  await page.getByLabel("每份最多条数", { exact: true }).fill("12");
  await page.getByLabel("主方向比例（%）", { exact: true }).fill("70");
  await page.getByLabel("接收渠道意愿", { exact: true }).selectOption("wechat");
  await page.getByRole("button", { name: "预览当前草稿", exact: true }).click();
  await expect(page.getByRole("heading", { name: "当前草稿预览" })).toBeVisible();
  expect(state.requests.find(r => r.path === "preview")?.body.subscription).toMatchObject({ keywords: ["robot", "policy"], maxItems: 12, primaryShare: .7, channel: "wechat" });
  expect(state.requests.filter(r => r.method !== "GET").map(r => r.path)).toEqual(["preview"]);
  await page.getByRole("button", { name: "保存个人订阅", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("个人订阅已保存");
  expect(state.requests.filter(r => r.method !== "GET").map(r => r.path)).toEqual(["preview", "subscription"]);
  expect(state.requests.find(r => r.path === "subscription" && r.method === "PUT")?.csrf).toBe("synthetic-csrf");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/robot|policy/);
});

test("subscription conflict preserves draft and merges independent and shared field edits", async ({ page }) => {
  const state = await mockPersonal(page); state.saved = true; state.revision = "7".repeat(64);
  await page.goto("/app/subscription");
  await page.getByLabel("订阅重点关键词", { exact: true }).fill("robot");
  state.settings = { ...state.settings, keywords: ["planning"], maxItems: 14 }; state.revision = "8".repeat(64);
  await page.getByRole("button", { name: "保存个人订阅", exact: true }).click();
  await expect(page.getByRole("heading", { name: "订阅版本冲突" })).toBeVisible();
  await expect(page.getByLabel("订阅重点关键词", { exact: true })).toHaveValue("robot");
  await expect(page.getByRole("button", { name: "保存个人订阅", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "读取最新版本（保留草稿）", exact: true }).click();
  await page.getByLabel("合并重点关键词", { exact: true }).selectOption("mine");
  await page.getByRole("button", { name: "确认合并并继续编辑", exact: true }).click();
  await expect(page.getByLabel("每份最多条数", { exact: true })).toHaveValue("14");
  await expect(page.getByLabel("订阅重点关键词", { exact: true })).toHaveValue("robot");
  await page.getByRole("button", { name: "保存个人订阅", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("个人订阅已保存");
  const writes = state.requests.filter(r => r.path === "subscription" && r.method === "PUT");
  expect(writes).toHaveLength(2); expect(writes[1].body).toMatchObject({ baseRevision: "8".repeat(64), subscription: { keywords: ["robot"], maxItems: 14 } });
});

test("brief creation requires confirmation and retries the same uncertain request", async ({ page }) => {
  const state = await mockPersonal(page); state.saved = true; state.revision = "7".repeat(64); state.generationFailsOnce = true;
  await page.goto("/app/briefs");
  await page.getByRole("button", { name: "预览本次简报", exact: true }).click();
  await expect(page.getByText("入选原因：", { exact: false })).toBeVisible();
  expect(state.requests.some(r => r.path === "editions" && r.method === "POST")).toBe(false);
  await page.getByRole("button", { name: "生成站内简报", exact: true }).click();
  expect(state.requests.some(r => r.path === "editions" && r.method === "POST")).toBe(false);
  await page.getByRole("button", { name: "确认生成站内版本", exact: true }).click();
  await expect(page.getByRole("button", { name: "重试同一生成请求", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重试同一生成请求", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/briefs/${"a".repeat(64)}$`));
  await expect(page.getByText("固定站内版本", { exact: true })).toBeVisible();
  const creates = state.requests.filter(r => r.path === "editions" && r.method === "POST");
  expect(creates).toHaveLength(2); expect(creates[0].body).toEqual(creates[1].body); expect(state.editions).toHaveLength(1);
});

test("private edition link shows no stale content after withdrawal", async ({ page }) => {
  const state = await mockPersonal(page); state.saved = true; state.revision = "7".repeat(64); state.editions.push(syntheticEdition()); state.unavailableEdition = true;
  await page.goto(`/app/briefs/${"a".repeat(64)}`);
  await expect(page.getByRole("status")).toContainText("已撤回内容或权限变化");
  await expect(page.locator(".member-personal-card")).toHaveCount(0);
});

test("confirmed creation is not treated as uncertain when history or feedback cannot refresh", async ({ page }) => {
  const state = await mockPersonal(page); state.saved = true; state.revision = "7".repeat(64); state.feedbackUnavailable = true; state.historyFailsAfterCreate = true;
  await page.goto("/app/briefs");
  await page.getByRole("button", { name: "生成站内简报", exact: true }).click();
  await page.getByRole("button", { name: "确认生成站内版本", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/briefs/${"a".repeat(64)}$`));
  await expect(page.getByText("固定站内版本", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重试同一生成请求", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "收藏", exact: true })).toBeDisabled();
  expect(state.requests.filter(r => r.path === "editions" && r.method === "POST")).toHaveLength(1);
});

test("library feedback supports saved history and retracts all active records of a kind", async ({ page }) => {
  const state = await mockPersonal(page);
  state.feedback.set("fixture:0", [{ feedbackId: "00000000-0000-4000-8000-000000000081", kind: "saved", occurredAt: "2026-09-27T01:00:00Z" }, { feedbackId: "00000000-0000-4000-8000-000000000082", kind: "saved", occurredAt: "2026-09-27T01:01:00Z" }]);
  await page.goto("/app/saved");
  await expect(page.locator(".member-personal-card")).toHaveCount(1);
  await page.getByRole("button", { name: "取消收藏", exact: true }).click();
  await expect(page.locator(".member-personal-card")).toHaveCount(0);
  expect(state.requests.filter(r => r.path === "feedback" && r.method === "POST").map(r => r.body.kind)).toEqual(["retract", "retract"]);
  await page.getByRole("button", { name: "浏览内容库", exact: true }).click();
  await page.getByLabel("搜索内容", { exact: true }).fill("world model");
  await expect(page.locator(".member-personal-card")).toHaveCount(1);
  await page.getByRole("button", { name: "收藏", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消收藏", exact: true })).toBeVisible();
  state.currentAvailable = false;
  await page.getByRole("button", { name: "刷新内容", exact: true }).click();
  await expect(page.getByText("历史收藏", { exact: true })).toBeVisible();
});

test("viewer cannot mutate preferences, generate editions, or change feedback", async ({ page }) => {
  const state = await mockPersonal(page); state.viewer = true; state.saved = true; state.revision = "7".repeat(64);
  await page.goto("/app/subscription");
  await expect(page.getByLabel("订阅重点关键词", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存个人订阅", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "我的简报", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "生成站内简报", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "内容库", exact: true }).click();
  await expect(page.getByRole("button", { name: "收藏", exact: true }).first()).toBeDisabled();
  expect(state.requests.filter(r => r.method !== "GET")).toHaveLength(0);
});

for (const width of [320, 375]) test(`personal subscription, brief, and library fit ${width}px`, async ({ page }) => {
  const state = await mockPersonal(page); state.saved = true; state.revision = "7".repeat(64); state.editions.push(syntheticEdition());
  await page.setViewportSize({ width, height: 900 });
  for (const route of ["subscription", "briefs", "library", "saved"]) {
    await page.goto(`/app/${route}`);
    await expect(page.getByRole("navigation", { name: "成员工作台" })).toBeVisible();
    await expect(page.locator(".member-personal")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
