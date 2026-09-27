import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Empty, ExternalLink } from "./components";
import { MemberApiError } from "./member-api";
import { FeedbackButtons, togglePersonalFeedback, type FeedbackKind } from "./MemberBriefs";
import { contentTypeLabels, loadLibrary, loadTopics, personalError, usePersonalScope, type LibraryEntry, type MemberTopic, type PersonalComponentProps } from "./member-personal-api";
import "./member-personal.css";

export default function MemberLibrary({ api, session, onExpired, onNavigate, savedOnly = false }: PersonalComponentProps & { savedOnly?: boolean }) {
  const [items, setItems] = useState<LibraryEntry[]>([]), [topics, setTopics] = useState<MemberTopic[]>([]), [currentAvailable, setCurrentAvailable] = useState(true);
  const [busy, setBusy] = useState(true), [message, setMessage] = useState(""), [search, setSearch] = useState(""), [topic, setTopic] = useState("all"), [type, setType] = useState("all"), [read, setRead] = useState("all"), [relevance, setRelevance] = useState("all");
  const scope = usePersonalScope(api, `${session.userId}:${savedOnly}`);
  const fail = (error: unknown) => { if (error instanceof MemberApiError && error.status === 401) { setItems([]); onExpired(); } else { if (error instanceof MemberApiError && error.status === 403) setItems([]); setMessage(personalError(error)); } };
  useEffect(() => {
    const token = scope.capture(); setBusy(true); setItems([]); setTopics([]); setMessage("");
    void (async () => {
      const [library, catalog] = await Promise.allSettled([loadLibrary(api), loadTopics(api)]);
      if (!scope.current(token)) return;
      if (library.status === "rejected") throw library.reason;
      if (catalog.status === "rejected" && catalog.reason instanceof MemberApiError && catalog.reason.status === 401) throw catalog.reason;
      setItems(library.value.items); setCurrentAvailable(library.value.currentAvailable);
      if (catalog.status === "fulfilled") setTopics(catalog.value.topics);
    })().catch(error => { if (scope.current(token)) fail(error); }).finally(() => { if (scope.current(token)) setBusy(false); });
  }, [api, session.userId, savedOnly]);
  const reload = async () => {
    const token = scope.capture(); setBusy(true); setMessage("");
    try { const result = await loadLibrary(api); if (!scope.current(token)) return; setItems(result.items); setCurrentAvailable(result.currentAvailable); }
    catch (error) { if (scope.current(token)) { setItems([]); fail(error); } } finally { if (scope.current(token)) setBusy(false); }
  };
  const toggle = async (entry: LibraryEntry, kind: FeedbackKind) => {
    if (busy || session.role === "viewer") return; const token = scope.capture(); setBusy(true); setMessage("");
    try {
      await togglePersonalFeedback(api, entry.item.eventId, entry.feedback, kind); if (!scope.current(token)) return;
      const result = await loadLibrary(api); if (!scope.current(token)) return; setItems(result.items); setCurrentAvailable(result.currentAvailable);
      setMessage("反馈已更新。已读、不相关和收藏会用于后续个人简报；已有固定版本保持不变。");
    } catch (error) { if (scope.current(token)) { setItems([]); fail(error); } } finally { if (scope.current(token)) setBusy(false); }
  };
  const names = new Map(topics.map(t => [t.id, t.name]));
  const topicIds = [...new Set(items.flatMap(entry => [entry.item.primaryTopicId, ...entry.item.secondaryTopicIds]))];
  const rows = useMemo(() => items.filter(entry => (!savedOnly || entry.feedback.saved) && (topic === "all" || [entry.item.primaryTopicId, ...entry.item.secondaryTopicIds].includes(topic)) &&
    (type === "all" || entry.item.contentType === type) && (read === "all" || entry.feedback.read === (read === "read")) && (relevance === "all" || entry.feedback.notRelevant === (relevance === "not-relevant")) &&
    (!search.trim() || `${entry.item.title}\n${entry.item.summary}\n${entry.item.sourceId}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))), [items, savedOnly, topic, type, read, relevance, search]);
  return <section className="member-personal" aria-labelledby="member-library-title"><div className="section-head"><div><h2 id="member-library-title">{savedOnly ? "我的收藏" : "内容库"}</h2><p>{savedOnly ? "查看自己的收藏，已撤回或失去访问权限的内容不会显示。" : "浏览当前可访问的合格内容，以及个人历史收藏。"}</p></div><div className="member-personal-toolbar"><Button disabled={busy} onClick={() => void reload()}>刷新内容</Button><Button onClick={() => onNavigate(savedOnly ? "/app/library" : "/app/saved")}>{savedOnly ? "浏览内容库" : "我的收藏"}</Button></div></div>
    {!currentAvailable && <p className="aside-note">当前共享内容尚未就绪，下面仍可查看有效的历史收藏。</p>}
    {message && <p role="status" className="aside-note">{message}</p>}
    <div className="member-personal-filters"><label>搜索内容<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="标题、摘要或来源" /></label><label>主题筛选<select aria-label="内容主题筛选" value={topic} onChange={e => setTopic(e.target.value)}><option value="all">全部主题</option>{topicIds.map(id => <option key={id} value={id}>{names.get(id) || id}</option>)}</select></label><label>类型筛选<select aria-label="内容类型筛选" value={type} onChange={e => setType(e.target.value)}><option value="all">全部类型</option>{Object.entries(contentTypeLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>阅读状态<select aria-label="阅读状态筛选" value={read} onChange={e => setRead(e.target.value)}><option value="all">全部</option><option value="unread">未读</option><option value="read">已读</option></select></label><label>相关性<select aria-label="相关性筛选" value={relevance} onChange={e => setRelevance(e.target.value)}><option value="all">全部</option><option value="relevant">未标记不相关</option><option value="not-relevant">不相关</option></select></label></div>
    <p className="muted small">{rows.length} 个独立事件 · 同一事件的交叉主题合并显示。</p>
    {busy && !items.length && <p role="status">正在读取内容…</p>}
    {rows.map(entry => <article className="member-personal-card" key={entry.item.eventId}><div className="radar-tags"><Badge tone="blue">{names.get(entry.item.primaryTopicId) || entry.item.primaryTopicId}</Badge>{entry.item.secondaryTopicIds.map(id => <Badge key={id}>交叉：{names.get(id) || id}</Badge>)}{entry.origin === "saved-history" && <Badge>历史收藏</Badge>}{entry.feedback.read && <Badge>已读</Badge>}{entry.feedback.saved && <Badge>已收藏</Badge>}{entry.feedback.notRelevant && <Badge>已标记不相关</Badge>}</div>
      <h3><ExternalLink href={entry.item.url}>{entry.item.title}</ExternalLink></h3><p>{entry.item.summary}</p><p className="muted small">{entry.item.sourceId} · {contentTypeLabels[entry.item.contentType as keyof typeof contentTypeLabels] || entry.item.contentType} · 质量 {entry.item.quality} · 代码：{entry.item.codeStatus === "confirmed" ? "已确认有" : entry.item.codeStatus === "absent" ? "已确认无" : "未知"}</p>
      <details><summary>相关依据</summary>{entry.item.assessments.map(a => <div className="radar-evidence" key={a.topicId}><strong>{names.get(a.topicId) || a.topicId} · {a.relevance}</strong><p>{a.reason}</p>{a.evidenceQuotes.map((quote, i) => <blockquote key={i}>{quote}</blockquote>)}</div>)}</details>
      <FeedbackButtons state={entry.feedback} disabled={busy || session.role === "viewer"} onToggle={kind => void toggle(entry, kind)} />
    </article>)}
    {!busy && !rows.length && <Empty title={savedOnly ? "暂无符合筛选条件的收藏" : "暂无符合筛选条件的内容"} />}
    {session.role === "viewer" && <p className="muted small">当前账号为只读，不能修改收藏或反馈。</p>}
  </section>;
}
