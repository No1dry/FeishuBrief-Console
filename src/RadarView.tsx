import { useMemo, useState } from "react";
import { Badge, Button, Empty, ExternalLink } from "./components";
import { previewRadar, type RadarPreferences, type RadarSnapshot } from "./radar-contract";

export function initialPreferences(radar: RadarSnapshot): RadarPreferences {
  return { primaryTopicId: radar.topics[0].id, secondaryTopicIds: [], keywords: [], excludeKeywords: [], subtopicIds: {}, codeOnly: false };
}

export function RadarPreferencesEditor({ radar, value, onChange }: { radar: RadarSnapshot; value: RadarPreferences; onChange: (value: RadarPreferences) => void }) {
  const topicIds = [value.primaryTopicId, ...value.secondaryTopicIds];
  const split = (text: string) => text.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  const [keywords, setKeywords] = useState(value.keywords.join(", "));
  const [excluded, setExcluded] = useState(value.excludeKeywords.join(", "));
  return <fieldset className="radar-preferences"><legend>我的关注偏好</legend>
    <p className="muted small">主方向优先显示，次方向补充。关键词最多加 10 分；排除词和仅看有代码用于筛选，不能绕过共享审查。</p>
    <label className="field">主方向
      <select aria-label="主方向" value={value.primaryTopicId} onChange={e => {
        const primaryTopicId = e.target.value;
        const secondaryTopicIds = value.secondaryTopicIds.filter(id => id !== primaryTopicId);
        const subtopicIds = Object.fromEntries(Object.entries(value.subtopicIds).filter(([id]) => id === primaryTopicId || secondaryTopicIds.includes(id)));
        onChange({ ...value, primaryTopicId, secondaryTopicIds, subtopicIds });
      }}>
        {!radar.topics.some(t => t.id === value.primaryTopicId) && <option value={value.primaryTopicId}>原主题已停用，请重新选择</option>}
        {radar.topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
    <div className="radar-checks" role="group" aria-label="次方向">
      {radar.topics.filter(t => t.id !== value.primaryTopicId).map(t => <label key={t.id}><input type="checkbox" aria-label={`次方向 ${t.name}`} checked={value.secondaryTopicIds.includes(t.id)} onChange={e => {
        const secondaryTopicIds = e.target.checked ? [...value.secondaryTopicIds, t.id] : value.secondaryTopicIds.filter(id => id !== t.id);
        const subtopicIds = { ...value.subtopicIds }; if (!e.target.checked) delete subtopicIds[t.id];
        onChange({ ...value, secondaryTopicIds, subtopicIds });
      }} />{t.name}</label>)}
    </div>
    {radar.topics.filter(t => topicIds.includes(t.id) && t.subtopics.length).map(t => <div className="radar-checks" role="group" aria-label={`${t.name} 子方向`} key={t.id}>
      <strong>{t.name} 子方向 <small>不选即全部</small></strong>
      {t.subtopics.map(s => <label key={s.id}><input type="checkbox" checked={value.subtopicIds[t.id]?.includes(s.id) ?? false} onChange={e => onChange({ ...value, subtopicIds: { ...value.subtopicIds, [t.id]: e.target.checked ? [...(value.subtopicIds[t.id] || []), s.id] : (value.subtopicIds[t.id] || []).filter(id => id !== s.id) } })} />{s.name}</label>)}
    </div>)}
    <label className="field">重点关键词（逗号分隔）<input aria-label="个人重点关键词" value={keywords} onChange={e => { setKeywords(e.target.value); onChange({ ...value, keywords: split(e.target.value) }); }} /></label>
    <label className="field">个人排除词（逗号分隔）<input aria-label="个人排除词" value={excluded} onChange={e => { setExcluded(e.target.value); onChange({ ...value, excludeKeywords: split(e.target.value) }); }} /></label>
    <label className="radar-checks"><input type="checkbox" checked={value.codeOnly} onChange={e => onChange({ ...value, codeOnly: e.target.checked })} />仅看已确认有代码的内容</label>
  </fieldset>;
}

export default function RadarView({ radar, preferences, onChange, showDiagnostics = false }: { radar: RadarSnapshot; preferences?: RadarPreferences; onChange?: (value: RadarPreferences) => void; showDiagnostics?: boolean }) {
  const [filter, setFilter] = useState("all");
  const result = useMemo(() => {
    if (!preferences) return { rows: radar.items.map(item => ({ item, hitKeywords: [] as string[], primary: false, matchedTopicIds: [] as string[] })), error: "" };
    try { return { rows: previewRadar(radar, preferences), error: "" }; }
    catch { return { rows: [], error: "偏好无效：关键词需 2—100 字，最多 40 个；主次方向及子方向必须仍然有效。" }; }
  }, [radar, preferences]);
  const names = new Map(radar.topics.map(t => [t.id, t.name]));
  const slots = new Set(radar.topics.find(t => t.id === filter)?.itemIds ?? []);
  const rows = result.rows.filter(r => filter === "all" || slots.has(r.item.revisionId));
  const states = { confirmed: "已确认有", absent: "已确认无", unknown: "未知" };
  return <div className="radar-layout">
    {preferences && onChange && <RadarPreferencesEditor radar={radar} value={preferences} onChange={onChange} />}
    <section>
      <p className="muted">{radar.reportDate} · 七天候选窗口 · {radar.items.length} 个独立事件 · 同一事件保留交叉标签，合并显示</p>
      <div className="filter-tabs" role="group" aria-label="雷达主题筛选">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部主题</button>
        {radar.topics.map(t => <button key={t.id} className={filter === t.id ? "active" : ""} onClick={() => setFilter(t.id)}>{t.name} · {t.itemIds.length}</button>)}
      </div>
      {filter !== "all" && <p className="aside-note">{radar.topics.find(t => t.id === filter)?.scope}</p>}
      {result.error && <p role="alert">{result.error}</p>}
      {rows.map(({ item, hitKeywords, primary }) => <article className="radar-card" key={item.revisionId}>
        <div className="radar-tags"><Badge tone="blue">主归属：{names.get(item.primaryTopicId)}</Badge>{item.secondaryTopicIds.map(id => <Badge key={id}>交叉：{names.get(id)}</Badge>)}{preferences && <Badge>{primary ? "匹配我的主方向" : "匹配我的次方向"}</Badge>}</div>
        <h2><ExternalLink href={item.url}>{item.title}</ExternalLink></h2>
        <p>{item.summary}</p>
        <p className="muted small">{item.sourceId} · {item.contentType} · 质量 {item.quality} · 代码：{states[item.codeStatus]} · 数据：{states[item.dataStatus]}</p>
        {hitKeywords.length > 0 && <p className="small">个人关键词命中：{hitKeywords.join("、")}</p>}
        <details><summary>相关理由与原文证据</summary>
          {item.assessments.map(a => <div key={a.topicId} className="radar-evidence"><strong>{names.get(a.topicId)} · {a.relevance}</strong><p>{a.reason}</p>{a.evidenceQuotes.map((q, i) => <blockquote key={i}>{q}</blockquote>)}</div>)}
          {item.evidence.map((e, i) => <div className="radar-evidence" key={i}><p>{e.text}</p><blockquote>{e.quote}</blockquote></div>)}
        </details>
      </article>)}
      {!rows.length && !result.error && <Empty title="暂无符合条件的更新" />}
      {showDiagnostics && <details className="radar-diagnostics"><summary>候选去向与遗漏诊断（{radar.diagnostics.length}）</summary>
        <p>本表记录已采集内容的处理结果。外部发现但候选池中不存在的内容需检查信源采集；零条目不会用其他主题凑数。</p>
        <ul>{radar.diagnostics.map((d, i) => <li key={i}><code>{d.sourceItemId}</code> · {d.stage} · {d.reason}</li>)}</ul>
        <p>主题配额：{radar.topics.map(t => `${t.name} ${t.itemIds.length}/${t.available}`).join("；")}（显示／合格事件）</p>
      </details>}
    </section>
  </div>;
}
