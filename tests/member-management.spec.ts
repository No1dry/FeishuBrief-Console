import { test, expect } from "@playwright/test";
import { mockMemberManagement } from "./member-management-fixture";

test("owner edits complete topic rules, preserves CAS conflicts and explicitly deletes", async ({ page }) => {
  const state = await mockMemberManagement(page);
  await page.goto("/app/topics");
  await page.getByRole("button", { name: /VLA.*vla/ }).click();
  await page.getByLabel("研究范围", { exact: true }).fill("Synthetic: grounded policy research, direct contributions only.");
  await page.getByLabel("正面例子", { exact: true }).fill("Synthetic: an evaluated VLA policy.");
  await page.getByLabel("反面例子", { exact: true }).fill("Synthetic: a generic mention of robots.");
  await page.getByLabel("相关性阈值", { exact: true }).fill("85");
  state.topicConflict = true;
  await page.getByRole("button", { name: "保存主题", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("当前草稿已保留");
  await expect(page.getByLabel("研究范围", { exact: true })).toHaveValue("Synthetic: grounded policy research, direct contributions only.");
  await expect(page.getByRole("button", { name: "保存主题", exact: true })).toBeDisabled();
  const write = state.requests.find(req => req.method === "PUT")!;
  expect(write.body.baseRevision).toBe("1".repeat(64));
  expect(write.body.profile).toMatchObject({ relevanceThreshold: 85, positiveExamples: ["Synthetic: an evaluated VLA policy."], negativeExamples: ["Synthetic: a generic mention of robots."] });
  expect(write.headers["x-csrf-token"]).toBe("synthetic-csrf");
  state.topicConflict = false;
  await page.getByRole("button", { name: "重新读取并放弃草稿" }).click();
  await page.getByRole("button", { name: /VLA.*vla/ }).click();
  await page.getByLabel("启用此主题").uncheck();
  await page.getByRole("button", { name: "保存主题", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("共享内容重新评估");
  await page.getByRole("button", { name: "删除主题", exact: true }).click();
  expect(state.requests.filter(req => req.method === "DELETE")).toHaveLength(0);
  await page.getByRole("button", { name: "确认删除主题", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("主题已删除");
});

test("topic owner can edit assigned topic only and ordinary member cannot request management", async ({ page }) => {
  const state = await mockMemberManagement(page); state.role = "topic_owner";
  await page.goto("/app/topics");
  await expect(page.getByRole("button", { name: "新增主题", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "可管理主题" }).getByRole("button")).toHaveCount(1);
  await page.getByRole("button", { name: /VLA.*vla/ }).click();
  await expect(page.getByLabel("主题 ID", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "成员管理", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "服务运行", exact: true })).toHaveCount(0);
  state.role = "member"; const count = state.requests.filter(req => req.path.startsWith("admin/")).length;
  await page.goto("/app/topics");
  await expect(page.getByRole("status")).toContainText("没有此页面的访问权限");
  expect(state.requests.filter(req => req.path.startsWith("admin/")).length).toBe(count);
});

test("new topic includes structured subtopics without inventing a hierarchy", async ({ page }) => {
  const state = await mockMemberManagement(page);
  await page.goto("/app/topics");
  await page.getByRole("button", { name: "新增主题", exact: true }).click();
  await page.getByLabel("主题 ID", { exact: true }).fill("synthetic-direction");
  await page.getByLabel("主题名称", { exact: true }).fill("Synthetic Direction");
  await page.getByLabel("主题关键词", { exact: true }).fill("synthetic keyword\nrelated keyword");
  await page.getByRole("button", { name: "添加子方向", exact: true }).click();
  await page.getByLabel("子方向 ID", { exact: true }).fill("synthetic-subtopic");
  await page.getByLabel("子方向名称", { exact: true }).fill("Synthetic Subtopic");
  await page.getByLabel("子方向关键词", { exact: true }).fill("subtopic keyword");
  await page.getByRole("button", { name: "保存主题", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("主题已保存");
  expect(state.requests.find(req => req.method === "PUT")!.body).toMatchObject({ baseRevision: "initial", profile: { id: "synthetic-direction", keywords: ["synthetic keyword", "related keyword"], subtopics: [{ id: "synthetic-subtopic", name: "Synthetic Subtopic", keywords: ["subtopic keyword"] }] } });
});

test("operations shows empty imports, actual audit, invitations and disabled Phase6 delivery", async ({ page }) => {
  await mockMemberManagement(page);
  await page.goto("/app/operations");
  await expect(page.getByText("暂无已验证的导入批次。导入共享内容后才会生成统计。")).toBeVisible();
  await expect(page.getByText("暂无个人发送记录。这里没有运行中的个人定时任务。")).toBeVisible();
  await expect(page.getByText("更新主题", { exact: true })).toBeVisible();
  await expect(page.getByText("invited@example.invalid", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "打开原运行中心" })).toHaveAttribute("href", "/admin#/runs");
  await expect(page.getByRole("link", { name: "查看群体报告" })).toHaveAttribute("href", "/admin#/reports");
});

test("owner selects topic grants, inspects invitation and disables member with expected revision", async ({ page }) => {
  const state = await mockMemberManagement(page);
  await page.goto("/app/members");
  await expect(page.getByRole("heading", { name: "最近邀请" })).toBeVisible();
  await page.getByLabel("邀请角色", { exact: true }).selectOption("topic_owner");
  await page.getByRole("group", { name: "选择负责方向", exact: true }).getByLabel("VLA", { exact: true }).check();
  await expect(page.locator(".member-invite").getByLabel("负责主题 ID", { exact: true })).toHaveValue("vla");
  const row = page.locator(".member-management-row").filter({ hasText: "member@example.invalid" });
  await row.getByRole("button", { name: "停用成员", exact: true }).click();
  await expect(row.getByText("已停用", { exact: true })).toBeVisible();
  expect(state.requests.find(req => req.path === "admin/members/synthetic-member")!.body).toEqual({ baseRevision: 1, status: "disabled" });
  await page.getByLabel("成员状态").selectOption("invited");
  await expect(page.locator(".member-management-row")).toHaveCount(1);
});

test("late operations response cannot refill a different screen", async ({ page }) => {
  const state = await mockMemberManagement(page);
  let release = () => {}; state.delayOperations = () => new Promise<void>(resolve => { release = resolve; });
  await page.goto("/app/operations");
  await expect(page.getByText("正在读取运营状态…")).toBeVisible();
  await page.getByRole("button", { name: "成员管理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "成员与邀请", exact: true })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: "共享内容批次", exact: true })).toHaveCount(0);
});

test("logout during member mutation cannot restore private management state", async ({ page }) => {
  const state = await mockMemberManagement(page);
  let release = () => {}; state.delayMemberUpdate = () => new Promise<void>(resolve => { release = resolve; });
  await page.goto("/app/members");
  const row = page.locator(".member-management-row").filter({ hasText: "member@example.invalid" });
  const started = page.waitForRequest(request => request.method() === "PUT" && request.url().endsWith("/admin/members/synthetic-member"));
  await row.getByRole("button", { name: "停用成员", exact: true }).click();
  await started;
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.getByRole("heading", { name: "登录组内 Console" })).toBeVisible();
  release();
  await expect(page.locator(".member-management-row")).toHaveCount(0);
  await expect(page.getByText("成员权限已更新，原有会话将重新验证。")).toHaveCount(0);
});

test("management remains usable at 375 and 320 pixels", async ({ page }) => {
  await mockMemberManagement(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/app/topics");
  await page.getByRole("button", { name: /VLA.*vla/ }).click();
  await expect(page.getByLabel("研究范围", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/member-topics-375.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/app/members");
  await expect(page.getByRole("heading", { name: "最近邀请" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/member-members-320.png", fullPage: true });
});
