import { test, expect } from "@playwright/test";
import { mockNotifications, syntheticBinding, syntheticDelivery } from "./member-notifications-fixture";
import { mockMemberManagement } from "./member-management-fixture";

test("configured capabilities gate binding and send without inventing enabled services", async ({ page }) => {
  const state = await mockNotifications(page); state.configured = false; state.enabled = false; state.scheduleSystem = false;
  await page.goto("/app/notifications");
  await expect(page.getByRole("button", { name: "开始飞书绑定", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "开始微信绑定", exact: true })).toBeDisabled();
  await expect(page.getByLabel("开启个人定时投递", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "发送此固定版本", exact: true })).toBeDisabled();
  expect(state.requests.filter(row => row.method !== "GET")).toHaveLength(0);
});

test("Feishu binding requires verified private-message proof and a separate browser confirmation", async ({ page }) => {
  const state = await mockNotifications(page);
  await page.goto("/app/notifications");
  await page.getByRole("button", { name: "开始飞书绑定", exact: true }).click();
  await expect(page.getByText("FB-123456789012345678901234", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认绑定此飞书账号", exact: true })).toHaveCount(0);
  state.challenge!.status = "awaiting-confirmation";
  await page.getByRole("button", { name: "检查绑定进度", exact: true }).click();
  expect(state.binds).toHaveLength(0);
  await page.getByRole("button", { name: "确认绑定此飞书账号", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已验证并绑定");
  expect(state.requests.find(row => row.path.endsWith("/confirm"))).toMatchObject({ body: {}, csrf: "synthetic-csrf" });
  expect(state.requests.some(row => row.path === "notifications/deliveries")).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toMatch(/FB-|Synthetic Verified|synthetic-feishu/);
});

test("WeChat uses a same-origin QR and receipt OTP without entering a platform token", async ({ page }) => {
  const state = await mockNotifications(page);
  await page.goto("/app/notifications");
  await page.getByRole("button", { name: "开始微信绑定", exact: true }).click();
  await expect(page.getByAltText("本次微信好友绑定二维码")).toHaveAttribute("src", "/api/member/notifications/challenges/synthetic-wechat-challenge/qr");
  state.challenge!.status = "awaiting-code"; state.challenge!.displayName = "Synthetic WeChat Reader";
  await page.getByRole("button", { name: "检查绑定进度", exact: true }).click();
  await page.getByLabel("微信绑定验证码", { exact: true }).fill("12345678"); state.bindingFails = true;
  await page.getByRole("button", { name: "验证并绑定微信", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("绑定验证码无效"); expect(state.binds).toHaveLength(0);
  state.bindingFails = false; await page.getByRole("button", { name: "验证并绑定微信", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已验证并绑定");
  expect(state.requests.filter(row => row.path.endsWith("/confirm")).map(row => row.body)).toEqual([{ code: "12345678" }, { code: "12345678" }]);
  await expect(page.getByLabel(/token|open_id|chat_id/i)).toHaveCount(0);
});

test("personal delivery has explicit confirmation and retains its request id after uncertainty", async ({ page }) => {
  const state = await mockNotifications(page); state.binds.push(syntheticBinding()); state.sendFailsOnce = true;
  await page.goto("/app/notifications");
  await page.getByRole("button", { name: "发送此固定版本", exact: true }).click();
  expect(state.requests.some(row => row.path === "notifications/deliveries")).toBe(false);
  await page.getByRole("button", { name: "确认发送个人简报", exact: true }).click();
  await page.getByRole("button", { name: "重试同一发送请求", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("没有新建重复任务");
  const writes = state.requests.filter(row => row.path === "notifications/deliveries"); expect(writes).toHaveLength(2); expect(writes[0].body).toEqual(writes[1].body);
  expect(writes[0]).toMatchObject({ csrf: "synthetic-csrf", body: { confirmSend: true, editionId: "a".repeat(64), channel: "feishu" } }); expect(state.deliveries).toHaveLength(1);
});

test("schedule conflicts preserve drafts and unbind confirms before cancelling pending work", async ({ page }) => {
  const state = await mockNotifications(page); state.binds.push(syntheticBinding()); state.deliveries.push(syntheticDelivery());
  await page.goto("/app/notifications");
  await page.getByLabel("开启个人定时投递", { exact: true }).check(); await page.getByLabel("投递时间（北京时间）", { exact: true }).fill("08:45");
  state.schedule.revision = "another-session";
  await page.getByRole("button", { name: "保存定时设置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保留");
  await page.getByRole("button", { name: "读取最新设置（保留草稿）", exact: true }).click();
  await expect(page.getByLabel("投递时间（北京时间）", { exact: true })).toHaveValue("08:45");
  await page.getByRole("button", { name: "保存定时设置", exact: true }).click();
  expect(state.schedule.enabled).toBe(true); expect(state.schedule.localTime).toBe("08:45");
  await page.getByRole("button", { name: "解绑飞书", exact: true }).click(); expect(state.binds[0].status).toBe("active");
  await page.getByRole("button", { name: "确认解绑", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已解绑"); await expect(page.getByText("已取消", { exact: true })).toBeVisible();
  expect(state.binds[0].status).toBe("unbound"); expect(state.deliveries[0].status).toBe("cancelled");
});

test("unknown admin delivery requires recorded review then duplicate-risk confirmation and stable resend", async ({ page }) => {
  const state = await mockNotifications(page); state.owner = true; state.deliveries.push(syntheticDelivery("unknown")); state.resendFailsOnce = true;
  await page.goto("/app/deliveries");
  await expect(page.getByRole("button", { name: "补发固定版本", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "记录人工核对", exact: true }).click();
  await page.getByLabel("核对原因", { exact: true }).fill("已检查平台记录仍无法确认");
  await expect(page.getByRole("button", { name: "保存人工核对记录", exact: true })).toBeDisabled();
  await page.getByLabel("我已在平台核对，仍无法确认结果；知悉后续补发可能重复。", { exact: true }).check();
  await page.getByRole("button", { name: "保存人工核对记录", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("没有自动补发"); expect(state.deliveries[0].status).toBe("unknown");
  await page.getByRole("button", { name: "补发固定版本", exact: true }).click();
  await page.getByLabel("补发原因", { exact: true }).fill("成员确认需要重发固定版本");
  await expect(page.getByRole("button", { name: "确认补发此固定版本", exact: true })).toBeDisabled();
  await page.getByLabel("我已核对原记录，知悉对方可能已经收到；确认按原固定版本与原接收账号补发。", { exact: true }).check();
  await page.getByRole("button", { name: "确认补发此固定版本", exact: true }).click();
  await expect(page.getByLabel("补发原因", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "重试同一补发请求", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("没有新建重复任务");
  const writes = state.requests.filter(row => row.path.endsWith("/resend")); expect(writes).toHaveLength(2); expect(writes[0].body).toEqual(writes[1].body); expect(writes[0].body.confirmDuplicate).toBe(true);
});

test("notification state is cleared after session expiry and viewers cannot write", async ({ page }) => {
  const state = await mockNotifications(page); state.personal.viewer = true; state.binds.push(syntheticBinding());
  await page.goto("/app/notifications");
  await expect(page.getByRole("button", { name: "解绑飞书", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存定时设置", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "发送此固定版本", exact: true })).toBeDisabled();
  state.personal.active = false; await page.getByRole("button", { name: "刷新通知状态", exact: true }).click();
  await expect(page.getByText("Synthetic Verified Reader", { exact: false })).toHaveCount(0);
  expect(state.requests.filter(row => row.method !== "GET")).toHaveLength(0);
});

test("notification page supports station-only schedules and mobile screens", async ({ page }) => {
  const state = await mockNotifications(page); state.personal.settings.channel = "in-app";
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto("/app/notifications");
  await expect(page.getByLabel("开启个人定时投递", { exact: true })).toBeEnabled();
  await page.getByLabel("开启个人定时投递", { exact: true }).check(); await page.getByRole("button", { name: "保存定时设置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("定时投递设置已保存");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/member-notifications-mobile.png", fullPage: true });
  expect(state.requests.some(row => row.path === "notifications/deliveries")).toBe(false);
});

test("operations accepts actual queue and scheduler summaries", async ({ page }) => {
  const state = await mockMemberManagement(page); state.phase6 = true;
  await page.goto("/app/operations");
  await expect(page.getByText("个人发送：已启用 · 定时调度：已启用", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "管理个人投递", exact: true })).toBeVisible();
  await expect(page.getByText("等待下一轮", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("session expiry during a confirmed unbind follow-up clears all notification data", async ({ page }) => {
  const state = await mockNotifications(page); state.binds.push(syntheticBinding()); state.expireAfterUnbind = true;
  await page.goto("/app/notifications");
  await page.getByRole("button", { name: "解绑飞书", exact: true }).click(); await page.getByRole("button", { name: "确认解绑", exact: true }).click();
  await expect(page.getByText("会话已失效，请重新登录。", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic Verified Reader", { exact: false })).toHaveCount(0);
  await expect(page.getByLabel("我的投递历史", { exact: true })).toHaveCount(0);
  expect(state.requests.filter(row => row.method === "DELETE")).toHaveLength(1);
});

test("an unresolved sibling blocks another resend of the original fixed edition", async ({ page }) => {
  const state = await mockNotifications(page); state.owner = true;
  state.deliveries.push(syntheticDelivery("accepted"), { ...syntheticDelivery("unknown"), intentId: "synthetic-resend-2", sourceIntentId: "synthetic-delivery-1" });
  await page.goto("/app/deliveries");
  for (const button of await page.getByRole("button", { name: "补发固定版本", exact: true }).all()) await expect(button).toBeDisabled();
  await expect(page.getByText("同一版本与渠道已有待处理任务，请先处理该任务，再决定是否补发。", { exact: true })).toBeVisible();
  expect(state.requests.filter(row => row.method !== "GET")).toHaveLength(0);
});
