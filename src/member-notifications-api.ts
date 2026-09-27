import { z } from "zod";
import { MemberApi, MemberApiError } from "./member-api";

const Id = z.string().regex(/^[a-zA-Z0-9-]+$/).max(100);
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Iso = z.string().datetime({ offset: true });
export const ChannelSchema = z.enum(["feishu", "wechat"]);
export type NotificationChannel = z.infer<typeof ChannelSchema>;
export const channelLabels = { feishu: "飞书", wechat: "微信（PushPlus）" };
export const BindingSchema = z.object({ bindingId: Id, channel: ChannelSchema, status: z.enum(["active", "unbound"]), displayName: z.string(), verifiedAt: Iso });
export type NotificationBinding = z.infer<typeof BindingSchema>;
export const ChallengeSchema = z.object({ challengeId: Id, channel: ChannelSchema,
  status: z.enum(["waiting", "awaiting-confirmation", "awaiting-code", "complete", "expired", "failed"]), expiresAt: Iso,
  code: z.string().optional(), qrCodeUrl: z.string().regex(/^\/api\/member\/notifications\/challenges\/[a-zA-Z0-9-]+\/qr$/).optional(), displayName: z.string().optional() });
export type BindingChallenge = z.infer<typeof ChallengeSchema>;
export const ScheduleSchema = z.object({ revision: z.string().min(1), enabled: z.boolean(), localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timeZone: z.literal("Asia/Shanghai"), systemEnabled: z.boolean() });
export type DeliverySchedule = z.infer<typeof ScheduleSchema>;
export const DeliverySchema = z.object({ intentId: Id, editionId: Hash, memberId: z.string(), reportDate: z.string(), channel: ChannelSchema,
  status: z.enum(["queued", "sending", "accepted", "provider_confirmed", "retryable_failed", "permanent_failed", "unknown", "cancelled"]),
  attempts: z.number().int().nonnegative(), nextAttemptAt: Iso.nullable(), createdAt: Iso, updatedAt: Iso,
  providerMessageId: z.string().nullable().optional(), errorCode: z.string().nullable().optional(), sourceIntentId: z.string().nullable().optional(), reason: z.string().nullable().optional(), canReconcile: z.boolean().optional(), unknownReviewedAt: Iso.nullable().optional() });
