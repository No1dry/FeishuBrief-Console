import { z } from "zod";
import { configSchema } from "./policy";
import { MemberApi, type MemberSession } from "./member-api";
import { DeliverySchema } from "./member-notifications-api";

export interface ManagementProps { api: MemberApi; session: MemberSession; onExpired: () => void; onNavigate: (path: string) => void }
export const ManagedTopicSchema = configSchema.shape.researchTopics.element;
export type ManagedTopic = z.infer<typeof ManagedTopicSchema>;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const iso = z.string().datetime({ offset: true });
const ProfileSchema = z.object({ protocol: z.literal("topic-profile-v1"), revisionId: hash, topic: ManagedTopicSchema }).strict();
export type ManagedTopicProfile = z.infer<typeof ProfileSchema>;
const CatalogSchema = z.object({ revision: hash, profiles: z.array(ProfileSchema).max(12) }).strict();
export const InvitationSchema = z.object({ invitationId: z.string(), userId: z.string(), email: z.string(), expiresAt: z.number(), status: z.enum(["pending", "accepted", "revoked", "expired"]) }).strict();
export type ManagedInvitation = z.infer<typeof InvitationSchema>;
const AuditEventSchema = z.object({ id: z.string(), actorId: z.string().nullable(), action: z.string(), targetId: z.string().nullable(), metadata: z.record(z.string(), z.unknown()), createdAt: z.number() }).strict();
export type ManagedAuditEvent = z.infer<typeof AuditEventSchema>;
const OperationsSchema = z.object({
  generatedAt: iso,
  content: z.object({ readyImports: z.number().int().nonnegative(), revokedRevisions: z.number().int().nonnegative(), activeTopics: z.number().int().nonnegative(), catalogRevision: hash,
    currentCatalogReady: z.boolean(), latestImports: z.array(z.object({ exportId: hash, snapshotId: hash, reportDate: z.string(), cutoffAt: iso, generatedAt: iso, importedAt: iso, status: z.literal("ready"), catalogCurrent: z.boolean() }).strict()) }).strict(),
  assembly: z.object({ status: z.literal("on-demand"), editions: z.number().int().nonnegative(), officialEditions: z.number().int().nonnegative(), membersWithEditions: z.number().int().nonnegative(), lastCreatedAt: iso.nullable() }).strict(),
  delivery: z.object({ enabled: z.boolean(), phase: z.literal(6), records: z.array(DeliverySchema), counts: z.record(z.string(), z.number().int().nonnegative()).optional(), worker: z.object({ enabled: z.boolean(), running: z.boolean(), started: z.boolean(), lastStartedAt: iso.nullable(), lastFinishedAt: iso.nullable(), lastOutcome: z.enum(["idle", "ok", "failed"]) }).optional() }).strict(),
  scheduler: z.object({ enabled: z.boolean(), phase: z.literal(6), timeZone: z.literal("Asia/Shanghai").optional(), configuredMembers: z.number().int().nonnegative().optional(), enabledMembers: z.number().int().nonnegative().optional(), lastRunAt: iso.nullable().optional() }).strict(),
  groupDelivery: z.object({ mode: z.literal("existing-engine") }).strict(),
}).strict();
export type MemberOperationsSnapshot = z.infer<typeof OperationsSchema>;
function validated<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("管理服务返回的数据格式不兼容，请联系管理员更新服务。");
  return result.data;
}
export async function loadTopicCatalog(api: MemberApi) { return validated(CatalogSchema, await api.request("admin/topics")); }
export async function saveTopic(api: MemberApi, topic: ManagedTopic, baseRevision: string) {
  return validated(z.object({ profile: ProfileSchema, reprocessingRequired: z.literal(true) }).strict(), await api.request(`admin/topics/${encodeURIComponent(topic.id)}`, "PUT", { baseRevision, profile: ManagedTopicSchema.parse(topic) }));
}
export async function deleteTopic(api: MemberApi, topicId: string, baseRevision: string) {
  return validated(z.object({ revision: hash, deleted: z.literal(true), reprocessingRequired: z.literal(true) }).strict(), await api.request(`admin/topics/${encodeURIComponent(topicId)}`, "DELETE", { baseRevision }));
}
export async function loadOperations(api: MemberApi) { return validated(OperationsSchema, await api.request("admin/operations")); }
export async function loadAudit(api: MemberApi) { return validated(z.object({ events: z.array(AuditEventSchema) }).strict(), await api.request("admin/audit")); }
export async function loadInvitations(api: MemberApi) { return validated(z.object({ invitations: z.array(InvitationSchema) }).strict(), await api.request("admin/invitations")); }
export const invitationStatusLabels: Record<ManagedInvitation["status"], string> = { pending: "待接受", accepted: "已接受", expired: "已过期", revoked: "已撤销" };
