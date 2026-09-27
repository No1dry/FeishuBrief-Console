import { useEffect, useRef, useState } from "react";
import { Button } from "./components";
import { MemberApiError } from "./member-api";
import { invitationStatusLabels, loadAudit, loadInvitations, loadOperations, type ManagedAuditEvent, type ManagedInvitation, type MemberOperationsSnapshot, type ManagementProps } from "./member-management-api";
import "./member-management.css";
import { deliveryStatusLabels } from "./member-notifications-api";

const time = (value: string | number | null) => value === null ? "暂无" : new Date(value).toLocaleString();
const short = (value: string | null) => value ? value.length > 16 ? `${value.slice(0, 12)}…` : value : "系统";
const auditLabels: Record<string, string> = { "owner.bootstrap": "初始化管理员", "auth.login": "成员登录", "auth.logout": "成员退出", "auth.mail_failed": "验证码邮件失败", "invitation.created": "创建邀请", "invitation.accepted": "接受邀请", "invitation.mail_failed": "邀请邮件失败", "member.updated": "更新成员权限", "topic.update": "更新主题", "topic.delete": "删除主题", "edition.create": "固定个人版本", "feedback.create": "记录个人反馈", "content.revoke": "撤回内容", "content.import": "导入共享内容" };
Object.assign(auditLabels, { "notification.binding_start": "开始接收账号验证", "notification.bound": "验证并绑定接收账号", "notification.unbound": "解绑接收账号", "notification.schedule_update": "调整个人定时投递", "notification.enqueue": "建立个人发送任务", "notification.admin_resend": "管理员确认补发", "notification.unknown_review": "记录未知结果人工核对", "notification.reconcile": "核对平台发送结果", "notification.result": "更新个人发送状态" });
const auditFields: Record<string, string> = { role: "角色", status: "状态", count: "条数", finalized: "已固定", kind: "反馈类型", fromRevision: "原版本", toRevision: "新版本", reason: "原因", channel: "渠道", enabled: "启用", localTime: "投递时间", attempt: "尝试次数", statusRemainsUnknown: "结果仍未知" };
const summary = (event: ManagedAuditEvent) => Object.entries(event.metadata).filter(([key, value]) => key in auditFields && ["string", "number", "boolean"].includes(typeof value)).map(([key, value]) => `${auditFields[key]}：${key === "status" && String(value) in deliveryStatusLabels ? deliveryStatusLabels[value as keyof typeof deliveryStatusLabels] : typeof value === "boolean" ? value ? "是" : "否" : String(value)}`).join(" · ");

