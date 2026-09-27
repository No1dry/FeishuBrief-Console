import type { Page } from "@playwright/test";
import { mockPersonal, syntheticEdition, syntheticMemberId } from "./member-personal-fixture";
import type { BindingChallenge, NotificationBinding, PersonalDelivery } from "../src/member-notifications-api";

const now = "2026-09-27T04:00:00Z";
export const syntheticDelivery = (status: PersonalDelivery["status"] = "queued"): PersonalDelivery => ({
  intentId: "synthetic-delivery-1", editionId: "a".repeat(64), memberId: syntheticMemberId, reportDate: "2026-09-27", channel: "feishu", status,
  attempts: status === "queued" ? 0 : 1, nextAttemptAt: null, createdAt: now, updatedAt: now, providerMessageId: null, errorCode: null, sourceIntentId: null, reason: null, canReconcile: false, unknownReviewedAt: null,
});
export async function mockNotifications(page: Page) {
  const personal = await mockPersonal(page); personal.saved = true; personal.revision = "7".repeat(64); personal.settings.channel = "feishu"; personal.editions.push(syntheticEdition());
  const state = {
    personal, owner: false, enabled: true, configured: true, scheduleSystem: true, binds: [] as NotificationBinding[], challenge: null as BindingChallenge | null,
    schedule: { revision: "initial", enabled: false, localTime: "09:00", timeZone: "Asia/Shanghai", systemEnabled: true },
    deliveries: [] as PersonalDelivery[], requests: [] as { path: string; method: string; body: any; csrf?: string }[], sendFailsOnce: false, resendFailsOnce: false, bindingFails: false, expireAfterUnbind: false,
    seen: new Map<string, PersonalDelivery>(),
  };
  await page.route("**/api/member/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace("/api/member/", ""), method = req.method(), body = req.postData() ? req.postDataJSON() : undefined;
    const reply = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (!path.startsWith("notifications") && !path.startsWith("admin/deliveries") && path !== "capabilities" && !(path === "session" && state.owner)) return route.fallback();
    state.requests.push({ path, method, body, csrf: req.headers()["x-csrf-token"] });
    if (!personal.active) return reply({ error: "session_required" }, 401);
    if (path === "session") return reply({ userId: syntheticMemberId, displayName: "Synthetic Owner", csrfToken: "synthetic-csrf", preferencesEnabled: true, role: "lab_owner", ownedTopicIds: [], readTopicIds: ["*"] });
    if (path === "capabilities") return reply({ schemaVersion: 1, library: true, feedback: true, draftPreview: true, personalEditions: true, notificationBindings: true, personalDelivery: { enabled: state.enabled, phase: 6, channels: state.configured ? ["feishu", "wechat"] : [] }, scheduler: { enabled: state.scheduleSystem, phase: 6 }, groupDelivery: { mode: "existing-engine" } });
    if (path === "notifications") return reply({ channels: ["feishu", "wechat"].map(channel => ({ channel, configured: state.configured })), bindings: state.binds, schedule: { ...state.schedule, systemEnabled: state.scheduleSystem }, deliveries: state.deliveries });
    if (/^notifications\/bindings\/(feishu|wechat)\/start$/.test(path)) {
      const channel = path.split("/")[2] as "feishu" | "wechat";
      state.challenge = { challengeId: `synthetic-${channel}-challenge`, channel, status: "waiting", expiresAt: "2099-09-27T04:10:00Z", ...(channel === "feishu" ? { code: "FB-123456789012345678901234" } : { qrCodeUrl: "/api/member/notifications/challenges/synthetic-wechat-challenge/qr" }) };
      return reply(state.challenge);
    }
    if (path.endsWith("/qr")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="white"/><path d="M20 20h50v50H20zM110 20h50v50h-50zM20 110h50v50H20zM110 110h20v50h-20z" fill="black"/></svg>' });
    if (/^notifications\/challenges\/[^/]+$/.test(path)) return reply(state.challenge);
    if (path.endsWith("/confirm")) {
      if (state.bindingFails) return reply({ error: "challenge_invalid" }, 400);
      const binding: NotificationBinding = { bindingId: `synthetic-${state.challenge!.channel}-binding`, channel: state.challenge!.channel, status: "active", displayName: "Synthetic Verified Reader", verifiedAt: now };
      state.binds = [binding, ...state.binds.filter(row => row.channel !== binding.channel)]; state.challenge = null; return reply({ binding });
    }
    if (path.startsWith("notifications/bindings/") && method === "DELETE") {
      const binding = state.binds.find(row => row.bindingId === path.split("/").pop())!; binding.status = "unbound"; state.deliveries = state.deliveries.map(row => row.status === "queued" ? { ...row, status: "cancelled" } : row); if (state.expireAfterUnbind) personal.active = false; return reply({ binding });
    }
    if (path === "notifications/schedule") {
      if (body.baseRevision !== state.schedule.revision) return reply({ error: "revision_conflict" }, 409);
      state.schedule = { ...state.schedule, revision: crypto.randomUUID(), enabled: body.enabled, localTime: body.localTime };
      if (!body.enabled) state.deliveries = state.deliveries.map(row => row.status === "queued" ? { ...row, status: "cancelled" } : row);
      return reply(state.schedule);
    }
    if (path === "notifications/deliveries") {
      const existing = state.seen.get(body.requestId), delivery = existing || syntheticDelivery();
      if (!existing) { state.seen.set(body.requestId, delivery); state.deliveries.push(delivery); }
      if (state.sendFailsOnce) { state.sendFailsOnce = false; return route.abort("failed"); }
      return reply({ delivery, idempotent: !!existing });
    }
    if (path === "admin/deliveries") return state.owner ? reply({ deliveries: state.deliveries }) : reply({ error: "forbidden" }, 403);
    if (path.endsWith("/review")) { const delivery = state.deliveries.find(row => row.intentId === path.split("/")[2])!; delivery.unknownReviewedAt = now; return reply({ delivery }); }
    if (path.endsWith("/reconcile")) { const delivery = state.deliveries.find(row => row.intentId === path.split("/")[2])!; delivery.status = "provider_confirmed"; return reply({ delivery }); }
    if (path.endsWith("/resend")) {
      const existing = state.seen.get(body.requestId), source = state.deliveries.find(row => row.intentId === path.split("/")[2])!;
      const delivery = existing || { ...syntheticDelivery(), intentId: "synthetic-resend-2", sourceIntentId: source.intentId, reason: body.reason };
      if (!existing) { state.seen.set(body.requestId, delivery); state.deliveries.unshift(delivery); }
      if (state.resendFailsOnce) { state.resendFailsOnce = false; return route.abort("failed"); }
      return reply({ delivery, idempotent: !!existing });
    }
    return reply({ error: "not_found" }, 404);
  });
  return state;
}
export const syntheticBinding = (): NotificationBinding => ({ bindingId: "synthetic-feishu-binding", channel: "feishu", status: "active", displayName: "Synthetic Verified Reader", verifiedAt: now });
