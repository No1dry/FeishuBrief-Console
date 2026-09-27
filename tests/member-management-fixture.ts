import type { Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { defaultConfig } from "../src/policy";
import { fixtureRadar } from "./radar-fixture";

// Synthetic identities, topics and operation counts only. All member requests are intercepted.
export async function mockMemberManagement(page: Page) {
  const profiles = structuredClone(defaultConfig.researchTopics).map((topic, index) => ({ protocol: "topic-profile-v1" as const, revisionId: String(index + 1).repeat(64), topic }));
  const state = {
    active: true, role: "lab_owner", topicConflict: false, memberConflict: false, emptyOperations: true, phase6: false,
    delayOperations: null as null | (() => Promise<void>), delayMemberUpdate: null as null | (() => Promise<void>),
    requests: [] as { path: string; method: string; body: any; headers: Record<string, string> }[], profiles,
    members: [
      { userId: "synthetic-owner", email: "owner@example.invalid", displayName: "Synthetic Owner", role: "lab_owner", ownedTopicIds: [], readTopicIds: ["*"], status: "active", revision: 1 },
      { userId: "synthetic-member", email: "member@example.invalid", displayName: "Synthetic Member", role: "member", ownedTopicIds: [], readTopicIds: ["*"], status: "active", revision: 1 },
      { userId: "synthetic-invited", email: "invited@example.invalid", displayName: "Synthetic Invited", role: "topic_owner", ownedTopicIds: ["vla"], readTopicIds: ["vla"], status: "invited", revision: 1 },
    ],
    invitations: [{ invitationId: "synthetic-invitation", userId: "synthetic-invited", email: "invited@example.invalid", expiresAt: Date.parse("2026-10-01T00:00:00Z"), status: "pending" }],
  };
  await page.route("**/api/member/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname.slice("/api/member/".length), method = req.method(), body = req.postData() ? req.postDataJSON() : undefined;
    state.requests.push({ path, method, body, headers: req.headers() });
    const reply = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (!state.active) return reply({ error: "session_required" }, 401);
    if (path === "session") return reply({ userId: "synthetic-owner", displayName: "Synthetic Owner", csrfToken: "synthetic-csrf", preferencesEnabled: true, role: state.role, ownedTopicIds: state.role === "topic_owner" ? ["vla"] : [], readTopicIds: ["*"] });
    if (path === "capabilities") return reply({ schemaVersion: 1, library: true, feedback: true, draftPreview: true, personalEditions: true, ...(state.phase6 ? { notificationBindings: true } : {}), personalDelivery: { enabled: state.phase6, phase: 6, channels: state.phase6 ? ["feishu"] : [] }, scheduler: { enabled: state.phase6, phase: 6 }, groupDelivery: { mode: "existing-engine" } });
    if (path === "logout") { state.active = false; return route.fulfill({ status: 204 }); }
    if (path === "radar") return reply(fixtureRadar());
    if (path === "preferences") return reply({ revision: "initial", preferences: { primaryTopicId: "vla", secondaryTopicIds: [], keywords: [], excludeKeywords: [], subtopicIds: {}, codeOnly: false } });
    if (path === "subscription") return reply({ revision: "initial", subscription: null, defaults: { primaryTopicId: "vla", secondaryTopicIds: [], keywords: [], excludeKeywords: [], subtopicIds: {}, codeOnly: false, contentTypes: ["paper"], maxItems: 10, primaryShare: 0.6, preferOpenSource: false, frequency: "daily", channel: "in-app", firstEditionLookbackDays: 7 } });
    if (path === "admin/topics" && method === "GET") return reply({ revision: "a".repeat(64), profiles: state.profiles.filter(profile => state.role !== "topic_owner" || profile.topic.id === "vla") });
    if (path.startsWith("admin/topics/")) {
      if (state.topicConflict) return reply({ error: "revision_conflict" }, 409);
      const topicId = path.split("/").at(-1)!;
      if (state.role === "topic_owner" && topicId !== "vla") return reply({ error: "forbidden" }, 403);
      if (method === "DELETE") { state.profiles = state.profiles.filter(profile => profile.topic.id !== topicId); return reply({ revision: "d".repeat(64), deleted: true, reprocessingRequired: true }); }
      const profile = { protocol: "topic-profile-v1" as const, revisionId: createHash("sha256").update(JSON.stringify(body.profile)).digest("hex"), topic: body.profile };
      state.profiles = [...state.profiles.filter(p => p.topic.id !== topicId), profile]; return reply({ profile, reprocessingRequired: true });
    }
    if (path === "admin/members") return reply({ members: state.members });
    if (path.startsWith("admin/members/") && method === "PUT") {
      if (state.delayMemberUpdate) await state.delayMemberUpdate();
      if (state.memberConflict) return reply({ error: "revision_conflict" }, 409);
      const member = state.members.find(m => m.userId === path.split("/").at(-1))!;
      Object.assign(member, body, { revision: member.revision + 1 }); return reply({ member }).catch(() => undefined);
    }
    if (path === "admin/invitations") {
      if (method === "GET") return reply({ invitations: state.invitations });
      const invitation = { invitationId: "synthetic-new-invitation", email: body.email, expiresAt: Date.parse("2026-10-01T00:00:00Z"), status: "pending" };
      return reply({ invitation });
    }
    if (path === "admin/audit") return reply({ events: [{ id: "synthetic-audit", actorId: "synthetic-owner", action: "topic.update", targetId: "vla", metadata: { revision: "b".repeat(64) }, createdAt: Date.parse("2026-09-27T00:00:00Z") }] });
    if (path === "admin/operations") {
      if (state.delayOperations) await state.delayOperations();
      return reply({ generatedAt: "2026-09-27T00:00:00Z", content: { readyImports: state.emptyOperations ? 0 : 1, revokedRevisions: 0, activeTopics: 5, catalogRevision: "a".repeat(64), currentCatalogReady: !state.emptyOperations,
        latestImports: state.emptyOperations ? [] : [{ exportId: "b".repeat(64), snapshotId: "c".repeat(64), reportDate: "2026-09-27", cutoffAt: "2026-09-27T00:00:00Z", generatedAt: "2026-09-27T00:00:00Z", importedAt: "2026-09-27T00:00:00Z", status: "ready", catalogCurrent: true }] },
        assembly: { status: "on-demand", editions: 0, officialEditions: 0, membersWithEditions: 0, lastCreatedAt: null }, delivery: { enabled: state.phase6, phase: 6, records: [], ...(state.phase6 ? { counts: {}, worker: { enabled: true, running: false, started: true, lastStartedAt: "2026-09-27T00:00:00Z", lastFinishedAt: "2026-09-27T00:00:00Z", lastOutcome: "ok" } } : {}) }, scheduler: { enabled: state.phase6, phase: 6, ...(state.phase6 ? { timeZone: "Asia/Shanghai", configuredMembers: 2, enabledMembers: 1, lastRunAt: "2026-09-27T00:00:00Z" } : {}) }, groupDelivery: { mode: "existing-engine" } }).catch(() => undefined);
    }
    return reply({ error: "not_found" }, 404);
  });
  return state;
}
