import { useEffect, useRef, useState } from "react";
import { Badge, Button, Empty, ExternalLink } from "./components";
import { MemberApiError } from "./member-api";
import { createEdition, editionStatusLabels, emptyFeedback, loadEdition, loadEditions, loadFeedback, loadSubscription, personalError, previewSaved, revokeFeedback, updateFeedback, usePersonalScope,
  type DisplayEdition, type EditionEnvelope, type EditionSummary, type FeedbackState, type PersonalComponentProps, type SubscriptionEnvelope } from "./member-personal-api";
import "./member-personal.css";
import { useMemberSession } from "./member-session";

const reasonLabels: Record<string, string> = { "primary-topic": "匹配主方向", "secondary-topic": "匹配次方向", "subscription-fill": "由关注方向补位", "quality-gate": "通过质量门槛", "topic-evidence": "具有主题相关证据", "keyword-match": "命中个人关键词", "open-source-preference": "符合开源偏好", "saved-feedback": "曾收藏相关内容", "first-edition-recap": "首次七天回顾", "verified-substantial-update": "已验证实质更新" };
export type FeedbackKind = "read" | "saved" | "not-relevant";
export function FeedbackButtons({ state, disabled, onToggle }: { state: FeedbackState; disabled?: boolean; onToggle: (kind: FeedbackKind) => void }) {
  return <div className="member-personal-feedback" role="group" aria-label="内容反馈">
    <button type="button" disabled={disabled} aria-pressed={state.read} onClick={() => onToggle("read")}>{state.read ? "撤回已读" : "标为已读"}</button>
    <button type="button" disabled={disabled} aria-pressed={state.saved} onClick={() => onToggle("saved")}>{state.saved ? "取消收藏" : "收藏"}</button>
    <button type="button" disabled={disabled} aria-pressed={state.notRelevant} onClick={() => onToggle("not-relevant")}>{state.notRelevant ? "撤回不相关" : "不相关"}</button>
  </div>;
}
export async function togglePersonalFeedback(api: PersonalComponentProps["api"], eventId: string, state: FeedbackState, kind: FeedbackKind) {
  const active = state.feedback.filter(f => f.kind === kind);
  if (active.length) { for (const entry of active) { if (api.isClosed) return; await revokeFeedback(api, eventId, entry.feedbackId); } }
  else await updateFeedback(api, eventId, kind);
}
export function EditionContent({ edition, feedback = {}, disabled = true, onToggle }: { edition: DisplayEdition; feedback?: Record<string, FeedbackState>; disabled?: boolean; onToggle?: (eventId: string, kind: FeedbackKind) => void }) {
  const names = new Map(edition.topics.map(t => [t.id, t.name]));
  return <div className="member-personal-edition">
    <div className="member-personal-summary"><Badge>{editionStatusLabels[edition.status]}</Badge><span>{edition.reportDate} · {edition.reportTimeZone} · {edition.items.length}/{edition.quota.maxItems} 条</span></div>
    <p className="muted small">{edition.windowStartDate} 至 {edition.reportDate} · 主方向 {edition.quota.primarySelected} 条，次方向 {edition.quota.secondarySelected} 条，补位 {edition.quota.fillSelected} 条。{edition.quota.unfilled > 0 ? "合格内容不足时保留空缺。" : ""}</p>
    {edition.firstEdition && <p className="aside-note">这是首次简报，回顾最近 {edition.windowDays} 天；较早内容会标记为回顾。</p>}
    {!edition.items.length && <Empty title={editionStatusLabels[edition.status]}><p>可检查订阅范围或稍后再预览。</p></Empty>}
    {edition.items.map(selected => <article className="member-personal-card" key={selected.item.revisionId}>
      <div className="radar-tags"><Badge tone="blue">{names.get(selected.assignedTopicId) || selected.assignedTopicId}</Badge><Badge>{selected.slot === "primary" ? "主方向" : selected.slot === "secondary" ? "次方向" : "补位"}</Badge>{selected.recap && <Badge>回顾</Badge>}{selected.update && <Badge>实质更新</Badge>}</div>
      <h3><ExternalLink href={selected.item.url}>{selected.item.title}</ExternalLink></h3><p>{selected.item.summary}</p>
      <p className="muted small">{selected.item.sourceId} · {selected.item.publishedAt?.slice(0, 10) || "日期未提供"} · 质量 {selected.score.quality} · 相关性 {selected.score.relevance}</p>
      <p className="member-personal-reasons">入选原因：{selected.reasons.map(reason => reasonLabels[reason] || reason).join("、")}</p>
      {selected.hitKeywords.length > 0 && <p className="small">关键词：{selected.hitKeywords.join("、")}</p>}
      <details><summary>主题判断与原文证据</summary>{selected.item.assessments.map(a => <div className="radar-evidence" key={a.topicId}><strong>{names.get(a.topicId) || a.topicId}</strong><p>{a.reason}</p>{a.evidenceQuotes.map((quote, i) => <blockquote key={i}>{quote}</blockquote>)}</div>)}</details>
      {onToggle && <FeedbackButtons disabled={disabled} state={feedback[selected.item.eventId] || emptyFeedback()} onToggle={kind => onToggle(selected.item.eventId, kind)} />}
    </article>)}
  </div>;
}

