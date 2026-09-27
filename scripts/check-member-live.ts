// Run from the sibling Member checkout: node --import tsx ../FeishuBrief-Console/scripts/check-member-live.ts
// Requires a built Console and locally installed Chrome. All identities/content/mail are synthetic.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { chromium, expect, type Page } from "@playwright/test";
import { createApplication } from "../../FeishuBrief-Member/src/server";
import { Store } from "../../FeishuBrief-Member/src/db";
import type { AppConfig } from "../../FeishuBrief-Member/src/config";
import type { MailMessage } from "../../FeishuBrief-Member/src/mail";
import { exportFixture, FIXTURE_NOW } from "../../FeishuBrief-Member/tests/export-fixture";
import type { BindingProvider, DeliveryRequest } from "../../FeishuBrief-Member/src/notification-providers";

const consoleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.CONSOLE_LIVE_PORT || 5291), origin = `http://127.0.0.1:${port}`;
const mail: MailMessage[] = [], store = new Store(":memory:");
const delivered: DeliveryRequest[] = [];
const feishu = { appId: "cli_synthetic_live", appSecret: "synthetic_live_secret", encryptKey: "synthetic_live_encrypt_key", verificationToken: "synthetic_live_verification" };
const target = "ou_synthetic_live_owner";
const notificationProvider: BindingProvider = {
  configured: channel => channel === "feishu",
  async createWechatQr() { throw new Error("Synthetic WeChat is not configured"); },
  async findWechatFriend() { return null; },
  async fetchQrImage() { throw new Error("Synthetic WeChat is not configured"); },
  async send(request) { assert.equal(request.beforeSend?.(), true); delivered.push(request); return { status: "accepted", providerMessageId: `synthetic-live-message-${delivered.length}` }; },
};
let now = Date.parse(FIXTURE_NOW);
const config: AppConfig = { origin, host: "127.0.0.1", port, databasePath: ":memory:",
  secret: "synthetic-live-secret-at-least-thirty-two-bytes", machineToken: "synthetic-machine-token-at-least-thirty-two-bytes",
  development: true, secureCookies: false, mail: { mode: "local", port: 465, secure: true, from: "Synthetic <test@example.invalid>" },
  notifications: { workerEnabled: true, schedulerEnabled: true, pollIntervalMs: 15000, providers: { feishu } } };