export default function MemberOperations({ api, session, onExpired, onNavigate }: ManagementProps) {
  const [operations, setOperations] = useState<MemberOperationsSnapshot | null>(null);
  const [audit, setAudit] = useState<ManagedAuditEvent[]>([]);
  const [invitations, setInvitations] = useState<ManagedInvitation[]>([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const allowed = session.role === "lab_owner";
  const valid = (id: number) => id === generation.current && !api.isClosed;
  const read = async (id: number) => {
    const [snapshot, events, invites] = await Promise.all([loadOperations(api), loadAudit(api), loadInvitations(api)]);
    if (!valid(id)) return;
    setOperations(snapshot); setAudit(events.events); setInvitations(invites.invitations);
  };
  const report = (error: unknown, id: number) => {
    if (!valid(id)) return;
    setOperations(null); setAudit([]); setInvitations([]);
    if (error instanceof MemberApiError && error.status === 401) { onExpired(); return; }
    setMessage(error instanceof Error ? error.message : "运营状态读取失败。");
  };
  useEffect(() => {
    const id = ++generation.current; setOperations(null); setAudit([]); setInvitations([]); setMessage(""); setBusy(allowed);
    if (allowed) void read(id).catch(e => report(e, id)).finally(() => { if (valid(id)) setBusy(false); });
    return () => { generation.current++; };
  }, [api, session.userId, session.role]);
  if (!allowed) return <section className="mm-section"><h2>运营状态</h2><p role="status">只有管理员可以查看运营状态和审计。</p></section>;
  return <section className="mm-section" aria-labelledby="mm-operations-title">
    <header className="mm-heading"><div><h2 id="mm-operations-title">运营状态</h2><p>共享内容、站内组装与管理员操作。这里不展示其他成员的私人简报正文。</p></div><Button disabled={busy} onClick={() => { const id = generation.current; setBusy(true); setMessage(""); void read(id).catch(e => report(e, id)).finally(() => { if (valid(id)) setBusy(false); }); }}>刷新运营状态</Button></header>
    {message && <p role="status" className="mm-notice">{message}</p>}{busy && !operations && <p role="status">正在读取运营状态…</p>}
    {operations && <>
      <p className="mm-help">截至 {time(operations.generatedAt)}</p>
      <dl className="mm-metrics"><div><dt>已验证导入</dt><dd>{operations.content.readyImports}</dd></div><div><dt>启用主题</dt><dd>{operations.content.activeTopics}</dd></div><div><dt>已撤回内容</dt><dd>{operations.content.revokedRevisions}</dd></div><div><dt>已固定个人版本</dt><dd>{operations.assembly.officialEditions}</dd></div></dl>
      {!operations.content.currentCatalogReady && <aside className="mm-note">当前主题目录尚无可用的匹配内容。请同步主题后重新评估并导入，旧目录批次不会自动满足新规则。</aside>}
      <section className="mm-panel" aria-labelledby="mm-batches-title"><h3 id="mm-batches-title">共享内容批次</h3><p className="mm-help">只列出成功完成校验和原子导入的记录。导入失败未形成 ready 批次，不在此虚构运行记录。</p>
        {operations.content.latestImports.length ? <div className="mm-table-wrap"><table><thead><tr><th>报告日期</th><th>批次</th><th>导入时间</th><th>内容状态</th><th>当前目录</th></tr></thead><tbody>{operations.content.latestImports.map(batch => <tr key={batch.exportId}><td>{batch.reportDate}</td><td><code title={batch.exportId}>{short(batch.exportId)}</code><small>截止 {time(batch.cutoffAt)}</small></td><td>{time(batch.importedAt)}</td><td>已验证导入</td><td>{batch.catalogCurrent ? "匹配" : "需重新评估"}</td></tr>)}</tbody></table></div> : <p className="mm-empty">暂无已验证的导入批次。导入共享内容后才会生成统计。</p>}
      </section>
      <div className="mm-grid"><section className="mm-panel"><h3>站内组装</h3><p>共享内容按订阅组装，不会新增模型调用。</p><dl className="mm-detail"><dt>全部已保存版本</dt><dd>{operations.assembly.editions}</dd><dt>有版本的成员数</dt><dd>{operations.assembly.membersWithEditions}</dd><dt>最近生成</dt><dd>{time(operations.assembly.lastCreatedAt)}</dd></dl></section><section className="mm-panel"><h3>个人发送与调度</h3>
        {operations.delivery.worker ? <><p>个人发送：{operations.delivery.enabled ? "已启用" : "尚未启用"} · 定时调度：{operations.scheduler.enabled ? "已启用" : "尚未启用"}</p><dl className="mm-detail"><dt>队列处理</dt><dd>{operations.delivery.worker.running ? "处理中" : operations.delivery.worker.started ? "等待下一轮" : "尚未启动"}</dd><dt>最近处理完成</dt><dd>{time(operations.delivery.worker.lastFinishedAt)}</dd><dt>最近结果</dt><dd>{operations.delivery.worker.lastOutcome === "failed" ? "失败，请检查服务日志" : operations.delivery.worker.lastOutcome === "ok" ? "已完成" : "尚未运行"}</dd></dl>
          <p className="mm-help">最近 {operations.delivery.records.length} 条记录：{Object.entries(deliveryStatusLabels).map(([status, label]) => { const count = operations.delivery.records.filter(row => row.status === status).length; return count ? `${label} ${count}` : ""; }).filter(Boolean).join(" · ") || "暂无"}。</p><Button onClick={() => onNavigate("/app/deliveries")}>管理个人投递</Button></> : <><p>个人发送与调度尚未启用。</p><p className="mm-empty">暂无个人发送记录。这里没有运行中的个人定时任务。</p></>}
        <p className="mm-help">预览、保存订阅、生成站内版本不会立即发送消息。平台状态不代表用户已读。</p></section></div>
      <aside className="mm-note"><strong>群体完整简报继续使用现有引擎。</strong><p><a href="/admin#/runs">打开原运行中心</a> · <a href="/admin#/reports">查看群体报告</a></p><p className="mm-help">这两个入口属于原管理员工作台，按原 GitHub 管理认证使用。</p></aside>
    </>}
    {!busy && !message && <>
      <section className="mm-panel"><h3>邀请状态</h3>{invitations.length ? <div className="mm-table-wrap"><table><thead><tr><th>受邀邮箱</th><th>状态</th><th>有效期至</th></tr></thead><tbody>{invitations.map(invite => <tr key={invite.invitationId}><td>{invite.email}</td><td>{invitationStatusLabels[invite.status]}</td><td>{time(invite.expiresAt)}</td></tr>)}</tbody></table></div> : <p className="mm-empty">尚未创建成员邀请。</p>}</section>
      <section className="mm-panel"><h3>审计记录</h3><p className="mm-help">最近最多 200 条。身份和目标仅显示标识，验证码、邀请令牌和会话密钥不会出现在记录中。</p>{audit.length ? <ol className="mm-audit">{audit.map(event => <li key={event.id}><div><strong>{auditLabels[event.action] ?? event.action}</strong><time dateTime={new Date(event.createdAt).toISOString()}>{time(event.createdAt)}</time></div><p>操作方 {short(event.actorId)} · 对象 {short(event.targetId)}</p>{summary(event) && <p>{summary(event)}</p>}</li>)}</ol> : <p className="mm-empty">暂无可显示的审计记录。</p>}</section>
    </>}
  </section>;
}
