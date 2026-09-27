import { test, expect } from "@playwright/test";
import { mockMember } from "./radar-fixture";

test("a hidden member tab remains empty after another tab broadcasts a session change", async ({ page }) => {
  const state = await mockMember(page);
  let sessionRequests = 0;
  page.on("request", request => { if (request.url().endsWith("/api/member/session")) sessionRequests++; });
  await page.goto("/app");
  await expect(page.locator(".radar-card")).toHaveCount(1);
  const before = sessionRequests;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".radar-card")).toHaveCount(0);
  await page.evaluate(async () => {
    const sender = new BroadcastChannel("feishubrief-member-session"); sender.postMessage("revalidate");
    await new Promise(resolve => setTimeout(resolve, 80)); sender.close();
  });
  expect(sessionRequests).toBe(before);
  await expect(page.getByText(/Member A/)).toHaveCount(0);
  state.user = "Member B";
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText(/Member B/)).toBeVisible();
  await expect(page.getByText(/Member A/)).toHaveCount(0);
});

test("logout cannot reload old private content while its server response is pending", async ({ page }) => {
  const state = await mockMember(page);
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/member/logout", async route => { await gate; state.active = false; await route.fulfill({ status: 204 }); });
  let sessionRequests = 0;
  page.on("request", request => { if (request.url().endsWith("/api/member/session")) sessionRequests++; });
  await page.goto("/app");
  await expect(page.locator(".radar-card")).toHaveCount(1);
  const before = sessionRequests;
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.locator(".radar-card")).toHaveCount(0);
  await page.evaluate(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    const sender = new BroadcastChannel("feishubrief-member-session"); sender.postMessage("revalidate");
    await new Promise(resolve => setTimeout(resolve, 80)); sender.close();
  });
  expect(sessionRequests).toBe(before);
  await expect(page.locator(".radar-card")).toHaveCount(0);
  finish();
  await expect(page.getByRole("heading", { name: "登录组内 Console" })).toBeVisible();
  await expect(page.getByText(/Member A/)).toHaveCount(0);
});

test("an unconfirmed logout stays cleared through visibility changes until explicit retry", async ({ page }) => {
  await mockMember(page);
  let failed = true;
  await page.route("**/api/member/logout", route => route.fulfill({ status: failed ? 503 : 204, ...(failed ? { contentType: "application/json", body: "{}" } : {}) }));
  await page.goto("/app"); await expect(page.locator(".radar-card")).toHaveCount(1);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("服务端退出未确认");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".radar-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "退出", exact: true })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.getByRole("heading", { name: "登录组内 Console" })).toBeVisible();
});