const app = createApplication(config, { store, clock: () => now, consoleDir: resolve(consoleRoot, "dist"), notificationProvider, mail: { async send(message) { mail.push(message); } } });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const external: string[] = [], pageErrors: string[] = [], requests: string[] = [];
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await ctx.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
    requests.push(url.pathname); return route.continue();
  });
  ctx.on("page", page => page.on("pageerror", error => pageErrors.push(error.message)));
  return ctx;
}
async function login(page: Page, email: string) {
  await expect(page.getByRole("heading", { name: "登录组内 Console" })).toBeVisible();
  await page.getByLabel("受邀邮箱", { exact: true }).fill(email);
  await page.getByRole("button", { name: "发送验证码", exact: true }).click();
  await expect(page.getByLabel("邮箱验证码", { exact: true })).toBeVisible();
  const code = mail.filter(item => item.to === email && item.subject.includes("验证码")).at(-1)?.text.match(/\b\d{8}\b/)?.[0];
  assert.ok(code, "Synthetic local mail should contain an OTP");
  await page.getByLabel("邮箱验证码", { exact: true }).fill(code);
  await page.getByRole("button", { name: "验证并登录", exact: true }).click();
  await expect(page.locator(".member-navigation")).toBeVisible();
}
async function receiveFeishuProof(code: string) {
  const payload = { schema: "2.0", header: { app_id: feishu.appId, token: feishu.verificationToken, event_type: "im.message.receive_v1", event_id: "synthetic-live-proof" },
    event: { sender: { sender_type: "user", sender_id: { open_id: target } }, message: { chat_type: "p2p", message_type: "text", content: JSON.stringify({ text: code }) } } };
  const iv = randomBytes(16), cipher = createCipheriv("aes-256-cbc", createHash("sha256").update(feishu.encryptKey).digest(), iv);
  const raw = Buffer.from(JSON.stringify({ encrypt: Buffer.concat([iv, cipher.update(JSON.stringify(payload)), cipher.final()]).toString("base64") }));
  const timestamp = String(Math.floor(now / 1000)), nonce = "synthetic-live-nonce";
  const response = await fetch(origin + "/api/member/webhooks/feishu", { method: "POST", body: raw,
    headers: { "content-type": "application/json", "x-lark-request-timestamp": timestamp, "x-lark-request-nonce": nonce,
      "x-lark-signature": createHash("sha256").update(timestamp + nonce + feishu.encryptKey).update(raw).digest("hex") } });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), {});
}
const count = (table: string) => (store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const screenshots = resolve(consoleRoot, "test-results", "member-live"); mkdirSync(screenshots, { recursive: true });
try {
  await new Promise<void>((done, reject) => { app.server.once("error", reject); app.server.listen(port, "127.0.0.1", done); });
  app.auth.bootstrapOwner("owner@example.invalid", "Synthetic Owner");
  app.content.importExport(exportFixture());
  const ownerContext = await context(), owner = await ownerContext.newPage();
  const response = await owner.goto(origin + "/app/subscription");
  assert.ok(response?.headers()["content-security-policy"].includes("connect-src 'self';"));
  assert.ok(!response?.headers()["content-security-policy"].includes("api.github.com"));
  await login(owner, "owner@example.invalid");
  await expect(owner.getByRole("heading", { name: "建立第一份个人订阅" })).toBeVisible();
  await owner.getByLabel("订阅重点关键词", { exact: true }).fill("policy");
  await owner.getByRole("button", { name: "预览当前草稿", exact: true }).click();
  await expect(owner.locator(".member-personal-card")).toHaveCount(2);
  assert.equal(count("content_subscriptions"), 0); assert.equal(count("content_editions"), 0); assert.equal(count("content_feedback"), 0);
  await owner.getByRole("button", { name: "保存个人订阅", exact: true }).click();
  await expect(owner.getByRole("status")).toContainText("个人订阅已保存");
  assert.equal(count("content_subscriptions"), 1); assert.equal(count("content_editions"), 0);
  await owner.locator(".member-navigation").getByRole("button", { name: "我的简报", exact: true }).click();
  await owner.getByRole("button", { name: "预览本次简报", exact: true }).click();
  await expect(owner.locator(".member-personal-card")).toHaveCount(2); assert.equal(count("content_editions"), 0);
  now += 1000;
  await owner.getByRole("button", { name: "生成站内简报", exact: true }).click();
  await owner.getByRole("button", { name: "确认生成站内版本", exact: true }).click();
  await expect(owner).toHaveURL(/\/app\/briefs\/[a-f0-9]{64}$/);
  await expect(owner.locator(".member-personal-card")).toHaveCount(2);
  const privateUrl = owner.url(); assert.equal(count("content_editions"), 1);
  await owner.locator(".member-personal-card").first().getByRole("button", { name: "收藏", exact: true }).click();
  await expect(owner.locator(".member-personal-card").first().getByRole("button", { name: "取消收藏", exact: true })).toBeVisible();
  await owner.screenshot({ path: resolve(screenshots, "brief-desktop.png"), fullPage: true });
  await owner.locator(".member-navigation").getByRole("button", { name: "我的收藏", exact: true }).click();
  await expect(owner.locator(".member-personal-card")).toHaveCount(1);
  await owner.reload(); await expect(owner.locator(".member-personal-card")).toHaveCount(1);
  await owner.setViewportSize({ width: 375, height: 860 });
  assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await owner.screenshot({ path: resolve(screenshots, "saved-mobile.png"), fullPage: true });
  await owner.setViewportSize({ width: 1280, height: 960 });
  // This application has an injected provider and no running timer. Every worker
  // invocation below is explicit; the transport only appends to the array above.
  assert.equal(app.runtime.status().started, false);
  await owner.locator(".member-navigation").getByRole("button", { name: "我的订阅", exact: true }).click();
  await owner.getByLabel("接收渠道意愿", { exact: true }).selectOption("feishu");
  await owner.getByRole("button", { name: "保存个人订阅", exact: true }).click();
  await expect(owner.getByRole("status")).toContainText("个人订阅已保存");
  assert.equal(count("content_editions"), 1); assert.equal(count("notification_intents"), 0); assert.equal(delivered.length, 0);
  await owner.locator(".member-navigation").getByRole("button", { name: "接收与通知", exact: true }).click();
  await expect(owner.getByRole("button", { name: "开始微信绑定", exact: true })).toBeDisabled();
  await owner.getByRole("button", { name: "开始飞书绑定", exact: true }).click();
  const proof = await owner.locator(".member-notification-code").textContent(); assert.match(proof || "", /^FB-[A-F0-9]{24}$/);
  assert.equal(count("notification_bindings"), 0);
  await receiveFeishuProof(proof!);
  await owner.getByRole("button", { name: "检查绑定进度", exact: true }).click();
  await expect(owner.getByRole("button", { name: "确认绑定此飞书账号", exact: true })).toBeVisible();
  assert.equal(count("notification_bindings"), 0);
  await owner.getByRole("button", { name: "确认绑定此飞书账号", exact: true }).click();
  await expect(owner.getByRole("status")).toContainText("已验证并绑定");
  assert.equal(count("notification_bindings"), 1); assert.equal(count("notification_intents"), 0);
  assert.ok(!(await owner.locator("body").innerText()).includes(target));
  await owner.getByRole("button", { name: "发送此固定版本", exact: true }).click();
  assert.equal(count("notification_intents"), 0);
  await owner.getByRole("button", { name: "确认发送个人简报", exact: true }).click();
  await expect(owner.getByRole("status")).toContainText("发送任务已建立");
  assert.equal(count("notification_intents"), 1); assert.equal(delivered.length, 0);
  await app.queue.runOnce({ limit: 5 }); await app.queue.runOnce({ limit: 5 });
  assert.equal(delivered.length, 1); assert.equal(delivered[0].target, target); assert.ok(delivered[0].text.includes(privateUrl));
  await owner.getByRole("button", { name: "刷新通知状态", exact: true }).click();
  await expect(owner.getByText("平台已受理", { exact: true })).toBeVisible();
  await expect(owner.getByText("这是平台状态，不能据此判断你是否已阅读。", { exact: true })).toBeVisible();
  await owner.getByLabel("开启个人定时投递", { exact: true }).check();
  await owner.getByLabel("投递时间（北京时间）", { exact: true }).fill("08:45");
  await owner.getByRole("button", { name: "保存定时设置", exact: true }).click();
  await expect(owner.getByRole("status")).toContainText("定时投递设置已保存");
  assert.equal((store.db.prepare("SELECT enabled FROM notification_schedules").get() as { enabled: number }).enabled, 1);
  assert.equal(count("notification_schedule_runs"), 0); assert.equal(count("notification_intents"), 1); assert.equal(delivered.length, 1);
  await owner.screenshot({ path: resolve(screenshots, "notifications-desktop.png"), fullPage: true });
  await owner.setViewportSize({ width: 375, height: 860 });
  assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await owner.screenshot({ path: resolve(screenshots, "notifications-mobile.png"), fullPage: true });
  await owner.setViewportSize({ width: 1280, height: 960 });
  await owner.locator(".member-navigation").getByRole("button", { name: "投递管理", exact: true }).click();
  await owner.getByRole("button", { name: "补发固定版本", exact: true }).click();
  await owner.getByLabel("补发原因", { exact: true }).fill("Synthetic cancellation check before dispatch");
  await expect(owner.getByRole("button", { name: "确认补发此固定版本", exact: true })).toBeDisabled();
  await owner.getByLabel("我已核对原记录，知悉对方可能已经收到；确认按原固定版本与原接收账号补发。", { exact: true }).check();
  await owner.getByRole("button", { name: "确认补发此固定版本", exact: true }).click();
  await expect(owner.getByRole("status")).toContainText("已创建补发任务");
  assert.equal(count("notification_intents"), 2); assert.equal(delivered.length, 1);
  await owner.locator(".member-navigation").getByRole("button", { name: "接收与通知", exact: true }).click();
  await owner.getByRole("button", { name: "解绑飞书", exact: true }).click();
  assert.equal((store.db.prepare("SELECT count(*) AS n FROM notification_intents WHERE status='queued'").get() as { n: number }).n, 1);
  await owner.getByRole("button", { name: "确认解绑", exact: true }).click();
  await expect(owner.getByRole("status")).toContainText("已解绑"); await expect(owner.getByText("已取消", { exact: true })).toBeVisible();
  await app.queue.runOnce({ limit: 5 }); assert.equal(delivered.length, 1);
  await owner.locator(".member-navigation").getByRole("button", { name: "服务运行", exact: true }).click();
  await expect(owner.getByRole("heading", { name: "运营状态", exact: true })).toBeVisible();
  await expect(owner.getByText("正在读取运营状态…")).toHaveCount(0);
  assert.equal((await owner.request.get(origin + "/api/member/admin/operations")).status(), 200);
  await owner.screenshot({ path: resolve(screenshots, "operations-desktop.png"), fullPage: true });
  const cookie = (await ownerContext.cookies()).find(value => value.name === app.cookieName)!;
  assert.ok(cookie.httpOnly);
  const actor = app.auth.authenticate(cookie.value)!;
  await app.auth.createInvitation(actor, { email: "member@example.invalid", displayName: "Synthetic Member", role: "member", readTopicIds: ["*"], ownedTopicIds: [] });
  const invitationUrl = mail.find(item => item.to === "member@example.invalid" && item.subject.includes("邀请"))!.text.split("\n").find(line => line.startsWith(origin))!;
  const memberContext = await context(), member = await memberContext.newPage();
  await member.goto(invitationUrl); await login(member, "member@example.invalid");
  assert.ok(!member.url().includes("invite="));
  await member.goto(privateUrl);
  await expect(member.getByRole("status")).toContainText("内容不存在或当前账号无权访问");
  await expect(member.locator(".member-personal-card")).toHaveCount(0);
  assert.equal((await member.request.get(origin + "/api/member/admin/operations")).status(), 403);
  await member.getByRole("button", { name: "退出", exact: true }).click();
  await expect(member.getByRole("heading", { name: "登录组内 Console" })).toBeVisible();
  assert.equal((await member.request.get(origin + "/api/member/session")).status(), 401);
  // Server headers cannot see a URL fragment. The frontend must reload the member
  // document before loading its surface when an old administrator hash link is used.
  const redirectContext = await context(), redirected = await redirectContext.newPage();
  await redirected.goto(origin + "/admin#/app/library");
  await expect(redirected).toHaveURL(origin + "/app/library");
  await expect(redirected.getByRole("heading", { name: "登录组内 Console" })).toBeVisible();
  assert.equal(await redirected.locator('meta[name="feishubrief-surface"]').getAttribute("content"), "member");
  assert.equal(count("content_editions"), 1);
  assert.equal(count("notification_intents"), 2); assert.equal(count("notification_schedule_runs"), 0); assert.equal(delivered.length, 1);
  assert.equal(mail.length, 3); // Owner OTP, synthetic invitation, member OTP; in-memory transport only.
  assert.deepEqual(external, []); assert.deepEqual(pageErrors, []);
  assert.ok(!requests.some(url => /\/assets\/AdminApp-/.test(url)), "Member flow must not load the GitHub admin chunk");
  console.log("Phase 5/6 live Chrome passed: built CSP pages, draft preview without writes, private edition, saved state, verified Feishu binding, explicit queued send, duplicate worker prevention, schedule persistence without ticking, explicit admin resend, unbind cancellation, mobile layout, operations, cross-member denial and logout. 3 injected mails; 1 simulated personal delivery; zero external platform/model calls.");
} finally {
  await browser.close();
  if (app.server.listening) await new Promise<void>(done => app.server.close(() => done()));
  store.close();
}
