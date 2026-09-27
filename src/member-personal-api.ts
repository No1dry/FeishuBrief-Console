import { useEffect, useRef } from "react";
import { z } from "zod";
import { MemberApi, MemberApiError, type MemberSession } from "./member-api";
import { RadarItemSchema } from "./radar-contract";

const Id = z.string().regex(/^[a-f0-9]{64}$/);
const TopicId = z.string().regex(/^[a-z0-9-]+$/).max(60);
const ContentType = z.enum(["paper", "repository", "research", "industry", "opinion", "video"]);
const Keywords = z.array(z.string().trim().min(2).max(100)).max(40);
export const SubscriptionSettingsSchema = z.object({
  primaryTopicId: TopicId, secondaryTopicIds: z.array(TopicId).max(11), subtopicIds: z.record(TopicId, z.array(TopicId).max(20)),
  keywords: Keywords, excludeKeywords: Keywords, codeOnly: z.boolean(), contentTypes: z.array(ContentType).min(1).max(6),
  maxItems: z.number().int().min(1).max(50), primaryShare: z.number().min(0).max(1), preferOpenSource: z.boolean(),
  frequency: z.enum(["daily", "weekdays", "paused"]), channel: z.enum(["in-app", "feishu", "wechat"]), firstEditionLookbackDays: z.union([z.literal(1), z.literal(7)]),
}).strict().refine(v => !v.secondaryTopicIds.includes(v.primaryTopicId) && new Set(v.secondaryTopicIds).size === v.secondaryTopicIds.length, "主次方向不能重复");
export type SubscriptionSettings = z.infer<typeof SubscriptionSettingsSchema>;
const RevisionSchema = SubscriptionSettingsSchema.safeExtend({ schemaVersion: z.literal(1), revisionId: Id, memberId: z.string(), effectiveAt: z.string() });
const SubscriptionEnvelopeSchema = z.object({ revision: z.string().min(1), subscription: RevisionSchema.nullable(), defaults: SubscriptionSettingsSchema.optional() }).refine(v => v.subscription !== null || !!v.defaults, "缺少默认订阅");
export type SubscriptionEnvelope = z.infer<typeof SubscriptionEnvelopeSchema>;
export const TopicSchema = z.object({ id: TopicId, name: z.string(), revisionId: Id, scope: z.string(), subtopics: z.array(z.object({ id: TopicId, name: z.string() })) });
export type MemberTopic = z.infer<typeof TopicSchema>;
export const CapabilitiesSchema = z.object({ schemaVersion: z.literal(1), library: z.boolean(), feedback: z.boolean(), draftPreview: z.boolean(), personalEditions: z.boolean(), notificationBindings: z.boolean().optional(),
  personalDelivery: z.object({ enabled: z.boolean(), phase: z.number(), channels: z.array(z.string()) }), scheduler: z.object({ enabled: z.boolean(), phase: z.number() }), groupDelivery: z.object({ mode: z.string() }) });
export type PersonalCapabilities = z.infer<typeof CapabilitiesSchema>;
const FeedbackRecordSchema = z.object({ feedbackId: z.string(), kind: z.enum(["read", "saved", "not-relevant"]), occurredAt: z.string() });
export const FeedbackStateSchema = z.object({ read: z.boolean(), saved: z.boolean(), notRelevant: z.boolean(), feedback: z.array(FeedbackRecordSchema) });
export type FeedbackState = z.infer<typeof FeedbackStateSchema>;
const FeedbackEnvelopeSchema = z.object({ revision: z.string(), items: z.array(FeedbackStateSchema.extend({ eventId: z.string() })) });
const FeedbackWriteSchema = z.object({ feedbackId: z.string(), targetEventId: z.string(), kind: z.enum(["read", "saved", "not-relevant", "retract"]), occurredAt: z.string(), retractsFeedbackId: z.string().nullable() });
const DisplayItemSchema = z.object(RadarItemSchema.shape);
export const LibraryEntrySchema = z.object({ item: DisplayItemSchema, origin: z.enum(["current", "saved-history"]), feedback: FeedbackStateSchema });
export type LibraryEntry = z.infer<typeof LibraryEntrySchema>;
const LibrarySchema = z.object({ items: z.array(LibraryEntrySchema), currentAvailable: z.boolean() });
const EditionItemSchema = z.object({ item: DisplayItemSchema, assignedTopicId: TopicId, slot: z.enum(["primary", "secondary", "fill"]),
  score: z.object({ relevance: z.number(), quality: z.number(), freshness: z.number(), preference: z.number(), total: z.number() }),
  hitKeywords: z.array(z.string()), matchedTopicIds: z.array(TopicId), updateKey: z.string(), recap: z.boolean(), update: z.boolean(), reasons: z.array(z.string()) });
// The API deliberately omits diagnostics. This display projection is not a replayable engine contract.
export const EditionSchema = z.object({ editionId: Id, memberId: z.string(), reportDate: z.string(), reportTimeZone: z.string(), cutoffAt: z.string(),
  inputs: z.object({ subscriptionRevisionId: Id }), topics: z.array(TopicSchema), status: z.enum(["ready", "no-content", "paused", "not-scheduled"]),
  firstEdition: z.boolean(), windowDays: z.number(), windowStartDate: z.string(), channel: z.enum(["in-app", "feishu", "wechat"]), externalSendAllowed: z.literal(false),
  items: z.array(EditionItemSchema), quota: z.object({ maxItems: z.number(), primaryTarget: z.number(), primarySelected: z.number(), secondarySelected: z.number(), fillSelected: z.number(), secondaryOrder: z.array(TopicId), unfilled: z.number() }) });