export default function MemberBriefs({ api, session, onExpired, onNavigate, editionId }: PersonalComponentProps & { editionId?: string }) {
  const { capabilities } = useMemberSession();
  const [history, setHistory] = useState<EditionSummary[]>([]), [subscription, setSubscription] = useState<SubscriptionEnvelope | null>(null);
  const [current, setCurrent] = useState<EditionEnvelope | null>(null), [feedback, setFeedback] = useState<Record<string, FeedbackState>>({});
  const [feedbackReady, setFeedbackReady] = useState(false);
  const [busy, setBusy] = useState(true), [message, setMessage] = useState(""), [confirm, setConfirm] = useState(false), [retry, setRetry] = useState(false);
  const pending = useRef<{ requestId: string; revision: string } | null>(null);
  const scope = usePersonalScope(api, `${session.userId}:${editionId || ""}`);
  const accept = (value: EditionEnvelope) => { if (value.edition.memberId !== session.userId) throw new MemberApiError(403, "个人简报不属于当前账号。", "forbidden"); setCurrent(value); };
  const fail = (error: unknown) => { if (error instanceof MemberApiError && error.status === 401) { setCurrent(null); setHistory([]); setFeedback({}); onExpired(); } else { if (error instanceof MemberApiError && [403, 404, 410].includes(error.status)) setCurrent(null); setMessage(personalError(error)); } };
  useEffect(() => {
    const token = scope.capture(); setBusy(true); setCurrent(null); setHistory([]); setSubscription(null); setFeedback({}); setFeedbackReady(false); setMessage(""); setConfirm(false); setRetry(false); pending.current = null;
    void (async () => {
      const results = await Promise.allSettled([loadEditions(api), loadSubscription(api), loadFeedback(api)]);
      if (!scope.current(token)) return;
      for (const result of results) if (result.status === "rejected" && result.reason instanceof MemberApiError && result.reason.status === 401) throw result.reason;
      if (results[0].status === "fulfilled") setHistory(results[0].value.editions);
      if (results[1].status === "fulfilled") setSubscription(results[1].value);
      if (results[2].status === "fulfilled") { setFeedback(Object.fromEntries(results[2].value.items.map(item => [item.eventId, item]))); setFeedbackReady(true); }
      const rejected = results.find(result => result.status === "rejected");
      if (rejected?.status === "rejected") setMessage(personalError(rejected.reason));
      const wanted = editionId || (results[0].status === "fulfilled" ? results[0].value.editions[0]?.editionId : undefined);
      if (wanted) { const result = await loadEdition(api, wanted); if (scope.current(token)) accept(result); }
    })().catch(error => { if (scope.current(token)) fail(error); }).finally(() => { if (scope.current(token)) setBusy(false); });
  }, [api, editionId, session.userId]);
  const preview = async () => {
    if (!subscription?.subscription || busy) return; const token = scope.capture(); setBusy(true); setMessage(""); setCurrent(null);
    try { const result = await previewSaved(api, subscription.revision); if (scope.current(token)) { accept(result); setMessage("本次为预览，尚未加入个人历史。"); } }
    catch (error) { if (scope.current(token)) fail(error); } finally { if (scope.current(token)) setBusy(false); }
  };
  const generate = async () => {
    if (!subscription?.subscription || busy || session.role === "viewer") return;
    const token = scope.capture(); const request = pending.current || { requestId: crypto.randomUUID(), revision: subscription.revision }; pending.current = request;
    setBusy(true); setMessage(""); setConfirm(false);
    try {
      const result = await createEdition(api, request.requestId, request.revision);
      if (!scope.current(token)) return; accept(result); pending.current = null; setRetry(false);
      setHistory(previous => [{ editionId: result.edition.editionId, reportDate: result.edition.reportDate, cutoffAt: result.edition.cutoffAt, status: result.edition.status, count: result.edition.items.length, finalized: result.finalized }, ...previous.filter(row => row.editionId !== result.edition.editionId)].slice(0, 100));
      setMessage(result.finalized ? "站内版本已保存，后续简报会据此排重。" : "已记录本次结果，没有合格内容进入已收录历史。");
      onNavigate(`/app/briefs/${result.edition.editionId}`);
    } catch (error) {
      if (!scope.current(token)) return;
      const uncertain = !(error instanceof MemberApiError) || error.status >= 500;
      setRetry(uncertain); if (!uncertain) pending.current = null;
      fail(error); if (uncertain) setMessage("生成结果尚未确认。请重试同一请求，系统会返回已有结果，避免重复成版。");
    } finally { if (scope.current(token)) setBusy(false); }
  };
  const toggle = async (eventId: string, kind: FeedbackKind) => {
    const token = scope.capture(); setBusy(true); setFeedbackReady(false); setMessage("");
    try { await togglePersonalFeedback(api, eventId, feedback[eventId] || emptyFeedback(), kind); const result = await loadFeedback(api); if (scope.current(token)) { setFeedback(Object.fromEntries(result.items.map(item => [item.eventId, item]))); setFeedbackReady(true); } }
    catch (error) { if (scope.current(token)) fail(error); } finally { if (scope.current(token)) setBusy(false); }
  };
  return <section className="member-personal" aria-labelledby="member-briefs-title"><div className="section-head"><div><h2 id="member-briefs-title">我的个人简报</h2><p>站内查看、预览与固定版本。</p></div><Button onClick={() => onNavigate("/app/subscription")}>调整订阅</Button></div>
    <p className="aside-note">{capabilities?.notificationBindings ? <>本页生成站内固定版本。若需发送或设置定时投递，请前往 <button className="member-personal-link" onClick={() => onNavigate("/app/notifications")}>接收与通知</button>。群体完整简报继续由原流程提供。</> : "当前提供站内简报。飞书／微信个人发送和定时投递尚未开放；群体完整简报继续由原流程提供。"}</p>
    {message && <p role="status" className="aside-note">{message}</p>}
    <div className="member-personal-toolbar"><Button disabled={busy || !subscription?.subscription || retry} onClick={() => void preview()}>预览本次简报</Button><Button variant="primary" disabled={busy || !subscription?.subscription || session.role === "viewer"} onClick={() => retry ? void generate() : setConfirm(true)}>{retry ? "重试同一生成请求" : "生成站内简报"}</Button></div>
    {!busy && subscription && !subscription.subscription && <p>尚未保存个人订阅。<button className="member-personal-link" onClick={() => onNavigate("/app/subscription")}>设置我的订阅</button></p>}
    {confirm && <div className="member-personal-confirm" role="group" aria-label="确认生成站内简报"><p>生成后会保存固定版本，并将本次合格条目加入你的已收录历史；不会发送飞书或微信消息。</p><Button variant="primary" onClick={() => void generate()}>确认生成站内版本</Button><Button onClick={() => setConfirm(false)}>取消</Button></div>}
    <div className="member-personal-brief-layout"><aside><h3>最近 100 个版本</h3>{!history.length && !busy && <p className="muted">还没有已保存的个人简报。</p>}<ul className="member-personal-history">{history.map(row => <li key={row.editionId}><button aria-current={current?.edition.editionId === row.editionId ? "page" : undefined} onClick={() => onNavigate(`/app/briefs/${row.editionId}`)}><strong>{row.reportDate}</strong><span>{row.count} 条 · {editionStatusLabels[row.status]} · {row.finalized ? "已成版" : "结果记录"}</span><small>{new Date(row.cutoffAt).toLocaleTimeString()}</small></button></li>)}</ul></aside>
      <div>{busy && !current && <p role="status">正在读取个人简报…</p>}{current && <><p className="member-personal-version">{current.finalized ? "固定站内版本" : current.draft || !history.some(h => h.editionId === current.edition.editionId) ? "仅预览" : "已保存结果记录"}</p><EditionContent edition={current.edition} feedback={feedback} disabled={busy || !feedbackReady || session.role === "viewer"} onToggle={(eventId, kind) => void toggle(eventId, kind)} /></>}</div>
    </div>
  </section>;
}
