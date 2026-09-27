import { useEffect, useRef, useState } from "react";
import { Button } from "./components";
import { MemberApiError } from "./member-api";
import { deleteTopic, loadTopicCatalog, ManagedTopicSchema, saveTopic, type ManagedTopic, type ManagedTopicProfile, type ManagementProps } from "./member-management-api";
import "./member-management.css";

const lines = (value: string) => value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
const keywords = (value: string) => [...new Set(value.split(/[,，\r\n]+/).map(v => v.trim()).filter(Boolean))];
type Draft = Omit<ManagedTopic, "keywords" | "aliases" | "excludeKeywords" | "exclusions" | "positiveExamples" | "negativeExamples" | "subtopics"> & {
  keywords: string; aliases: string; excludeKeywords: string; exclusions: string; positiveExamples: string; negativeExamples: string;
  subtopics: { id: string; name: string; keywords: string }[];
};
const newTopic = (): ManagedTopic => ({ id: "", name: "", enabled: true, priority: "P1", weight: 1, keywords: [], aliases: [], excludeKeywords: [], scope: "", exclusions: [], positiveExamples: [], negativeExamples: [], subtopics: [], relevanceThreshold: 70, radarLimit: 20 });
const draftOf = (topic: ManagedTopic): Draft => ({ ...topic, keywords: topic.keywords.join("\n"), aliases: topic.aliases.join("\n"), excludeKeywords: topic.excludeKeywords.join("\n"), exclusions: (topic.exclusions ?? []).join("\n"), positiveExamples: (topic.positiveExamples ?? []).join("\n"), negativeExamples: (topic.negativeExamples ?? []).join("\n"), subtopics: (topic.subtopics ?? []).map(s => ({ ...s, keywords: s.keywords.join("\n") })) });
const topicOf = (draft: Draft) => ManagedTopicSchema.safeParse({ ...draft, scope: draft.scope?.trim() || undefined, keywords: keywords(draft.keywords), aliases: keywords(draft.aliases), excludeKeywords: keywords(draft.excludeKeywords), exclusions: lines(draft.exclusions), positiveExamples: lines(draft.positiveExamples), negativeExamples: lines(draft.negativeExamples), subtopics: draft.subtopics.map(s => ({ ...s, keywords: keywords(s.keywords) })) });

