import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { defaultConfig } from "../src/policy";
import type { RadarSnapshot, RadarPreferences } from "../src/radar-contract";

const canonical = (v: any): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
export function fixtureRadar(): RadarSnapshot {
  const topics = defaultConfig.researchTopics.map(t => ({ id: t.id, name: t.name, revisionId: createHash("sha256").update(canonical(t)).digest("hex"), scope: t.scope || "", subtopics: t.subtopics?.map(({ id, name }) => ({ id, name })) || [], threshold: 70, limit: 20, available: 0, itemIds: [] as string[] }));
  const items = [
    { name: "Synthetic VLA robot reinforcement learning", main: "vla", cross: ["robotics", "reinforcement-learning"], code: "confirmed" as const },
    { name: "Synthetic world model planning", main: "world-model", cross: [], code: "unknown" as const },
    { name: "Synthetic agent tool use", main: "agent", cross: [], code: "unknown" as const },
  ].map((item, i) => ({
    revisionId: String(i + 1).repeat(64), updateId: String(i + 1).repeat(64), eventId: `fixture:${i}`, title: item.name,
    summary: `测试合成内容 ${item.name}`, url: `https://example.com/synthetic/${i}`, sourceId: "synthetic", publishedAt: "2026-09-26T00:00:00Z",
    contentType: "paper", codeStatus: item.code, dataStatus: "unknown" as const, quality: 90,
    primaryTopicId: item.main, secondaryTopicIds: item.cross, evidence: [{ text: item.name, quote: item.name }],
    assessments: [item.main, ...item.cross].map((id, n) => ({ topicId: id, topicRevision: topics.find(t => t.id === id)!.revisionId, relevance: 95 - n, reason: "合成样本的直接研究贡献", evidenceQuotes: [item.name], subtopicIds: [] })),
  }));
  for (const t of topics) { t.itemIds = items.filter(i => i.assessments.some(a => a.topicId === t.id)).map(i => i.revisionId); t.available = t.itemIds.length; }
  const body = { schemaVersion: 1 as const, algorithmVersion: "topic-radar-v1" as const, batchId: "b".repeat(64), rawBatchId: "c".repeat(64), reportDate: "2026-09-26", reportTimeZone: "Asia/Shanghai", windowDays: 7 as const, topics, items, diagnostics: [] };
  return { ...body, radarId: createHash("sha256").update(canonical(body)).digest("hex") };
}
export async function mockRadar(page: Page) {
  const state = { radar: fixtureRadar(), revoked: [] as string[], failRevocations: false, refs: [] as string[] };
  await page.route("https://api.github.com/**", async route => {
    const url = new URL(route.request().url());
    const reply = (v: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(v) });
    const file = (v: unknown) => reply({ encoding: "base64", sha: "d".repeat(40), content: Buffer.from(JSON.stringify(v)).toString("base64") });
    if (url.pathname.endsWith("/git/ref/heads/digest-state")) return reply({ object: { sha: "e".repeat(40) } });
    if (url.pathname.endsWith("/contents/radar-current")) { state.refs.push(url.searchParams.get("ref") || ""); return reply([{ type: "file", name: "2026-09-26.json" }]); }
    if (url.pathname.includes("/contents/radar-current/")) { state.refs.push(url.searchParams.get("ref") || ""); return file({ radarId: state.radar.radarId, batchId: state.radar.batchId, reportDate: state.radar.reportDate }); }
    if (url.pathname.includes("/contents/radars/")) { state.refs.push(url.searchParams.get("ref") || ""); return file(state.radar); }
    if (url.pathname.endsWith("/contents/revocations")) { state.refs.push(url.searchParams.get("ref") || ""); return reply(state.revoked.map(id => ({ type: "file", name: `${id}.json` })), state.failRevocations ? 403 : 200); }
    return route.fallback();
  });
  return state;
}
export async function mockMember(page: Page) {
  const state = { active: true, conflict: false, saveCalls: [] as any[], revision: "subscription-1", user: "Member A",
    preferences: { primaryTopicId: "vla", secondaryTopicIds: ["robotics"], keywords: [], excludeKeywords: [], subtopicIds: {}, codeOnly: false } as RadarPreferences };
  await page.route("**/api/member/**", async route => {
    const req = route.request(), routeName = new URL(req.url()).pathname.split("/").at(-1);
    const reply = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (!state.active) return reply({}, 401);
    if (routeName === "session") return reply({ userId: state.user, displayName: state.user, csrfToken: "synthetic-csrf", preferencesEnabled: true });
    if (routeName === "radar") return reply(fixtureRadar());
    if (routeName === "logout") { state.active = false; return route.fulfill({ status: 204 }); }
    if (routeName === "preferences" && req.method() === "GET") return reply({ revision: state.revision, preferences: state.preferences });
    if (routeName === "preferences" && req.method() === "PUT") {
      const body = req.postDataJSON(); state.saveCalls.push({ body, csrf: req.headers()["x-csrf-token"] });
      if (state.conflict || body.baseRevision !== state.revision) return reply({}, 409);
      state.preferences = body.preferences; state.revision = "subscription-2";
      return reply({ revision: state.revision, preferences: state.preferences });
    }
    return reply({}, 404);
  });
  return state;
}
