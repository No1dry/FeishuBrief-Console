// Keep identical to Console/src/radar-contract.ts. Contains no Node or private-provider code.
import { z } from "zod";
z.config({ jitless: true });
const Id = z.string().regex(/^[a-f0-9]{64}$/);
const TopicId = z.string().regex(/^[a-z0-9-]+$/).max(60);
const Text = z.string().min(1).refine(value => value.trim().length > 0);
export const RadarItemSchema = z.object({
  revisionId: Id, eventId: Text, updateId: Id, title: Text, summary: Text,
  url: z.string().url().refine(s => /^https?:\/\//i.test(s)), sourceId: Text,
  publishedAt: z.string().nullable(), contentType: Text,
  codeStatus: z.enum(["confirmed", "absent", "unknown"]), dataStatus: z.enum(["confirmed", "absent", "unknown"]),
  quality: z.number().min(80).max(100), primaryTopicId: TopicId, secondaryTopicIds: z.array(TopicId),
  evidence: z.array(z.object({ text: Text, quote: Text }).strict()).min(1),
  assessments: z.array(z.object({ topicId: TopicId, topicRevision: Id, relevance: z.number().min(70).max(100),
    reason: Text, evidenceQuotes: z.array(Text).min(1), subtopicIds: z.array(TopicId),
  }).strict()).min(1),
}).strict();
export const RadarSchema = z.object({
  schemaVersion: z.literal(1), algorithmVersion: z.literal("topic-radar-v1"), radarId: Id,
  batchId: Id, rawBatchId: Id, reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reportTimeZone: Text,
  windowDays: z.literal(7),
  topics: z.array(z.object({ id: TopicId, name: Text, revisionId: Id, scope: z.string(),
    subtopics: z.array(z.object({ id: TopicId, name: Text }).strict()),
    threshold: z.number().min(70).max(100), limit: z.number().int().positive(),
    available: z.number().int().nonnegative(), itemIds: z.array(Id),
  }).strict()).min(1),
  items: z.array(RadarItemSchema),
  diagnostics: z.array(z.object({ sourceItemId: Text, eventId: Text,
    stage: z.enum(["invisible", "not_processed", "rejected", "topic_excluded", "duplicate", "quota", "selected", "revoked", "outside_window"]),
    reason: Text,
  }).strict()),
}).strict().superRefine((v, ctx) => {
  const topicIds = new Set(v.topics.map(t => t.id));
  if (topicIds.size !== v.topics.length || new Set(v.items.map(i => i.eventId)).size !== v.items.length || new Set(v.items.map(i => i.revisionId)).size !== v.items.length)
    ctx.addIssue({ code: "custom", message: "Duplicate topic, revision or event" });
  for (const item of v.items) {
    const ids = item.assessments.map(a => a.topicId);
    if (new Set(ids).size !== ids.length || !ids.includes(item.primaryTopicId) ||
      item.secondaryTopicIds.length !== ids.length - 1 || new Set(item.secondaryTopicIds).size !== item.secondaryTopicIds.length ||
      item.secondaryTopicIds.some(id => id === item.primaryTopicId || !ids.includes(id)) ||
      item.assessments.some(a => !v.topics.some(t => t.id === a.topicId && t.revisionId === a.topicRevision && a.relevance >= t.threshold && a.subtopicIds.every(id => t.subtopics.some(s => s.id === id)))))
      ctx.addIssue({ code: "custom", message: "Invalid topic assignment" });
  }
  for (const topic of v.topics) if (topic.itemIds.length > topic.limit || topic.available < topic.itemIds.length || new Set(topic.itemIds).size !== topic.itemIds.length || topic.itemIds.some(id => !v.items.some(i => i.revisionId === id && i.assessments.some(a => a.topicId === topic.id))))
    ctx.addIssue({ code: "custom", message: "Invalid topic slots" });
});
export type RadarSnapshot = z.infer<typeof RadarSchema>;
export type RadarItem = z.infer<typeof RadarItemSchema>;

export const RadarPreferencesSchema = z.object({
  primaryTopicId: TopicId,
  secondaryTopicIds: z.array(TopicId).max(11),
  keywords: z.array(z.string().trim().min(2).max(100)).max(40),
  excludeKeywords: z.array(z.string().trim().min(2).max(100)).max(40),
  subtopicIds: z.record(TopicId, z.array(TopicId).max(20)),
  codeOnly: z.boolean(),
}).strict().superRefine((v, ctx) => {
  if (v.secondaryTopicIds.includes(v.primaryTopicId) || new Set(v.secondaryTopicIds).size !== v.secondaryTopicIds.length)
    ctx.addIssue({ code: "custom", message: "主次方向不能重复" });
});
export type RadarPreferences = z.infer<typeof RadarPreferencesSchema>;

function matches(text: string, word: string) {
  const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  const value = norm(word);
  return /^[\x00-\x7f]+$/.test(value)
    ? new RegExp(`(?:^|[^a-z0-9])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s)?(?:$|[^a-z0-9])`, "i").test(norm(text))
    : norm(text).includes(value);
}

// Pure preview only: no history, no PersonalEdition, no I/O, no model or sending.
export function previewRadar(radar: RadarSnapshot, value: RadarPreferences) {
  const prefs = RadarPreferencesSchema.parse(value);
  const selected = [prefs.primaryTopicId, ...prefs.secondaryTopicIds];
  if (selected.some(id => !radar.topics.some(t => t.id === id)) || Object.entries(prefs.subtopicIds).some(([id, ids]) =>
    !selected.includes(id) || ids.some(s => !radar.topics.find(t => t.id === id)?.subtopics.some(t => t.id === s))))
    throw new Error("主题或子方向已变化，请重新选择");
  const slots = new Set(radar.topics.filter(t => selected.includes(t.id)).flatMap(t => t.itemIds));
  return radar.items.filter(item => slots.has(item.revisionId)).flatMap(item => {
    const assessments = item.assessments.filter(a => selected.includes(a.topicId) &&
      (!prefs.subtopicIds[a.topicId]?.length || a.subtopicIds.some(id => prefs.subtopicIds[a.topicId].includes(id))));
    const text = `${item.title}\n${item.summary}\n${item.evidence.map(e => e.quote).join("\n")}`;
    if (!assessments.length || prefs.excludeKeywords.some(k => matches(text, k)) || (prefs.codeOnly && item.codeStatus !== "confirmed")) return [];
    const hitKeywords = [...new Set(prefs.keywords)].filter(k => matches(text, k));
    const primary = assessments.some(a => a.topicId === prefs.primaryTopicId);
    const preferenceScore = Math.min(10, hitKeywords.length * 2);
    const score = Math.max(...assessments.map(a => a.relevance)) * 0.7 + item.quality * 0.3 + preferenceScore;
    return [{ item, primary, score, hitKeywords, matchedTopicIds: assessments.map(a => a.topicId) }];
  }).sort((a, b) => Number(b.primary) - Number(a.primary) || b.score - a.score || a.item.eventId.localeCompare(b.item.eventId));
}
