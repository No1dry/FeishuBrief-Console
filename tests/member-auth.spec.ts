import { test, expect, type Page } from "@playwright/test";
import { fixtureRadar } from "./radar-fixture";

// Synthetic users only. All member requests are intercepted; no email is sent.
async function mockAuth(page: Page) {
  const state = {
    active: false, role: "member", contentAvailable: true, verifyFails: false, conflict: false, logoutFails: false,
    requests: [] as { path: string; body: any; headers: Record<string, string> }[],
    members: [
      { userId: "synthetic-owner", email: "owner@example.invalid", displayName: "Synthetic Owner", role: "lab_owner", ownedTopicIds: [], readTopicIds: [], status: "active", revision: 1 },
      { userId: "synthetic-member", email: "member@example.invalid", displayName: "Synthetic Member", role: "member", ownedTopicIds: [], readTopicIds: [], status: "active", revision: 1 },
    ],
  };
  const session = () => ({ userId: "synthetic-owner", displayName: "Synthetic Owner", csrfToken: "synthetic-csrf", preferencesEnabled: true, role: state.role, ownedTopicIds: [], readTopicIds: [] });
  await page.route("**/api/member/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace("/api/member/", "");
    const body = req.postData() ? req.postDataJSON() : undefined;
    state.requests.push({ path, body, headers: req.headers() });
    const reply = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "auth/request-code") return reply({ challengeId: "synthetic-challenge" });
    if (path === "auth/verify-code") { if (state.verifyFails) return reply({}, 401); state.active = true; return reply(session()); }
    if (!state.active) return reply({}, 401);
    if (path === "session") return reply(session());
    if (path === "logout") { if (state.logoutFails) return reply({}, 503); state.active = false; return route.fulfill({ status: 204 }); }
    if (path === "radar") return state.contentAvailable ? reply(fixtureRadar()) : reply({}, 503);
    if (path === "preferences") return reply({ revision: "subscription-1", preferences: { primaryTopicId: "vla", secondaryTopicIds: [], keywords: [], excludeKeywords: [], subtopicIds: {}, codeOnly: false } });
    if (path === "admin/members") return reply({ members: state.members });
    if (path === "admin/invitations" && req.method() === "GET") return reply({ invitations: [] });
    if (path === "admin/topics") return reply({ revision: "a".repeat(64), profiles: [] });
    if (path === "admin/invitations") return reply({ invitation: { invitationId: "synthetic-invitation", email: body.email, expiresAt: Date.parse("2026-10-01T00:00:00Z"), status: "pending" } });
    if (path.startsWith("admin/members/")) {
      if (state.conflict) return reply({}, 409);
      const member = state.members.find(m => m.userId === path.split("/").at(-1))!;
      Object.assign(member, body, { revision: 2 }); return reply({ member });
    }
    return reply({}, 404);
  });
  return state;
}

test("invitation OTP login scrubs URL and keeps credentials in memory", async ({ page }) => {
  const state = await mockAuth(page);
  const requests: string[] = []; page.on("request", req => requests.push(req.url()));
  await page.goto("/app#invite=synthetic-private-invite");
  await expect(page.getByRole("heading", { name: "登录组内 Console" })).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByLabel("受邀邮箱", { exact: true }).fill("member@example.invalid");
  await page.getByRole("button", { name: "发送验证码", exact: true }).click();
  await page.getByLabel("邮箱验证码", { exact: true }).fill("12345678");
  await page.getByRole("button", { name: "验证并登录", exact: true }).click();
  await expect(page.locator(".radar-card")).toHaveCount(1);
  expect(state.requests.find(r => r.path === "auth/request-code")?.body).toEqual({ email: "member@example.invalid", invitationToken: "synthetic-private-invite" });
  expect(state.requests.find(r => r.path === "auth/request-code")?.headers["x-csrf-token"]).toBeUndefined();
  expect(state.requests.find(r => r.path === "auth/verify-code")?.body).toEqual({ challengeId: "synthetic-challenge", code: "12345678" });
  expect(requests.some(url => /api.github.com|\/src\/(github|remote|workspace)\./.test(url))).toBe(false);
  expect(await page.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }))).not.toMatch(/private-invite|12345678|member@example/);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.getByRole("heading", { name: "登录组内 Console" })).toBeVisible();
  await expect(page.getByText("已读取邀请，请使用邀请对应的邮箱激活账号。")).toHaveCount(0);
});

