import { useEffect, useState } from "react";
import { Button } from "./components";
import { MemberApiError } from "./member-api";
import { EditionContent } from "./MemberBriefs";
import { SubscriptionSettingsSchema, contentTypeLabels, loadSubscription, loadTopics, personalError, previewSubscription, saveSubscription, settingsOf, usePersonalScope,
  type DisplayEdition, type MemberTopic, type PersonalComponentProps, type SubscriptionEnvelope, type SubscriptionSettings } from "./member-personal-api";
import "./member-personal.css";
import { useMemberSession } from "./member-session";

const fields: Record<keyof SubscriptionSettings, string> = { primaryTopicId: "主方向", secondaryTopicIds: "次方向", subtopicIds: "子方向", keywords: "重点关键词", excludeKeywords: "排除词", codeOnly: "仅有代码", contentTypes: "内容类型", maxItems: "每日条数", primaryShare: "主方向比例", preferOpenSource: "优先开源", frequency: "订阅频率", channel: "接收意愿", firstEditionLookbackDays: "首次回顾" };
const keys = Object.keys(fields) as (keyof SubscriptionSettings)[];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const split = (text: string) => [...new Set(text.split(/[,，\n]/).map(v => v.trim()).filter(Boolean))];
const showValue = (value: unknown) => typeof value === "boolean" ? value ? "是" : "否" : Array.isArray(value) ? value.join("、") || "未选择" : typeof value === "object" ? JSON.stringify(value) : String(value);