export default function MemberTopics({ api, session, onExpired }: ManagementProps) {
  const allowed = session.role === "lab_owner" || session.role === "topic_owner";
  const [profiles, setProfiles] = useState<ManagedTopicProfile[]>([]);
  const [selected, setSelected] = useState<ManagedTopicProfile | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const generation = useRef(0);
  const valid = (id: number) => generation.current === id && !api.isClosed;
  const report = (error: unknown, id: number) => {
    if (!valid(id)) return;
    if (error instanceof MemberApiError && error.status === 401) { onExpired(); return; }
    if (error instanceof MemberApiError && error.status === 403) { setProfiles([]); setSelected(null); setDraft(null); }
    if (error instanceof MemberApiError && error.status === 409) setConflict(true);
    setMessage(error instanceof Error ? error.message : "主题操作失败，请重试。");
  };
  const read = async (id: number) => {
    const result = await loadTopicCatalog(api);
    if (!valid(id)) return;
    setProfiles(result.profiles); setSelected(null); setDraft(null); setConflict(false); setConfirmDelete(false);
  };
  useEffect(() => {
    const id = ++generation.current;
    setProfiles([]); setSelected(null); setDraft(null); setMessage(""); setBusy(allowed);
    if (allowed) void read(id).catch(e => report(e, id)).finally(() => { if (valid(id)) setBusy(false); });
    return () => { generation.current++; };
  }, [api, session.userId, session.role]);
  const edit = (profile: ManagedTopicProfile | null) => { setSelected(profile); setDraft(draftOf(profile?.topic ?? newTopic())); setConflict(false); setConfirmDelete(false); setMessage(""); };
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft(current => current ? { ...current, [key]: value } : null); setConfirmDelete(false); };
  const save = async () => {
    if (!draft || busy) return;
    const parsed = topicOf(draft);
    if (!parsed.success) { setMessage("请检查主题 ID、名称和关键词。每项关键词至少 2 个字符，子方向 ID 不能重复，阈值为 70–100。范围与示例也须符合标注的长度限制。"); return; }
    const id = generation.current; setBusy(true); setMessage("");
    try {
      const result = await saveTopic(api, parsed.data, selected?.revisionId ?? "initial");
      if (!valid(id)) return;
      setProfiles(previous => [...previous.filter(p => p.topic.id !== result.profile.topic.id), result.profile].sort((a, b) => a.topic.id.localeCompare(b.topic.id)));
      setSelected(result.profile); setDraft(draftOf(result.profile.topic)); setConflict(false);
      setMessage("主题已保存。新规则需要共享内容重新评估并导入后生效；此操作不会立即运行模型或发送简报。");
    } catch (e) { report(e, id); }
    finally { if (valid(id)) setBusy(false); }
  };
  const remove = async () => {
    if (!selected || busy) return;
    const id = generation.current; setBusy(true); setMessage("");
    try {
      await deleteTopic(api, selected.topic.id, selected.revisionId);
      if (!valid(id)) return;
      setProfiles(previous => previous.filter(p => p.topic.id !== selected.topic.id)); setSelected(null); setDraft(null); setConfirmDelete(false);
      setMessage("主题已删除。相关订阅需重新选择方向；共享内容目录需要重新评估并导入。");
    } catch (e) { report(e, id); }
    finally { if (valid(id)) setBusy(false); }
  };
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(draftOf(selected?.topic ?? newTopic()));
  if (!allowed) return <section className="mm-section"><h2>主题管理</h2><p role="status">你没有主题管理权限。</p></section>;
  return <section className="mm-section" aria-labelledby="mm-topics-title">
    <header className="mm-heading"><div><h2 id="mm-topics-title">主题目录</h2><p>{session.role === "lab_owner" ? "管理共享研究方向、判断范围和收录标准。" : "编辑你负责的主题，其他方向由管理员维护。"}</p></div><div className="mm-actions"><Button disabled={busy} onClick={() => { const id = generation.current; setBusy(true); setMessage(""); void read(id).catch(e => report(e, id)).finally(() => { if (valid(id)) setBusy(false); }); }}>{dirty || conflict ? "重新读取并放弃草稿" : "刷新目录"}</Button>{session.role === "lab_owner" && <Button variant="primary" disabled={busy || profiles.length >= 12} onClick={() => edit(null)}>新增主题</Button>}</div></header>
    <aside className="mm-note"><strong>方向可以重叠，内容只收录一次。</strong><p>共享评估会逐一判断各主题；一篇内容可有主要和次要主题。个人简报再按成员选择的主次方向分配条数并去重。具身智能作为研究范围理解，不预设为独立主题。</p><p>启用这个服务的目录作为引擎权威来源，需要管理员在部署时手工接通主题同步；保存配置不会自动修改旧引擎工作区。</p></aside>
    {message && <p role="status" className="mm-notice">{message}{conflict && " 当前草稿已保留，请先核对最新版本；不要直接重复提交。"}</p>}
    {busy && !draft && <p role="status">正在读取主题目录…</p>}
    <div className="mm-topic-layout"><nav className="mm-topic-list" aria-label="可管理主题">{profiles.map(profile => <button key={profile.topic.id} type="button" aria-pressed={selected?.topic.id === profile.topic.id} disabled={busy} onClick={() => edit(profile)}><strong>{profile.topic.name}</strong><span>{profile.topic.id}</span><span>{profile.topic.enabled && profile.topic.weight > 0 ? "已启用" : "已暂停"}</span></button>)}{!busy && !profiles.length && <p>{session.role === "lab_owner" ? "尚未建立主题目录，可以新增第一个研究方向。" : "尚未分配可管理的主题，请联系管理员。"}</p>}</nav>
    {draft ? <form className="mm-editor" onSubmit={e => { e.preventDefault(); void save(); }}><h3>{selected ? `编辑 ${selected.topic.name}` : "新增研究主题"}</h3><fieldset disabled={busy} className="mm-fields">
      <div className="mm-grid"><label>主题 ID<input required pattern="[a-z0-9-]+" maxLength={60} disabled={!!selected} value={draft.id} onChange={e => change("id", e.target.value)} placeholder="如 world-model" /></label><label>主题名称<input required maxLength={50} value={draft.name} onChange={e => change("name", e.target.value)} /></label>
      <label>优先级<select value={draft.priority} onChange={e => change("priority", e.target.value as Draft["priority"])}><option>P0</option><option>P1</option><option>P2</option></select></label><label>主题权重<input type="number" min={0} max={2} step={0.1} value={draft.weight} onChange={e => change("weight", Number(e.target.value))} /></label>
      <label>相关性阈值<input type="number" min={70} max={100} step={1} value={draft.relevanceThreshold ?? 70} onChange={e => change("relevanceThreshold", Number(e.target.value))} /></label><label>雷达最多条数<input type="number" min={1} max={100} step={1} value={draft.radarLimit ?? 20} onChange={e => change("radarLimit", Number(e.target.value))} /></label></div>
      <label className="mm-check"><input type="checkbox" checked={draft.enabled} onChange={e => change("enabled", e.target.checked)} />启用此主题</label><p className="mm-help">权重为 0 时也视为暂停。系统至少需要一个启用且权重大于 0 的主题。</p>
      <label>研究范围<textarea aria-label="研究范围" rows={4} maxLength={1200} value={draft.scope ?? ""} onChange={e => change("scope", e.target.value)} placeholder="说明本主题的直接研究贡献，以及与其他主题重叠时如何判断。" /></label>
      <div className="mm-grid"><label>主题关键词<textarea aria-label="主题关键词" rows={4} required value={draft.keywords} onChange={e => change("keywords", e.target.value)} placeholder="每行或逗号分隔一项；至少 2 个字符" /></label><label>同义词与别名<textarea aria-label="同义词与别名" rows={4} value={draft.aliases} onChange={e => change("aliases", e.target.value)} /></label><label>硬排除关键词<textarea aria-label="硬排除关键词" rows={3} value={draft.excludeKeywords} onChange={e => change("excludeKeywords", e.target.value)} /></label><label>不在范围内<textarea aria-label="不在范围内" rows={3} value={draft.exclusions} onChange={e => change("exclusions", e.target.value)} placeholder="每行一个判断条件，每项最多 300 字" /></label><label>正面例子<textarea aria-label="正面例子" rows={4} value={draft.positiveExamples} onChange={e => change("positiveExamples", e.target.value)} placeholder="每行一例，说明为什么属于本主题" /></label><label>反面例子<textarea aria-label="反面例子" rows={4} value={draft.negativeExamples} onChange={e => change("negativeExamples", e.target.value)} placeholder="每行一例，说明只是提及、没有直接贡献的情况" /></label></div>
      <section className="mm-subtopics"><h4>子方向</h4>{draft.subtopics.map((sub, index) => <fieldset key={index} className="mm-subtopic"><legend>子方向 {index + 1}</legend><div className="mm-grid"><label>子方向 ID<input required pattern="[a-z0-9-]+" maxLength={60} value={sub.id} onChange={e => change("subtopics", draft.subtopics.map((s, n) => n === index ? { ...s, id: e.target.value } : s))} /></label><label>子方向名称<input required maxLength={60} value={sub.name} onChange={e => change("subtopics", draft.subtopics.map((s, n) => n === index ? { ...s, name: e.target.value } : s))} /></label></div><label>子方向关键词<textarea required rows={2} value={sub.keywords} onChange={e => change("subtopics", draft.subtopics.map((s, n) => n === index ? { ...s, keywords: e.target.value } : s))} /></label><Button variant="ghost" onClick={() => change("subtopics", draft.subtopics.filter((_, n) => n !== index))}>移除子方向 {index + 1}</Button></fieldset>)}<Button disabled={draft.subtopics.length >= 20} onClick={() => change("subtopics", [...draft.subtopics, { id: "", name: "", keywords: "" }])}>添加子方向</Button></section>
      <div className="mm-actions"><Button type="submit" variant="primary" loading={busy} disabled={conflict}>保存主题</Button><Button onClick={() => { setDraft(null); setSelected(null); setConflict(false); setConfirmDelete(false); }}>取消编辑</Button>{selected && <Button variant="danger" onClick={() => setConfirmDelete(true)}>删除主题</Button>}</div>
      {confirmDelete && selected && <div className="mm-confirm" role="alert"><p>确认删除“{selected.topic.name}”？已有订阅可能需要重新选择方向，系统会保留历史审计。</p><div className="mm-actions"><Button variant="danger" onClick={() => void remove()}>确认删除主题</Button><Button onClick={() => setConfirmDelete(false)}>保留主题</Button></div></div>}
    </fieldset></form> : <div className="mm-empty">选择一个主题查看范围与收录标准。</div>}</div>
  </section>;
}