export type DisplayEdition = z.infer<typeof EditionSchema>;
const EditionEnvelopeSchema = z.object({ edition: EditionSchema, finalized: z.boolean(), draft: z.boolean().optional(), idempotent: z.boolean().optional() });
export type EditionEnvelope = z.infer<typeof EditionEnvelopeSchema>;
const EditionHistorySchema = z.object({ editions: z.array(z.object({ editionId: Id, reportDate: z.string(), cutoffAt: z.string(), status: z.enum(["ready", "no-content", "paused", "not-scheduled"]), count: z.number().int().nonnegative(), finalized: z.boolean() })).max(100) });
export type EditionSummary = z.infer<typeof EditionHistorySchema>["editions"][number];
export interface PersonalComponentProps { api: MemberApi; session: MemberSession; onExpired: () => void; onNavigate: (path: string) => void }
export const contentTypeLabels: Record<SubscriptionSettings["contentTypes"][number], string> = { paper: "论文", repository: "代码仓库", research: "研究进展", industry: "产业动态", opinion: "观点", video: "视频" };
export const editionStatusLabels: Record<DisplayEdition["status"], string> = { ready: "有更新", "no-content": "暂无合格更新", paused: "订阅已暂停", "not-scheduled": "不在订阅日期" };
export const emptyFeedback = (): FeedbackState => ({ read: false, saved: false, notRelevant: false, feedback: [] });
export function settingsOf(value: SubscriptionEnvelope): SubscriptionSettings {
  const source = value.subscription ?? value.defaults!;
  return SubscriptionSettingsSchema.parse(Object.fromEntries(Object.keys(SubscriptionSettingsSchema.shape).map(key => [key, source[key as keyof SubscriptionSettings]])));
}
export const loadTopics = async (api: MemberApi) => z.object({ topics: z.array(TopicSchema) }).parse(await api.request("topics"));
export const loadCapabilities = async (api: MemberApi) => CapabilitiesSchema.parse(await api.request("capabilities"));
export const loadSubscription = async (api: MemberApi) => SubscriptionEnvelopeSchema.parse(await api.request("subscription"));
export const saveSubscription = async (api: MemberApi, baseRevision: string, subscription: SubscriptionSettings) => SubscriptionEnvelopeSchema.parse(await api.request("subscription", "PUT", { baseRevision, subscription: SubscriptionSettingsSchema.parse(subscription) }));
export const previewSubscription = async (api: MemberApi, subscription: SubscriptionSettings) => EditionEnvelopeSchema.parse(await api.request("preview", "POST", { subscription: SubscriptionSettingsSchema.parse(subscription) }));
export const previewSaved = async (api: MemberApi, subscriptionRevisionId: string) => EditionEnvelopeSchema.parse(await api.request("preview", "POST", { subscriptionRevisionId }));
export const loadEditions = async (api: MemberApi) => EditionHistorySchema.parse(await api.request("editions"));
export const loadEdition = async (api: MemberApi, editionId: string) => EditionEnvelopeSchema.parse(await api.request(`editions/${Id.parse(editionId)}`));
export const createEdition = async (api: MemberApi, requestId: string, subscriptionRevisionId: string) => EditionEnvelopeSchema.parse(await api.request("editions", "POST", { requestId, subscriptionRevisionId }));
export const loadFeedback = async (api: MemberApi) => FeedbackEnvelopeSchema.parse(await api.request("feedback"));
export const loadLibrary = async (api: MemberApi) => LibrarySchema.parse(await api.request("library"));
export const updateFeedback = async (api: MemberApi, targetEventId: string, kind: "read" | "saved" | "not-relevant") => FeedbackWriteSchema.parse(await api.request("feedback", "POST", { targetEventId, kind }));
export const revokeFeedback = async (api: MemberApi, targetEventId: string, retractsFeedbackId: string) => FeedbackWriteSchema.parse(await api.request("feedback", "POST", { targetEventId, kind: "retract", retractsFeedbackId }));
export function personalError(error: unknown) {
  if (error instanceof MemberApiError) {
    const messages: Record<string, string> = { read_only: "当前账号为只读，无法执行此操作。", forbidden: "当前账号没有执行此操作的权限。", no_readable_topics: "当前账号没有可读主题，请联系管理员。", content_unavailable: "共享内容暂未就绪，请稍后重试。", topics_changed: "主题目录已变化，请重新读取并调整订阅。", subscription_required: "请先保存个人订阅，再生成站内简报。", edition_unavailable: "该简报涉及已撤回内容或权限变化，当前无法查看。", not_found: "内容不存在或当前账号无权访问。", edition_integrity: "简报校验未通过，请联系管理员。", revision_conflict: "订阅已在其他页面更新，草稿已保留。请读取最新版本并明确合并后提交。", request_conflict: "该生成请求对应的订阅已变化，请读取最新订阅后重新生成。" };
    return messages[error.code] || error.message;
  }
  if (error instanceof z.ZodError) return "服务返回的内容格式不符合约定，已停止显示，请重试或联系管理员。";
  return "请求未完成，请稍后重试。";
}
/** Every continuation must retain the captured generation, not just a mounted boolean. */
export function usePersonalScope(api: MemberApi, identity = "") {
  const generation = useRef(0);
  useEffect(() => { generation.current++; return () => { generation.current++; }; }, [api, identity]);
  return { capture: () => generation.current, current: (token: number) => token === generation.current && !api.isClosed };
}
