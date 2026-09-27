import type { Page } from "@playwright/test";
import { fixtureRadar } from "./radar-fixture";
import type { SubscriptionSettings, FeedbackState } from "../src/member-personal-api";

export const syntheticMemberId = "synthetic-personal-member";
export const syntheticSettings: SubscriptionSettings = { primaryTopicId: "vla", secondaryTopicIds: ["robotics"], subtopicIds: {}, keywords: [], excludeKeywords: [], codeOnly: false,
  contentTypes: ["paper", "repository", "research", "industry", "opinion", "video"], maxItems: 10, primaryShare: .6, preferOpenSource: false, frequency: "daily", channel: "in-app", firstEditionLookbackDays: 7 };
export function syntheticEdition(revision = "7".repeat(64)) {
  const radar = fixtureRadar(), item = radar.items[0];
  return { editionId: "a".repeat(64), memberId: syntheticMemberId, reportDate: "2026-09-27", reportTimeZone: "Asia/Shanghai", cutoffAt: "2026-09-27T02:00:00Z", inputs: { subscriptionRevisionId: revision },
    topics: radar.topics, status: "ready", firstEdition: true, windowDays: 7, windowStartDate: "2026-09-21", channel: "in-app", externalSendAllowed: false,
    items: [{ item, assignedTopicId: "vla", slot: "primary", score: { relevance: 95, quality: 90, freshness: 80, preference: 0, total: 90.5 }, hitKeywords: [], matchedTopicIds: ["vla", "robotics"], updateKey: "initial", recap: true, update: false, reasons: ["primary-topic", "quality-gate", "topic-evidence", "first-edition-recap"] }],
    quota: { maxItems: 10, primaryTarget: 6, primarySelected: 1, secondarySelected: 0, fillSelected: 0, secondaryOrder: ["robotics"], unfilled: 9 } };
}
export async function mockPersonal(page: Page) {
  const state = {
    active: true, viewer: false, revision: "initial", settings: structuredClone(syntheticSettings), saved: false,
    requests: [] as { path: string; method: string; body: any; csrf?: string }[], revisionCounter: 7,
    editions: [] as ReturnType<typeof syntheticEdition>[], feedback: new Map<string, FeedbackState["feedback"]>(), feedbackCounter: 0,
    generationFailsOnce: false, unavailableEdition: false, currentAvailable: true, feedbackUnavailable: false, historyFailsAfterCreate: false,
    idempotency: new Map<string, ReturnType<typeof syntheticEdition>>(),
  };
  const feedbackFor = (eventId: string): FeedbackState => {
    const feedback = state.feedback.get(eventId) || [];
    return { feedback, read: feedback.some(f => f.kind === "read"), saved: feedback.some(f => f.kind === "saved"), notRelevant: feedback.some(f => f.kind === "not-relevant") };
  };
  const stored = () => ({ ...state.settings, schemaVersion: 1, revisionId: state.revision, memberId: syntheticMemberId, effectiveAt: "2026-09-27T01:00:00Z" });
  await page.route("**/api/member/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace("/api/member/", ""), method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    state.requests.push({ path, method, body, csrf: request.headers()["x-csrf-token"] });
    const reply = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (!state.active) return reply({ error: "session_required" }, 401);
    if (path === "session") return reply({ userId: syntheticMemberId, displayName: "Synthetic Reader", csrfToken: "synthetic-csrf", preferencesEnabled: !state.viewer, role: state.viewer ? "viewer" : "member", ownedTopicIds: [], readTopicIds: ["*"] });
    if (path === "capabilities") return reply({ schemaVersion: 1, library: true, feedback: true, draftPreview: true, personalEditions: true, personalDelivery: { enabled: false, phase: 6, channels: [] }, scheduler: { enabled: false, phase: 6 }, groupDelivery: { mode: "existing-engine" } });
    if (path === "logout") { state.active = false; return route.fulfill({ status: 204 }); }
    if (path === "topics") return reply({ topics: fixtureRadar().topics });
    if (path === "radar") return reply(fixtureRadar());
    if (path === "preferences") return reply({ revision: state.revision, preferences: { primaryTopicId: state.settings.primaryTopicId, secondaryTopicIds: state.settings.secondaryTopicIds, keywords: state.settings.keywords, excludeKeywords: state.settings.excludeKeywords, subtopicIds: state.settings.subtopicIds, codeOnly: state.settings.codeOnly } });
    if (path === "subscription" && method === "GET") return reply({ revision: state.revision, subscription: state.saved ? stored() : null, ...(!state.saved ? { defaults: state.settings } : {}) });
    if (path === "subscription" && method === "PUT") {
      if (state.viewer) return reply({ error: "read_only" }, 403);
      if (body.baseRevision !== state.revision) return reply({ error: "revision_conflict" }, 409);
      state.revision = String(++state.revisionCounter).repeat(64); state.settings = body.subscription; state.saved = true; return reply({ revision: state.revision, subscription: stored() });
    }
    if (path === "preview") {
      const settings = body.subscription || state.settings;
      const edition = syntheticEdition(state.saved ? state.revision : "7".repeat(64));
      if (settings.frequency === "paused") { edition.status = "paused"; edition.items = []; }
      return reply({ edition, finalized: false, draft: !!body.subscription });
    }
    if (path === "editions" && method === "GET") return state.historyFailsAfterCreate && state.editions.length ? reply({ error: "internal_error" }, 503) : reply({ editions: state.editions.map(edition => ({ editionId: edition.editionId, reportDate: edition.reportDate, cutoffAt: edition.cutoffAt, status: edition.status, count: edition.items.length, finalized: true })) });
    if (path === "editions" && method === "POST") {
      if (state.viewer) return reply({ error: "read_only" }, 403);
      const existing = state.idempotency.get(body.requestId), edition = existing || syntheticEdition(state.revision);
      if (!existing) { state.idempotency.set(body.requestId, edition); state.editions.push(edition); }
      if (state.generationFailsOnce) { state.generationFailsOnce = false; return route.abort("failed"); }
      return reply({ edition, finalized: true, idempotent: !!existing });
    }
    if (path.startsWith("editions/")) return state.unavailableEdition ? reply({ error: "edition_unavailable" }, 410) : state.editions.some(e => e.editionId === path.split("/")[1]) ? reply({ edition: state.editions.find(e => e.editionId === path.split("/")[1]), finalized: true }) : reply({ error: "not_found" }, 404);
    if (path === "feedback" && method === "GET") return state.feedbackUnavailable ? reply({ error: "internal_error" }, 503) : reply({ revision: `feedback-${state.feedbackCounter}`, items: [...state.feedback.keys()].map(eventId => ({ eventId, ...feedbackFor(eventId) })) });
    if (path === "feedback" && method === "POST") {
      if (state.viewer) return reply({ error: "read_only" }, 403);
      const feedbackId = `00000000-0000-4000-8000-${String(++state.feedbackCounter).padStart(12, "0")}`, occurredAt = "2026-09-27T03:00:00Z";
      const prior = state.feedback.get(body.targetEventId) || [];
      state.feedback.set(body.targetEventId, body.kind === "retract" ? prior.filter(f => f.feedbackId !== body.retractsFeedbackId) : [...prior, { feedbackId, kind: body.kind, occurredAt }]);
      return reply({ feedbackId, targetEventId: body.targetEventId, kind: body.kind, occurredAt, retractsFeedbackId: body.retractsFeedbackId || null });
    }
    if (path === "library") return reply({ currentAvailable: state.currentAvailable, items: fixtureRadar().items.map(item => ({ item, origin: state.currentAvailable ? "current" : "saved-history", feedback: feedbackFor(item.eventId) })).filter(entry => state.currentAvailable || entry.feedback.saved) });
    return reply({ error: "not_found" }, 404);
  });
  return state;
}
