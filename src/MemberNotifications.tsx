import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "./components";
import { MemberApiError, type MemberCapabilities } from "./member-api";
import { loadEditions, loadSubscription, usePersonalScope, type EditionSummary, type PersonalComponentProps, type SubscriptionEnvelope } from "./member-personal-api";
import { channelLabels, confirmBinding, deliveryStatusLabels, loadChallenge, loadNotifications, notificationError, requestDelivery, saveSchedule, startBinding, unbind, uncertainNotification,
  type BindingChallenge, type NotificationBinding, type NotificationChannel, type NotificationOverview, type PersonalDelivery } from "./member-notifications-api";
import "./member-personal.css";
import "./member-notifications.css";

export const notificationTime = (value: string | null) => value ? new Date(value).toLocaleString() : "暂无";
export function DeliveryHistory({ deliveries, onNavigate, admin = false, children }: { deliveries: PersonalDelivery[]; onNavigate?: (path: string) => void; admin?: boolean; children?: (delivery: PersonalDelivery) => React.ReactNode }) {
  return deliveries.length ? <ol className="member-delivery-history">{deliveries.map(row => <li key={row.intentId}>
    <header><strong>{row.reportDate} · {channelLabels[row.channel]}</strong><Badge tone={row.status === "unknown" ? "amber" : "neutral"}>{deliveryStatusLabels[row.status]}</Badge></header>
    {admin && <p className="small">接收成员：<code>{row.memberId}</code></p>}
    <p className="small">固定版本 <code title={row.editionId}>{row.editionId.slice(0, 12)}…</code> · 已尝试 {row.attempts} 次</p>
    <p className="muted small">创建 {notificationTime(row.createdAt)} · 更新 {notificationTime(row.updatedAt)}</p>
    {row.nextAttemptAt && <p className="small">下次安全重试：{notificationTime(row.nextAttemptAt)}</p>}
    {row.status === "unknown" && <p>平台可能已接收本次发送。管理员需要先核对，系统不会自动重发。</p>}
    {(row.status === "accepted" || row.status === "provider_confirmed") && <p className="muted small">这是平台状态，不能据此判断你是否已阅读。</p>}
    {row.status === "cancelled" && <p className="muted small">此任务已停止；已提交给平台的消息无法撤回。</p>}
    {row.errorCode && <p className="muted small">状态代码：{row.errorCode}</p>}
    {row.sourceIntentId && <p className="muted small">管理员补发记录{row.reason ? `：${row.reason}` : ""}</p>}
    {onNavigate && <Button onClick={() => onNavigate(`/app/briefs/${row.editionId}`)}>查看固定版本</Button>}{children?.(row)}
  </li>)}</ol> : <p className="muted">还没有个人发送记录。</p>;
}

