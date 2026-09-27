import { useEffect, useRef, useState } from "react";
import { Button } from "./components";
import { MemberApiError } from "./member-api";
import { usePersonalScope, type PersonalComponentProps } from "./member-personal-api";
import { channelLabels, deliveryStatusLabels, loadManagedDeliveries, notificationError, reconcileDelivery, resendDelivery, reviewUnknownDelivery, uncertainNotification, type PersonalDelivery } from "./member-notifications-api";
import { DeliveryHistory } from "./MemberNotifications";
import "./member-notifications.css";

export default function MemberDeliveries({ api, session, onExpired }: PersonalComponentProps) {
  const [deliveries, setDeliveries] = useState<PersonalDelivery[]>([]), [busy, setBusy] = useState(true), [message, setMessage] = useState("");
  const [selected, setSelected] = useState<{ row: PersonalDelivery; action: "resend" | "reconcile" | "review" } | null>(null);
  const [reason, setReason] = useState(""), [duplicate, setDuplicate] = useState(false), [retry, setRetry] = useState(false);
  const pending = useRef<{ intentId: string; requestId: string; reason: string } | null>(null);
  const scope = usePersonalScope(api, session.userId), owner = session.role === "lab_owner";
  const fail = (error: unknown) => { if (error instanceof MemberApiError && error.status === 401) { setDeliveries([]); setSelected(null); pending.current = null; onExpired(); } else { if (error instanceof MemberApiError && error.status === 403) { setDeliveries([]); setSelected(null); } setMessage(notificationError(error)); } };
  const read = async (token: number) => { const result = await loadManagedDeliveries(api); if (scope.current(token)) { setDeliveries(result.deliveries); setSelected(current => current && { ...current, row: result.deliveries.find(row => row.intentId === current.row.intentId) || current.row }); } };
  useEffect(() => {
    const token = scope.capture(); setDeliveries([]); setSelected(null); setMessage(""); setRetry(false); pending.current = null; setBusy(owner);
    if (owner) void read(token).catch(error => { if (scope.current(token)) fail(error); }).finally(() => { if (scope.current(token)) setBusy(false); });
  }, [api, session.userId, session.role]);
  const perform = async (action: (token: number) => Promise<void>) => {
    if (busy) return; const token = scope.capture(); setBusy(true); setMessage("");
    try { await action(token); } catch (error) { if (scope.current(token)) fail(error); } finally { if (scope.current(token)) setBusy(false); }
  };
  const choose = (row: PersonalDelivery, action: "resend" | "reconcile" | "review") => { setSelected({ row, action }); setReason(""); setDuplicate(false); setMessage(""); };
  const reconcile = () => selected && void perform(async token => {
    const result = await reconcileDelivery(api, selected.row.intentId, reason.trim()); if (!scope.current(token)) return;
    setDeliveries(previous => previous.map(row => row.intentId === result.delivery.intentId ? result.delivery : row)); setSelected(null); setReason("");
    setMessage(result.delivery.status === "unknown" ? "平台暂未返回可确认的证据，仍保留结果待核对状态，不会自动重发。" : `已根据平台查询结果更新为“${deliveryStatusLabels[result.delivery.status]}”。这不代表用户已读。`);
  });
  const review = () => selected && duplicate && void perform(async token => {
    const result = await reviewUnknownDelivery(api, selected.row.intentId, reason.trim()); if (!scope.current(token)) return;
    setDeliveries(previous => previous.map(row => row.intentId === result.delivery.intentId ? result.delivery : row)); setSelected(null); setReason(""); setDuplicate(false);
    setMessage("已记录人工核对，平台结果仍为待核对。没有自动补发；需要另行选择补发并确认重复风险。");
  });
  const resend = () => {
    if (!selected || (!pending.current && (!duplicate || reason.trim().length < 4))) return;
    const request = pending.current || { intentId: selected.row.intentId, requestId: crypto.randomUUID(), reason: reason.trim() }; pending.current = request;
    void perform(async token => {
      try {
        const result = await resendDelivery(api, request.intentId, request.requestId, request.reason); if (!scope.current(token)) return;
        pending.current = null; setRetry(false); setSelected(null); setReason(""); setDuplicate(false);
        setDeliveries(previous => [result.delivery, ...previous.filter(row => row.intentId !== result.delivery.intentId)]);
        setMessage(result.idempotent ? "已返回该补发请求的已有任务，没有新建重复任务。" : "已创建补发任务，沿用原记录的固定版本与接收账号。补发原因已记入审计。 ");
      } catch (error) { if (scope.current(token)) { const uncertain = uncertainNotification(error); setRetry(uncertain); if (!uncertain) pending.current = null; if (uncertain) { setMessage("补发请求结果尚未确认。请重试同一请求来核对已有任务。目标、版本和原因已锁定。"); return; } } throw error; }
    });
  };
  if (!owner) return <p role="status">只有管理员可以管理个人投递。</p>;
  const unresolved = (row: PersonalDelivery) => ["queued", "sending", "retryable_failed"].includes(row.status) || (row.status === "unknown" && !row.unknownReviewedAt);
  const hasPendingSibling = (row: PersonalDelivery) => deliveries.some(other => other.intentId !== row.intentId && other.memberId === row.memberId && other.editionId === row.editionId && other.channel === row.channel && unresolved(other));
  const canResend = (row: PersonalDelivery) => (["accepted", "provider_confirmed", "permanent_failed", "cancelled"].includes(row.status) || (row.status === "unknown" && !!row.unknownReviewedAt)) && !hasPendingSibling(row);
  return <section className="member-personal member-notifications" aria-labelledby="member-deliveries-title"><div className="section-head"><div><h2 id="member-deliveries-title">个人投递管理</h2><p>只显示固定版本、接收成员与投递状态，不展示私人简报正文。</p></div><Button disabled={busy} onClick={() => void perform(read)}>刷新投递记录</Button></div>
    <p className="aside-note">平台已受理、平台已确认均不等于用户已读。结果不明时先查询平台，不能直接补发。</p>
    {message && <p role="status" className="aside-note">{message}</p>}{busy && !deliveries.length && <p role="status">正在读取投递记录…</p>}
    {selected && <section className="member-personal-confirm" aria-label={selected.action === "resend" ? "管理员补发确认" : selected.action === "review" ? "人工核对未知结果" : "平台状态核对"}>
      <h3>{selected.action === "resend" ? "确认固定版本与接收目标" : selected.action === "review" ? "记录人工核对" : "核对平台状态"}</h3>
      <p>接收成员：<code>{selected.row.memberId}</code> · {channelLabels[selected.row.channel]}</p><p>固定版本：<code>{selected.row.editionId}</code> · {selected.row.reportDate}</p><p>当前状态：{deliveryStatusLabels[selected.row.status]}</p>
      <div className="member-notification-form"><label>{selected.action === "resend" ? "补发原因" : "核对原因"}<textarea aria-label={selected.action === "resend" ? "补发原因" : "核对原因"} value={reason} minLength={4} maxLength={300} rows={2} disabled={busy || retry} onChange={event => setReason(event.target.value)} /></label>
        {selected.action === "resend" && <label className="member-notification-check"><input type="checkbox" checked={duplicate} disabled={busy || retry} onChange={event => setDuplicate(event.target.checked)} />我已核对原记录，知悉对方可能已经收到；确认按原固定版本与原接收账号补发。</label>}
        {selected.action === "review" && <label className="member-notification-check"><input type="checkbox" checked={duplicate} disabled={busy} onChange={event => setDuplicate(event.target.checked)} />我已在平台核对，仍无法确认结果；知悉后续补发可能重复。</label>}
      </div>
      <div className="member-personal-toolbar">{selected.action === "resend" ? <Button variant="danger" disabled={busy || (!retry && (!duplicate || reason.trim().length < 4 || !canResend(selected.row)))} onClick={resend}>{retry ? "重试同一补发请求" : "确认补发此固定版本"}</Button> : selected.action === "review" ? <Button variant="primary" disabled={busy || reason.trim().length < 4 || !duplicate} onClick={review}>保存人工核对记录</Button> : <Button variant="primary" disabled={busy || reason.trim().length < 4 || !selected.row.canReconcile} onClick={reconcile}>查询平台并核对</Button>}<Button disabled={busy || retry} onClick={() => setSelected(null)}>取消操作</Button></div>
    </section>}
    <DeliveryHistory deliveries={deliveries} admin>{row => <div className="member-personal-toolbar">
      <Button disabled={busy || retry || !row.canReconcile} onClick={() => choose(row, "reconcile")}>核对平台状态</Button><Button disabled={busy || retry || !canResend(row)} onClick={() => choose(row, "resend")}>补发固定版本</Button>
      {row.status === "unknown" && <Button disabled={busy || retry} onClick={() => choose(row, "review")}>记录人工核对</Button>}
      {row.status === "unknown" && !row.canReconcile && <p className="small">此记录缺少可查询的平台凭证，保留待核对状态；自动补发已停止。</p>}
      {row.status === "unknown" && row.unknownReviewedAt && <p className="small">管理员已记录人工核对；平台结果仍无法确认，补发可能重复。</p>}
      {hasPendingSibling(row) && <p className="small">同一版本与渠道已有待处理任务，请先处理该任务，再决定是否补发。</p>}
    </div>}</DeliveryHistory>
  </section>;
}