export type PersonalDelivery = z.infer<typeof DeliverySchema>;
export const deliveryStatusLabels: Record<PersonalDelivery["status"], string> = {
  queued: "待发送", sending: "发送中", accepted: "平台已受理", provider_confirmed: "平台已确认", retryable_failed: "等待安全重试", permanent_failed: "发送失败", unknown: "结果待核对", cancelled: "已取消",
};
const OverviewSchema = z.object({ channels: z.array(z.object({ channel: ChannelSchema, configured: z.boolean() })), bindings: z.array(BindingSchema), schedule: ScheduleSchema, deliveries: z.array(DeliverySchema) });
export type NotificationOverview = z.infer<typeof OverviewSchema>;
const DeliveryResultSchema = z.object({ delivery: DeliverySchema, idempotent: z.boolean().optional() });
export const loadNotifications = async (api: MemberApi) => OverviewSchema.parse(await api.request("notifications"));
export const startBinding = async (api: MemberApi, channel: NotificationChannel) => ChallengeSchema.parse(await api.request(`notifications/bindings/${channel}/start`, "POST", {}));
export const loadChallenge = async (api: MemberApi, challengeId: string) => ChallengeSchema.parse(await api.request(`notifications/challenges/${Id.parse(challengeId)}`));
export const confirmBinding = async (api: MemberApi, challengeId: string, code?: string) => z.object({ binding: BindingSchema }).parse(await api.request(`notifications/challenges/${Id.parse(challengeId)}/confirm`, "POST", code ? { code } : {})).binding;
export const unbind = async (api: MemberApi, bindingId: string) => api.request(`notifications/bindings/${Id.parse(bindingId)}`, "DELETE", {});
export const saveSchedule = async (api: MemberApi, schedule: DeliverySchedule, enabled: boolean, localTime: string) => ScheduleSchema.parse(await api.request("notifications/schedule", "PUT", { baseRevision: schedule.revision, enabled, localTime, timeZone: schedule.timeZone }));
export const requestDelivery = async (api: MemberApi, input: { requestId: string; editionId: string; channel: NotificationChannel }) => DeliveryResultSchema.parse(await api.request("notifications/deliveries", "POST", { ...input, confirmSend: true }));
export const loadManagedDeliveries = async (api: MemberApi) => z.object({ deliveries: z.array(DeliverySchema) }).parse(await api.request("admin/deliveries"));
export const resendDelivery = async (api: MemberApi, intentId: string, requestId: string, reason: string) => DeliveryResultSchema.parse(await api.request(`admin/deliveries/${Id.parse(intentId)}/resend`, "POST", { requestId, reason, confirmDuplicate: true }));
export const reconcileDelivery = async (api: MemberApi, intentId: string, reason: string) => DeliveryResultSchema.parse(await api.request(`admin/deliveries/${Id.parse(intentId)}/reconcile`, "POST", { reason }));
export const reviewUnknownDelivery = async (api: MemberApi, intentId: string, reason: string) => DeliveryResultSchema.parse(await api.request(`admin/deliveries/${Id.parse(intentId)}/review`, "POST", { reason, confirmUnknown: true }));
export const uncertainNotification = (error: unknown) => !(error instanceof MemberApiError) || error.status >= 500;
export function notificationError(error: unknown) {
  if (error instanceof MemberApiError) {
    const messages: Record<string, string> = {
      channel_unconfigured: "该渠道尚未配置，请联系管理员。", already_bound: "这个渠道已经绑定，请刷新查看接收账号。", invalid_code: "绑定验证码无效，请检查后重试。", verification_locked: "验证码尝试次数已达上限，请重新开始绑定。", challenge_not_ready: "平台身份验证尚未完成，请检查绑定进度。", binding_provider_unavailable: "绑定服务暂时不可用，请联系管理员检查平台配置。",
      channel_changed: "接收渠道与当前订阅不一致，请先调整订阅。", subscription_changed: "订阅已改变，旧任务已停止。请重新读取后操作。", binding_changed: "原接收绑定已失效，不能将固定任务改投其他账号。", delivery_exists: "这个固定版本已有投递记录，请查看记录；需要重复发送时由管理员核对后补发。", delivery_unresolved: "原投递尚未结束或结果未知，请先核对后再决定补发。", provider_query_unavailable: "此记录缺少可查询的平台凭证，请先在平台人工核对并记录原因。", delivery_changed: "投递状态已变化，请刷新后重新核对。", request_conflict: "同一请求已对应另一投递，已停止操作，请刷新记录。", delivery_integrity: "固定版本校验失败，已停止发送，请联系管理员。", review_not_required: "只有结果未知的记录需要人工核对，请刷新查看当前状态。", reconcile_not_required: "此记录状态已经变化，请刷新查看。",
      channel_unavailable: "该渠道尚未配置，请联系管理员。", delivery_disabled: "个人发送服务尚未启用，请联系管理员。", scheduler_disabled: "定时调度尚未启用，可先保存关闭状态。",
      binding_required: "请先完成这个渠道的身份绑定。", binding_conflict: "这个平台账号已经绑定，请联系管理员核对。", challenge_expired: "绑定验证已过期，请重新开始。", challenge_invalid: "绑定验证码无效，请检查后重试。", verification_failed: "验证码无效或验证尚未完成。",
      subscription_paused: "订阅已暂停，未发送任务会取消。请先恢复订阅。", channel_mismatch: "接收渠道与当前订阅不一致，请先调整订阅。", edition_not_ready: "只有包含合格内容的固定个人版本可以发送。",
      unknown_delivery: "发送结果尚未核对，不能直接重发。", delivery_unknown: "发送结果尚未核对，不能直接重发。", reconcile_unavailable: "该渠道暂不支持自动核对，请由管理员检查平台记录。", revision_conflict: "设置已在其他页面更新。你的时间草稿已保留，请读取最新设置后重新确认。",
    };
    return messages[error.code] || error.message;
  }
  if (error instanceof z.ZodError) return "通知服务返回的数据格式不兼容，请联系管理员更新服务。";
  return "请求尚未确认，请读取最新状态后再操作。";
}