export default function MemberSubscription({ api, session, onExpired, onNavigate }: PersonalComponentProps) {
  const { capabilities } = useMemberSession();
  const notifications = capabilities?.notificationBindings === true;
  const [topics, setTopics] = useState<MemberTopic[]>([]), [draft, setDraft] = useState<SubscriptionSettings | null>(null), [baseline, setBaseline] = useState<SubscriptionSettings | null>(null);
  const [revision, setRevision] = useState(""), [first, setFirst] = useState(false), [busy, setBusy] = useState(true), [message, setMessage] = useState("");
  const [keywords, setKeywords] = useState(""), [excluded, setExcluded] = useState(""), [maxItems, setMaxItems] = useState(""), [share, setShare] = useState("");
  const [preview, setPreview] = useState<DisplayEdition | null>(null), [conflict, setConflict] = useState(false), [latest, setLatest] = useState<SubscriptionEnvelope | null>(null);
  const [choices, setChoices] = useState<Partial<Record<keyof SubscriptionSettings, "mine" | "latest">>>({});
  const scope = usePersonalScope(api, session.userId);
  const readonly = session.role === "viewer" || !session.preferencesEnabled;
  const apply = (value: SubscriptionSettings) => { setDraft(value); setKeywords(value.keywords.join(", ")); setExcluded(value.excludeKeywords.join(", ")); setMaxItems(String(value.maxItems)); setShare(String(Number((value.primaryShare * 100).toFixed(8)))); setPreview(null); };
  const edit = (value: SubscriptionSettings) => { setDraft(value); setPreview(null); };
  const currentDraft = () => ({ ...draft!, keywords: split(keywords), excludeKeywords: split(excluded), maxItems: maxItems.trim() ? Number(maxItems) : NaN, primaryShare: share.trim() ? Number(share) / 100 : NaN });
  const validate = () => {
    const value = SubscriptionSettingsSchema.parse(currentDraft());
    const selected = [value.primaryTopicId, ...value.secondaryTopicIds];
    if (selected.some(id => !topics.some(t => t.id === id)) || Object.entries(value.subtopicIds).some(([id, ids]) => !selected.includes(id) || ids.some(sub => !topics.find(t => t.id === id)?.subtopics.some(s => s.id === sub)))) throw new Error("请重新选择当前可用的主题和子方向。");
    return value;
  };
  const fail = (error: unknown) => { if (error instanceof MemberApiError && error.status === 401) { setDraft(null); setPreview(null); onExpired(); } else { if (error instanceof MemberApiError && [403, 410].includes(error.status)) setPreview(null); setMessage(personalError(error)); } };
  useEffect(() => {
    const token = scope.capture(); setBusy(true); setDraft(null); setPreview(null); setMessage("");
    void Promise.all([loadTopics(api), loadSubscription(api)]).then(([catalog, saved]) => {
      if (!scope.current(token)) return; setTopics(catalog.topics); const value = settingsOf(saved); apply(value); setBaseline(value); setRevision(saved.revision); setFirst(saved.subscription === null);
    }).catch(error => { if (scope.current(token)) fail(error); }).finally(() => { if (scope.current(token)) setBusy(false); });
  }, [api, session.userId]);
  const perform = async (action: "preview" | "save") => {
    if (!draft || busy || (action === "save" && (readonly || conflict))) return;
    let value: SubscriptionSettings; try { value = validate(); } catch { setMessage("请检查主次方向、子方向、关键词长度（2–100 字）、内容类型、条数（1–50）和比例（0–100%）。"); return; }
    const token = scope.capture(); setBusy(true); setMessage("");
    try {
      if (action === "preview") { const result = await previewSubscription(api, value); if (!scope.current(token)) return; if (result.edition.memberId !== session.userId) throw new MemberApiError(403, "当前账号无权查看该简报。", "forbidden"); setPreview(result.edition); setMessage("已按当前草稿预览，订阅尚未保存，也未创建正式版本。"); }
      else { const saved = await saveSubscription(api, revision, value); if (!scope.current(token)) return; const next = settingsOf(saved); apply(next); setBaseline(next); setRevision(saved.revision); setFirst(false); setMessage("个人订阅已保存。可以前往我的简报预览或生成站内版本。"); }
    } catch (error) { if (!scope.current(token)) return; if (error instanceof MemberApiError && error.status === 409 && action === "save") { setConflict(true); setLatest(null); setChoices({}); } fail(error); }
    finally { if (scope.current(token)) setBusy(false); }
  };
  const readLatest = async () => {
    const token = scope.capture(); setBusy(true); setMessage("");
    try { const [saved, catalog] = await Promise.all([loadSubscription(api), loadTopics(api)]); if (!scope.current(token)) return; setLatest(saved); setTopics(catalog.topics); setChoices({}); setMessage("已读取最新版本，当前草稿保持不变。请确认需要合并的字段。"); }
    catch (error) { if (scope.current(token)) fail(error); } finally { if (scope.current(token)) setBusy(false); }
  };
  const mine = draft ? currentDraft() : null, remote = latest ? settingsOf(latest) : null;
  const conflicts = baseline && mine && remote ? keys.filter(key => !same(mine[key], baseline[key]) && !same(remote[key], baseline[key]) && !same(mine[key], remote[key])) : [];
  const merge = () => {
    if (!latest || !baseline || !mine || !remote || conflicts.some(key => !choices[key])) return;
    const result = Object.fromEntries(keys.map(key => [key, conflicts.includes(key) ? choices[key] === "mine" ? mine[key] : remote[key] : !same(mine[key], baseline[key]) ? mine[key] : remote[key]]));
    const parsed = SubscriptionSettingsSchema.safeParse(result);
    if (!parsed.success) { setMessage("合并后的字段组合无效，请检查主次方向、关键词、类型和数量后重新合并。"); return; }
    apply(parsed.data); setBaseline(remote); setRevision(latest.revision); setLatest(null); setConflict(false); setMessage("合并完成，请检查表单后再次点击保存。远程内容尚未被修改。");
  };
  return <section className="member-personal" aria-labelledby="member-subscription-title"><div className="section-head"><div><h2 id="member-subscription-title">我的个人订阅</h2><p>选择关注范围，再预览本次会收录的内容。</p></div><Button onClick={() => onNavigate("/app/briefs")}>我的简报</Button></div>
    {first && <div className="member-personal-onboarding"><h3>建立第一份个人订阅</h3><ol><li>选择一个主方向，以及可选的次方向。</li><li>调整关键词与内容偏好，预览当前草稿。</li><li>保存订阅，再到“我的简报”生成站内版本。</li></ol></div>}
    <p className="aside-note">{notifications ? "飞书／微信接收账号需要在“接收与通知”中验证；定时投递需单独开启。站内保存和预览不会立即发送消息。" : "飞书／微信当前仅记录接收意愿；尚未绑定账号或启用个人自动发送。站内保存和预览不会发送消息。"}</p>
    {message && <p role="status" className="aside-note">{message}</p>}{busy && !draft && <p role="status">正在读取订阅…</p>}
    {readonly && <p className="aside-note">当前账号为只读，可查看订阅和预览，不能保存更改。</p>}
    {draft && <><fieldset disabled={busy || readonly} className="member-form member-personal-form"><legend>关注范围</legend>
      <label>主方向<select aria-label="订阅主方向" value={draft.primaryTopicId} onChange={e => { const primaryTopicId = e.target.value, secondaryTopicIds = draft.secondaryTopicIds.filter(id => id !== primaryTopicId); edit({ ...draft, primaryTopicId, secondaryTopicIds, subtopicIds: Object.fromEntries(Object.entries(draft.subtopicIds).filter(([id]) => id === primaryTopicId || secondaryTopicIds.includes(id))) }); }}>
        {!topics.some(t => t.id === draft.primaryTopicId) && <option value={draft.primaryTopicId}>原主题已不可用，请重选</option>}{topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
      <div className="member-personal-checks" role="group" aria-label="订阅次方向">{topics.filter(t => t.id !== draft.primaryTopicId).map(topic => <label key={topic.id}><input type="checkbox" checked={draft.secondaryTopicIds.includes(topic.id)} onChange={e => { const secondaryTopicIds = e.target.checked ? [...draft.secondaryTopicIds, topic.id] : draft.secondaryTopicIds.filter(id => id !== topic.id); edit({ ...draft, secondaryTopicIds, subtopicIds: Object.fromEntries(Object.entries(draft.subtopicIds).filter(([id]) => id === draft.primaryTopicId || secondaryTopicIds.includes(id))) }); }} />次方向 {topic.name}</label>)}</div>
      {draft.secondaryTopicIds.length > 1 && <div><p className="muted small">次方向按以下顺序分配，重叠内容只收录一次。</p>{draft.secondaryTopicIds.map((id, index) => <div className="member-personal-order" key={id}><span>{index + 1}. {topics.find(t => t.id === id)?.name || id}</span><Button disabled={index === 0} onClick={() => { const ids = [...draft.secondaryTopicIds]; [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; edit({ ...draft, secondaryTopicIds: ids }); }}>上移</Button></div>)}</div>}
      {topics.filter(topic => [draft.primaryTopicId, ...draft.secondaryTopicIds].includes(topic.id) && topic.subtopics.length).map(topic => <div key={topic.id} className="member-personal-checks" role="group" aria-label={`${topic.name} 订阅子方向`}><strong>{topic.name} 子方向（不选即全部）</strong>{topic.subtopics.map(sub => <label key={sub.id}><input type="checkbox" checked={draft.subtopicIds[topic.id]?.includes(sub.id) || false} onChange={e => edit({ ...draft, subtopicIds: { ...draft.subtopicIds, [topic.id]: e.target.checked ? [...(draft.subtopicIds[topic.id] || []), sub.id] : (draft.subtopicIds[topic.id] || []).filter(id => id !== sub.id) } })} />{sub.name}</label>)}</div>)}
      <label>重点关键词（逗号或换行分隔）<textarea aria-label="订阅重点关键词" value={keywords} onChange={e => { setKeywords(e.target.value); setPreview(null); }} rows={2} /></label>
      <label>排除词（逗号或换行分隔）<textarea aria-label="订阅排除词" value={excluded} onChange={e => { setExcluded(e.target.value); setPreview(null); }} rows={2} /></label>
      <div className="member-personal-checks" role="group" aria-label="订阅内容类型">{Object.entries(contentTypeLabels).map(([id, label]) => <label key={id}><input type="checkbox" checked={draft.contentTypes.includes(id as keyof typeof contentTypeLabels)} onChange={e => edit({ ...draft, contentTypes: e.target.checked ? [...draft.contentTypes, id as keyof typeof contentTypeLabels] : draft.contentTypes.filter(type => type !== id) })} />{label}</label>)}</div>
      <div className="member-personal-columns"><label>每份最多条数<input type="number" min={1} max={50} step={1} value={maxItems} onChange={e => { setMaxItems(e.target.value); setPreview(null); }} /></label><label>主方向比例（%）<input type="number" min={0} max={100} step="any" value={share} onChange={e => { setShare(e.target.value); setPreview(null); }} /></label></div>
      <p className="muted small">其余名额分配给次方向；主题交叉去重，内容不足时不会凑数。</p>
      <div className="member-personal-checks"><label><input type="checkbox" checked={draft.codeOnly} onChange={e => edit({ ...draft, codeOnly: e.target.checked })} />仅收录确认有代码的内容</label><label><input type="checkbox" checked={draft.preferOpenSource} onChange={e => edit({ ...draft, preferOpenSource: e.target.checked })} />优先开源内容</label></div>
      <div className="member-personal-columns"><label>订阅频率<select aria-label="订阅频率" value={draft.frequency} onChange={e => edit({ ...draft, frequency: e.target.value as SubscriptionSettings["frequency"] })}><option value="daily">每天</option><option value="weekdays">工作日</option><option value="paused">暂停</option></select></label><label>接收渠道意愿<select aria-label="接收渠道意愿" value={draft.channel} onChange={e => edit({ ...draft, channel: e.target.value as SubscriptionSettings["channel"] })}><option value="in-app">站内查看</option><option value="feishu">{notifications ? "飞书（需验证绑定）" : "飞书（仅记录意愿）"}</option><option value="wechat">{notifications ? "微信（需验证绑定）" : "微信（仅记录意愿）"}</option></select></label><label>首次回顾范围<select aria-label="首次回顾范围" value={draft.firstEditionLookbackDays} onChange={e => edit({ ...draft, firstEditionLookbackDays: Number(e.target.value) as 1 | 7 })}><option value={7}>最近七天</option><option value={1}>仅当天</option></select></label></div>
      <p className="muted small">{notifications ? "暂停订阅会取消尚未发送的任务。恢复订阅或更改渠道后，请到接收与通知检查绑定与定时设置。" : "频率用于组装时的日期判断；当前没有个人自动调度或外部投递。"}</p>
    </fieldset>
    {conflict && <section className="member-personal-conflict" aria-labelledby="subscription-conflict-title"><h3 id="subscription-conflict-title">订阅版本冲突</h3><p>你的草稿已保留。读取最新版本后，系统会合并不同字段，并请你决定同时改动的字段。</p><Button disabled={busy} onClick={() => void readLatest()}>读取最新版本（保留草稿）</Button>
      {latest && remote && mine && <><div className="member-personal-table-wrap"><table><thead><tr><th>同时改动的字段</th><th>我的草稿</th><th>最新版本</th><th>保留</th></tr></thead><tbody>{conflicts.map(key => <tr key={key}><th>{fields[key]}</th><td>{showValue(mine[key])}</td><td>{showValue(remote[key])}</td><td><select aria-label={`合并${fields[key]}`} value={choices[key] || ""} onChange={e => setChoices({ ...choices, [key]: e.target.value as "mine" | "latest" })}><option value="">请选择</option><option value="mine">我的草稿</option><option value="latest">最新版本</option></select></td></tr>)}</tbody></table></div>{!conflicts.length && <p>双方修改了不同字段，可以自动合并。</p>}<div className="member-personal-toolbar"><Button variant="primary" disabled={busy || conflicts.some(key => !choices[key])} onClick={merge}>确认合并并继续编辑</Button><Button disabled={busy} onClick={() => { apply(remote); setBaseline(remote); setRevision(latest.revision); setConflict(false); setLatest(null); setMessage("已用最新版本替换本地草稿。"); }}>用最新版本替换草稿</Button></div></>}
    </section>}
    <div className="member-personal-toolbar"><Button disabled={busy} onClick={() => void perform("preview")}>预览当前草稿</Button><Button variant="primary" disabled={busy || readonly || conflict} onClick={() => void perform("save")}>保存个人订阅</Button></div>
    {preview && <section aria-label="订阅草稿预览"><h3>当前草稿预览</h3><EditionContent edition={preview} /></section>}</>}
  </section>;
}