test("incorrect OTP stays signed out and can retry without exposing content", async ({ page }) => {
  const state = await mockAuth(page); state.verifyFails = true;
  await page.goto("/app");
  await page.getByLabel("受邀邮箱").fill("member@example.invalid");
  await page.getByRole("button", { name: "发送验证码", exact: true }).click();
  await page.getByLabel("邮箱验证码").fill("12345678");
  await page.getByRole("button", { name: "验证并登录", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("验证码无效或已过期");
  expect(state.requests.some(req => req.path === "radar")).toBe(false);
  await expect(page.locator(".radar-card")).toHaveCount(0);
  state.verifyFails = false;
  await page.getByRole("button", { name: "验证并登录", exact: true }).click();
  await expect(page.locator(".radar-card")).toHaveCount(1);
});

test("owner can invite and change member permissions when no radar is published", async ({ page }) => {
  const state = await mockAuth(page); state.active = true; state.role = "lab_owner"; state.contentAvailable = false;
  await page.goto("/app");
  await expect(page.getByText(/主题内容暂时不可用/)).toBeVisible();
  await page.getByRole("button", { name: "成员管理", exact: true }).click();
  await page.getByLabel("成员邮箱", { exact: true }).fill("new@example.invalid");
  await page.getByLabel("成员称呼", { exact: true }).fill("Synthetic New");
  await page.getByLabel("邀请角色", { exact: true }).selectOption("topic_owner");
  await page.locator(".member-invite").getByLabel("负责主题 ID", { exact: true }).fill("vla, robotics");
  await page.getByRole("button", { name: "发送邀请邮件", exact: true }).click();
  await expect(page.locator(".member-admin").getByRole("status")).toContainText("邀请已发送至 new@example.invalid");
  const invitation = state.requests.find(r => r.path === "admin/invitations" && r.body)!;
  expect(invitation.body).toMatchObject({ email: "new@example.invalid", role: "topic_owner", ownedTopicIds: ["vla", "robotics"], readTopicIds: ["*"] });
  expect(invitation.headers["x-csrf-token"]).toBe("synthetic-csrf");
  const row = page.locator(".member-management-row").filter({ hasText: "member@example.invalid" });
  await row.getByRole("button", { name: "停用成员" }).click();
  await expect(row.getByText("已停用", { exact: true })).toBeVisible();
  expect(state.requests.find(r => r.path === "admin/members/synthetic-member")?.body).toEqual({ baseRevision: 1, status: "disabled" });
});

test("administrator conflict preserves role draft until explicit refresh", async ({ page }) => {
  const state = await mockAuth(page); state.active = true; state.role = "lab_owner"; state.conflict = true;
  await page.goto("/app");
  await page.getByRole("button", { name: "成员管理", exact: true }).click();
  await page.getByLabel("member@example.invalid 的角色", { exact: true }).selectOption("viewer");
  await page.locator(".member-management-row").filter({ hasText: "member@example.invalid" }).getByRole("button", { name: "保存权限" }).click();
  await expect(page.getByRole("status")).toContainText("其他页面更新");
  await expect(page.getByLabel("member@example.invalid 的角色", { exact: true })).toHaveValue("viewer");
});

test("ordinary members never request administrative resources", async ({ page }) => {
  const state = await mockAuth(page); state.active = true;
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/app");
  await expect(page.locator(".radar-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "成员管理" })).toHaveCount(0);
  expect(state.requests.some(r => r.path.startsWith("admin/"))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("failed logout clears private data and offers a working server retry", async ({ page }) => {
  const state = await mockAuth(page); state.active = true; state.logoutFails = true;
  await page.goto("/app");
  await expect(page.locator(".radar-card")).toHaveCount(1);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("服务端退出未确认");
  await expect(page.locator(".radar-card")).toHaveCount(0);
  state.logoutFails = false;
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已退出");
  await expect(page.getByRole("heading", { name: "登录组内 Console" })).toBeVisible();
  expect(state.active).toBe(false);
});