export default function MemberNotifications({ api, session, capabilities, onExpired, onNavigate }: PersonalComponentProps & { capabilities: MemberCapabilities }) {
  const [overview, setOverview] = useState<NotificationOverview | null>(null), [subscription, setSubscription] = useState<SubscriptionEnvelope | null>(null), [editions, setEditions] = useState<EditionSummary[]>([]);
  const [busy, setBusy] = useState(true), [message, setMessage] = useState("");
  const [challenge, setChallenge] = useState<BindingChallenge | null>(null), [otp, setOtp] = useState("");
  const [unbindTarget, setUnbindTarget] = useState<NotificationBinding | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false), [localTime, setLocalTime] = useState("09:00"), [scheduleConflict, setScheduleConflict] = useState(false);
  const [editionId, setEditionId] = useState(""), [sendConfirm, setSendConfirm] = useState(false), [sendRetry, setSendRetry] = useState(false);
  const pending = useRef<{ requestId: string; editionId: string; channel: NotificationChannel } | null>(null);
  const scope = usePersonalScope(api, session.userId), readonly = session.role === "viewer";
  const clear = () => { setOverview(null); setSubscription(null); setEditions([]); setChallenge(null); setOtp(""); setUnbindTarget(null); pending.current = null; };
  const fail = (error: unknown) => {
    if (error instanceof MemberApiError && error.status === 401) { clear(); onExpired(); return; }
    if (error instanceof MemberApiError && error.status === 403) clear();
    if (error instanceof MemberApiError && [404, 410].includes(error.status)) { setChallenge(null); setOtp(""); }
    setMessage(notificationError(error));
  };
  const read = async (token: number, preserveSchedule = false) => {
    const [value, saved, history] = await Promise.all([loadNotifications(api), loadSubscription(api), loadEditions(api)]);
    if (!scope.current(token)) return;
    if (value.deliveries.some(row => row.memberId !== session.userId)) throw new MemberApiError(403, "投递记录不属于当前账号。", "forbidden");
    setOverview(value); setSubscription(saved); setEditions(history.editions);
    if (!preserveSchedule) { setScheduleEnabled(value.schedule.enabled); setLocalTime(value.schedule.localTime); }
    setScheduleConflict(false);
    setEditionId(previous => history.editions.some(row => row.editionId === previous && row.finalized && row.count > 0) ? previous : history.editions.find(row => row.finalized && row.status === "ready" && row.count > 0)?.editionId || "");
  };
  useEffect(() => {
    const token = scope.capture(); clear(); setBusy(true); setMessage(""); setSendRetry(false); setSendConfirm(false);
    void read(token).catch(error => { if (scope.current(token)) fail(error); }).finally(() => { if (scope.current(token)) setBusy(false); });
  }, [api, session.userId]);
  const perform = async (action: (token: number) => Promise<void>) => {
    if (busy) return; const token = scope.capture(); setBusy(true); setMessage("");
    try { await action(token); } catch (error) { if (scope.current(token)) fail(error); } finally { if (scope.current(token)) setBusy(false); }
  };
  const refresh = () => void perform(async token => { await read(token, scheduleConflict); if (scope.current(token) && scheduleConflict) setMessage("最新设置已读取，时间草稿已保留。请检查后重新保存。"); });
  const start = (channel: NotificationChannel) => void perform(async token => {
    setChallenge(null); setOtp(""); const result = await startBinding(api, channel); if (scope.current(token)) setChallenge(result);
  });
  const check = () => challenge && void perform(async token => { const result = await loadChallenge(api, challenge.challengeId); if (scope.current(token)) { setChallenge({ ...result, ...(result.status === "waiting" && result.challengeId === challenge.challengeId && challenge.code ? { code: challenge.code } : {}) }); if (result.status === "complete") { setChallenge(null); await read(token, true); } } });
  const finish = () => challenge && void perform(async token => {
    const binding = await confirmBinding(api, challenge.challengeId, challenge.channel === "wechat" ? otp : undefined);
    if (!scope.current(token)) return; setChallenge(null); setOtp("");
    setOverview(previous => previous && ({ ...previous, bindings: [binding, ...previous.bindings.filter(row => row.channel !== binding.channel)] }));
    setMessage(`${channelLabels[binding.channel]}已验证并绑定。定时投递需要单独开启。`);
  });
  const remove = () => unbindTarget && void perform(async token => {
    await unbind(api, unbindTarget.bindingId); if (!scope.current(token)) return;
    setOverview(previous => previous && ({ ...previous, bindings: previous.bindings.map(row => row.bindingId === unbindTarget.bindingId ? { ...row, status: "unbound" } : row) }));
    setUnbindTarget(null); setChallenge(null); setOtp(""); setSendConfirm(false); setMessage("已解绑并取消尚未发送的任务。已提交给平台的消息无法撤回。");
    // A failed status refresh must not turn a confirmed unbind into another mutation.
    try { await read(token, true); } catch (error) { if (scope.current(token)) { if (error instanceof MemberApiError && [401, 403].includes(error.status)) fail(error); else setMessage("解绑已确认；最新队列状态暂未读取，请刷新查看。"); } }
  });
  const save = (enabled = scheduleEnabled) => overview && void perform(async token => {
    try { const result = await saveSchedule(api, overview.schedule, enabled, localTime); if (!scope.current(token)) return; setOverview(previous => previous && ({ ...previous, schedule: result })); setScheduleEnabled(result.enabled); setLocalTime(result.localTime); setScheduleConflict(false); setMessage(result.enabled ? subscription?.subscription?.channel === "in-app" ? "定时投递设置已保存。到时按当前订阅生成站内个人版本。" : "定时投递设置已保存。到时按当前订阅与绑定重新校验后发送。" : "定时投递已关闭，尚未发送的任务已取消。"); }
    catch (error) { if (scope.current(token) && error instanceof MemberApiError && error.status === 409) setScheduleConflict(true); throw error; }
  });
  const channel = subscription?.subscription?.channel, paused = subscription?.subscription?.frequency === "paused";
  const selectedBinding = overview?.bindings.find(row => row.channel === channel && row.status === "active");
  const channelReady = overview?.channels.some(row => row.channel === channel && row.configured);
  const alreadyRequested = overview?.deliveries.some(row => row.editionId === editionId && row.channel === channel);
  const canSend = !readonly && capabilities.personalDelivery.enabled && !!selectedBinding && !!channelReady && !!editionId && !paused && channel !== "in-app" && !alreadyRequested;
  const send = () => {
    if ((!canSend && !pending.current) || busy) return;
    const request = pending.current || { requestId: crypto.randomUUID(), editionId, channel: channel as NotificationChannel }; pending.current = request;
    void perform(async token => {
      setSendConfirm(false);
      try {
        const result = await requestDelivery(api, request); if (!scope.current(token)) return;
        if (result.delivery.memberId !== session.userId) throw new MemberApiError(403, "投递记录不属于当前账号。", "forbidden");
        pending.current = null; setSendRetry(false); setOverview(previous => previous && ({ ...previous, deliveries: [result.delivery, ...previous.deliveries.filter(row => row.intentId !== result.delivery.intentId)] }));
        setMessage(result.idempotent ? "已返回这次发送的已有记录，没有新建重复任务。" : "发送任务已建立，可在下方查看平台状态。排队不代表已送达。");
      } catch (error) { if (scope.current(token)) { const uncertain = uncertainNotification(error); setSendRetry(uncertain); if (!uncertain) pending.current = null; if (uncertain) { setMessage("发送请求结果尚未确认。重试同一请求会核对已有任务；请勿另建一次发送。"); return; } } throw error; }
    });
  };
  return <section className="member-personal member-notifications" aria-labelledby="member-notifications-title">
    <div className="section-head"><div><h2 id="member-notifications-title">个人接收与通知</h2><p>先验证接收账号，再选择定时投递或手动发送固定版本。</p></div><Button disabled={busy} onClick={refresh}>{scheduleConflict ? "读取最新设置（保留草稿）" : "刷新通知状态"}</Button></div>
    {message && <p role="status" className="aside-note">{message}</p>}{busy && !overview && <p role="status">正在读取通知设置…</p>}
    {readonly && <p className="aside-note">当前账号为只读，无法绑定、启用调度或发送消息。</p>}
    {overview && <>
      <div className="member-notification-grid">{(["feishu", "wechat"] as const).map(kind => {
        const configured = overview.channels.some(row => row.channel === kind && row.configured), binding = overview.bindings.find(row => row.channel === kind && row.status === "active");
        const currentChallenge = challenge?.channel === kind ? challenge : null;
        return <section key={kind} className="member-notification-panel" aria-label={`${channelLabels[kind]}绑定`}><h3>{channelLabels[kind]}</h3>
          <Badge>{!configured ? "管理员尚未配置" : binding ? "已验证绑定" : "未绑定"}</Badge>
          <p>{kind === "feishu" ? "把一次性绑定命令私发给组内应用机器人，再回到这里确认。" : "使用专属二维码添加组内 PushPlus 账号，再输入微信收到的验证码。"}</p>
          {binding && <p>{binding.displayName} · 验证于 {notificationTime(binding.verifiedAt)}</p>}
          {!configured && <p className="muted small">管理员配置此渠道后才能开始验证。</p>}
          <div className="member-personal-toolbar">{binding ? <Button variant="danger" disabled={busy || readonly} onClick={() => setUnbindTarget(binding)}>解绑{kind === "feishu" ? "飞书" : "微信"}</Button> : <Button disabled={busy || readonly || !configured} onClick={() => start(kind)}>开始{kind === "feishu" ? "飞书" : "微信"}绑定</Button>}</div>
          {currentChallenge && <div className="member-notification-challenge"><p className="muted small">有效期至 {notificationTime(currentChallenge.expiresAt)}</p>
            {currentChallenge.status === "waiting" && <>
              {kind === "feishu" && currentChallenge.code && <><p>在飞书中私聊应用机器人，发送以下完整命令：</p><code className="member-notification-code">{currentChallenge.code}</code><p className="muted small">发送后点击“检查绑定进度”。该命令仅用于本次验证。</p></>}
              {kind === "wechat" && currentChallenge.qrCodeUrl && <><img className="member-notification-qr" src={currentChallenge.qrCodeUrl} alt="本次微信好友绑定二维码" /><p>用微信扫描二维码，然后检查绑定进度。</p></>}
            </>}
            {currentChallenge.status === "awaiting-confirmation" && <><p>{currentChallenge.displayName || "已验证的飞书账号"} 已完成机器人私信验证。</p><p>只有刚才由你发送绑定命令时，才确认绑定。</p><Button disabled={busy || readonly} variant="primary" onClick={finish}>确认绑定此飞书账号</Button></>}
            {currentChallenge.status === "awaiting-code" && <div className="member-notification-form"><p>验证码已发往 {currentChallenge.displayName || "已核实的微信好友"}。请检查微信通知。</p><label>微信绑定验证码<input autoComplete="one-time-code" inputMode="numeric" maxLength={8} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ""))} /></label><Button disabled={busy || readonly || !/^\d{8}$/.test(otp)} variant="primary" onClick={finish}>验证并绑定微信</Button></div>}
            {["expired", "failed"].includes(currentChallenge.status) && <p>本次绑定验证已结束，请重新开始。</p>}
            {!["expired", "failed", "complete"].includes(currentChallenge.status) && <div className="member-personal-toolbar"><Button disabled={busy} onClick={check}>检查绑定进度</Button></div>}
          </div>}
        </section>;
      })}</div>
      {unbindTarget && <div className="member-personal-confirm" role="group" aria-label="确认解绑接收账号"><p>解绑 {channelLabels[unbindTarget.channel]}：{unbindTarget.displayName}。尚未发送的相关任务会取消，已提交给平台的消息无法撤回。</p><Button variant="danger" disabled={busy} onClick={remove}>确认解绑</Button><Button disabled={busy} onClick={() => setUnbindTarget(null)}>保留绑定</Button></div>}
      <section className="member-notification-panel"><h3>定时投递</h3><p>使用已保存订阅的接收渠道与频率；内容不足时不会重复昨天的简报。保存订阅、预览和生成站内版本本身不会发送消息。</p>
        <p className="small">当前订阅：{!subscription?.subscription ? "尚未保存" : `${channel === "in-app" ? "站内查看" : channelLabels[channel!]} · ${paused ? "已暂停" : subscription.subscription.frequency === "weekdays" ? "工作日" : "每天"}`}</p>
        {!overview.schedule.systemEnabled && <p className="aside-note">管理员尚未启用定时服务，当前不会自动发送。</p>}
        {paused && <p className="aside-note">订阅处于暂停状态，未发送任务会取消。恢复订阅后再检查定时设置。</p>}
        <fieldset className="member-notification-form" disabled={busy || readonly}><label className="member-notification-check"><input type="checkbox" checked={scheduleEnabled} disabled={!overview.schedule.systemEnabled || (!scheduleEnabled && (!subscription?.subscription || paused || (channel !== "in-app" && !selectedBinding)))} onChange={event => setScheduleEnabled(event.target.checked)} />开启个人定时投递</label><label>投递时间（北京时间）<input type="time" value={localTime} onChange={event => setLocalTime(event.target.value)} /></label><p className="muted small">时区 Asia/Shanghai。站内渠道定时生成个人版本；外部渠道使用已验证的接收账号。关闭定时投递会取消尚未发送的任务。</p></fieldset>
        <div className="member-personal-toolbar"><Button disabled={busy || readonly || scheduleConflict || !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)} onClick={() => save()}>保存定时设置</Button>{overview.schedule.enabled && <Button disabled={busy || readonly || scheduleConflict} onClick={() => save(false)}>暂停定时投递</Button>}<Button onClick={() => onNavigate("/app/subscription")}>调整订阅与渠道</Button></div>
      </section>
      <section className="member-notification-panel"><h3>发送已有固定版本</h3><p>发送本人固定版本的更新通知与登录查看链接，正文在 Console 内阅读。只有包含合格内容的版本可以发送；平台受理或确认不代表已读。</p>
        {!capabilities.personalDelivery.enabled && <p className="aside-note">个人发送服务尚未启用。</p>}
        <div className="member-notification-form"><label>发送的固定版本<select value={editionId} disabled={busy || sendRetry || readonly} onChange={event => { setEditionId(event.target.value); setSendConfirm(false); }}><option value="">请选择固定版本</option>{editions.filter(row => row.finalized && row.status === "ready" && row.count > 0).map(row => <option key={row.editionId} value={row.editionId}>{row.reportDate} · {row.count} 条 · {row.editionId.slice(0, 8)}</option>)}</select></label></div>
        <p className="small">接收渠道：{channel === "feishu" || channel === "wechat" ? channelLabels[channel] : "请先在订阅中选择飞书或微信"}。{selectedBinding ? `已验证接收账号：${selectedBinding.displayName}` : "请先完成对应渠道绑定。"}</p>
        {alreadyRequested && <p className="aside-note">此版本已有投递记录，请查看下方状态；需要补发时，请管理员核对后处理。</p>}
        <Button variant="primary" disabled={busy || readonly || (!canSend && !sendRetry)} onClick={() => sendRetry ? send() : setSendConfirm(true)}>{sendRetry ? "重试同一发送请求" : "发送此固定版本"}</Button>
        {sendConfirm && <div className="member-personal-confirm" role="group" aria-label="确认发送个人简报"><p>将固定版本 {editionId.slice(0, 12)}… 发送到本人已验证的 {channel === "feishu" || channel === "wechat" ? channelLabels[channel] : ""} 账号：{selectedBinding?.displayName}。</p><Button variant="primary" disabled={busy || !canSend} onClick={send}>确认发送个人简报</Button><Button disabled={busy} onClick={() => setSendConfirm(false)}>取消发送</Button></div>}
      </section>
      <section aria-label="我的投递历史"><h3>个人投递记录</h3><p className="muted small">系统只对确认可安全重试的临时失败自动退避。结果不明的记录需要先核对。</p><DeliveryHistory deliveries={overview.deliveries} onNavigate={onNavigate} /></section>
    </>}
  </section>;
}
