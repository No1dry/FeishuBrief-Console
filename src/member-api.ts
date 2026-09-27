import { z } from "zod";
import { RadarSchema, RadarPreferencesSchema, type RadarPreferences } from "./radar-contract";

export const MemberRoleSchema = z.enum(["lab_owner", "topic_owner", "member", "viewer"]);
const SessionSchema = z.object({
  userId: z.string().min(1), displayName: z.string(), csrfToken: z.string().min(1), preferencesEnabled: z.boolean(),
  role: MemberRoleSchema.optional(), ownedTopicIds: z.array(z.string()).optional(), readTopicIds: z.array(z.string()).optional(),
}).strict();
export type MemberSession = z.infer<typeof SessionSchema>;
export type MemberRole = z.infer<typeof MemberRoleSchema>;
const PreferencesEnvelope = z.object({ revision: z.string().min(1), preferences: RadarPreferencesSchema }).strict();
const MemberSchema = z.object({
  userId: z.string().min(1), email: z.string(), displayName: z.string(), role: MemberRoleSchema,
  ownedTopicIds: z.array(z.string()).default([]), readTopicIds: z.array(z.string()).default([]),
  status: z.enum(["invited", "active", "disabled"]), revision: z.number().int().positive(),
});
export type ManagedMember = z.infer<typeof MemberSchema>;
const CapabilitiesSchema = z.object({
  schemaVersion: z.literal(1), library: z.boolean(), feedback: z.boolean(), draftPreview: z.boolean(), personalEditions: z.boolean(),
  personalDelivery: z.object({ enabled: z.boolean(), phase: z.number(), channels: z.array(z.string()) }),
  notificationBindings: z.boolean().optional(),
  scheduler: z.object({ enabled: z.boolean(), phase: z.number() }), groupDelivery: z.object({ mode: z.literal("existing-engine") }),
});
export type MemberCapabilities = z.infer<typeof CapabilitiesSchema>;
export class MemberApiError extends Error {
  constructor(public status: number, message: string, public code = "") { super(message); }
}
export class MemberApi {
  private controller = new AbortController();
  private csrf = "";
  get isClosed() { return this.controller.signal.aborted; }
  close() { this.csrf = ""; this.controller.abort(); }
  async request(route: string, method = "GET", body?: unknown, preauth = false): Promise<unknown> {
    if (!/^[a-z0-9][a-z0-9/-]*$/.test(route) || route.includes("..") || route.startsWith("machine/")) throw new Error("Invalid member route");
    const response = await fetch(`/api/member/${route}`, {
      method, credentials: "same-origin", cache: "no-store", redirect: "error",
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]),
      headers: { Accept: "application/json", ...(method !== "GET" ? { "Content-Type": "application/json", ...(!preauth ? { "X-CSRF-Token": this.csrf } : {}) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: unknown } | null;
      const messages: Record<string, string> = {
        last_owner: "至少需要保留一位启用的管理员，无法执行此操作。",
        email_verification_required: "该成员尚未验证邮箱，请重新发送邀请并由成员完成验证。",
        member_already_exists: "该邮箱已有成员账号，请在成员列表中修改权限。",
        owner_already_exists: "初始管理员已经创建，请使用受邀邮箱登录。",
        email_already_exists: "该邮箱已有账号。",
        mail_unavailable: "邮件发送失败，请联系管理员检查邮件服务后重试。",
        member_not_found: "成员已不存在，请刷新成员列表。",
        subscription_required: "请先保存个人订阅。",
        topics_changed: "主题目录或阅读权限已变化，请重新选择主次方向。",
        content_unavailable: "暂无匹配当前主题的合格内容，请等待共享内容更新。",
        no_readable_topics: "尚未获授主题阅读权限，请联系组内管理员。",
        edition_unavailable: "这个版本涉及已撤回内容或已变化的权限，暂不可查看。",
        edition_integrity: "个人简报校验失败，请联系管理员。",
        read_only: "当前账号为只读，无法修改内容。",
        forbidden: "当前账号没有此项操作权限。",
        empty_catalog: "至少保留一个启用且权重大于零的主题。",
        topic_limit: "最多支持十二个主题。",
        history_changed: "上一版本刚刚生成，请稍后重新预览。",
        request_conflict: "该成版请求已用于其他订阅版本，请重新读取。",
        not_found: "内容不存在或当前账号无权查看。",
        already_retracted: "该反馈已撤回，请刷新状态。",
      };
      const specific = !preauth && typeof payload?.error === "string" ? messages[payload.error] : undefined;
      throw new MemberApiError(response.status, specific ?? (
      response.status === 409 ? "内容已在其他页面更新。请重新读取后合并。" :
      response.status === 429 ? "请求过于频繁，请稍后再试。" :
      preauth && (response.status === 400 || response.status === 401 || response.status === 403) ? "验证码无效或已过期，请检查后重试；新成员需要管理员邀请。" :
      response.status === 401 || response.status === 403 ? "会话已失效或无权访问，请重新登录。" :
      response.status === 404 || response.status === 501 ? "成员服务尚未开放。" :
      response.status === 400 ? "提交内容不符合要求，请检查邮箱、角色及主题设置。" : "成员服务暂时不可用，请稍后重试。"), typeof payload?.error === "string" ? payload.error : "");
    }
    if (response.status === 204) return null;
    if (!response.headers.get("content-type")?.includes("application/json")) throw new MemberApiError(501, "成员服务尚未开放。");
    return response.json();
  }
  async session() { const session = SessionSchema.parse(await this.request("session")); this.csrf = session.csrfToken; return session; }
  async capabilities() { return CapabilitiesSchema.parse(await this.request("capabilities")); }
  async requestCode(email: string, invitationToken?: string) {
    return z.object({ challengeId: z.string().min(1) }).parse(await this.request("auth/request-code", "POST", { email, ...(invitationToken ? { invitationToken } : {}) }, true));
  }
  async verifyCode(challengeId: string, code: string) {
    const session = SessionSchema.parse(await this.request("auth/verify-code", "POST", { challengeId, code }, true));
    this.csrf = session.csrfToken; return session;
  }
  async radar() { return RadarSchema.parse(await this.request("radar")); }
  async preferences() { return PreferencesEnvelope.parse(await this.request("preferences")); }
  async save(preferences: RadarPreferences, baseRevision: string) {
    if (!this.csrf) throw new MemberApiError(401, "请先登录");
    return PreferencesEnvelope.parse(await this.request("preferences", "PUT", { preferences: RadarPreferencesSchema.parse(preferences), baseRevision }));
  }
  async members() { return z.object({ members: z.array(MemberSchema) }).parse(await this.request("admin/members")); }
  async invite(input: { email: string; displayName?: string; role: MemberRole; ownedTopicIds: string[]; readTopicIds: string[] }) {
    return z.object({ invitation: z.object({ invitationId: z.string(), email: z.string(), expiresAt: z.number(), status: z.string() }) }).parse(await this.request("admin/invitations", "POST", input));
  }
  async updateMember(userId: string, input: { baseRevision: number; role?: MemberRole; ownedTopicIds?: string[]; readTopicIds?: string[]; status?: "active" | "disabled" }) {
    await this.request(`admin/members/${encodeURIComponent(userId)}`, "PUT", input);
  }
  async logout() { try { await this.request("logout", "POST", {}); } finally { this.close(); } }
}
