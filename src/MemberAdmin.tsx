import { useEffect, useRef, useState } from "react";
import { Button } from "./components";
import { MemberApi, MemberApiError, type ManagedMember, type MemberRole, type MemberSession } from "./member-api";
import { invitationStatusLabels, loadInvitations, loadTopicCatalog, type ManagedInvitation, type ManagedTopicProfile } from "./member-management-api";
import "./member-management.css";

const roleLabels: Record<MemberRole, string> = { member: "普通成员", viewer: "只读成员", topic_owner: "主题负责人", lab_owner: "管理员" };
const topicIds = (value: string) => [...new Set(value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean))];
function RoleOptions() { return <>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</>; }
function TopicSelection({ label, value, onChange, profiles, all = false }: { label: string; value: string; onChange: (value: string) => void; profiles: ManagedTopicProfile[]; all?: boolean }) {
  const selected = topicIds(value);
  if (!profiles.length) return null;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(t => t !== id).join(", ") : [...selected.filter(t => t !== "*"), id].join(", "));
  return <fieldset className="mm-topic-checks"><legend>{label}</legend>{all && <label><input type="checkbox" checked={selected.includes("*")} onChange={e => onChange(e.target.checked ? "*" : "")} />全部主题</label>}{profiles.map(profile => <label key={profile.topic.id}><input type="checkbox" checked={selected.includes("*") || selected.includes(profile.topic.id)} disabled={selected.includes("*")} onChange={() => toggle(profile.topic.id)} />{profile.topic.name}</label>)}</fieldset>;
}
function MemberRow({ member, busy, profiles, update }: { member: ManagedMember; busy: boolean; profiles: ManagedTopicProfile[]; update: (member: ManagedMember, changes: { role?: MemberRole; ownedTopicIds?: string[]; readTopicIds?: string[]; status?: "active" | "disabled" }) => void }) {
  const [role, setRole] = useState(member.role);
  const [owned, setOwned] = useState(member.ownedTopicIds.join(", "));
  const [readable, setReadable] = useState(member.readTopicIds.join(", "));
  return <article className="member-management-row">
    <div><h3>{member.displayName || member.email}</h3><p>{member.email}</p><span className="badge">{member.status === "active" ? "已启用" : member.status === "disabled" ? "已停用" : "待激活"}</span></div>
    <fieldset disabled={busy} className="member-form member-auth-fields">
      <label>角色<select aria-label={`${member.email} 的角色`} value={role} onChange={e => setRole(e.target.value as MemberRole)}><RoleOptions /></select></label>
      <label>负责主题 ID<input aria-label={`${member.email} 的负责主题`} value={owned} onChange={e => setOwned(e.target.value)} placeholder="例如 vla, robotics" /></label>
      {role === "topic_owner" && <TopicSelection label={`${member.email} 的负责方向`} value={owned} onChange={setOwned} profiles={profiles} />}
      <label>可读主题 ID<input aria-label={`${member.email} 的可读主题`} value={readable} onChange={e => setReadable(e.target.value)} placeholder="* 表示全部主题；多个 ID 以逗号分隔" /></label>
      <TopicSelection label={`${member.email} 的阅读方向`} value={readable} onChange={setReadable} profiles={profiles} all />
      <div className="page-actions"><Button onClick={() => update(member, { role, ownedTopicIds: topicIds(owned), readTopicIds: topicIds(readable) })}>保存权限</Button><Button variant={member.status === "disabled" ? "secondary" : "danger"} onClick={() => update(member, { status: member.status === "disabled" ? "active" : "disabled" })}>{member.status === "disabled" ? "启用成员" : "停用成员"}</Button></div>
    </fieldset>
  </article>;
}

export default function MemberAdmin({ api, session, onExpired }: { api: MemberApi; session: MemberSession; onExpired: () => void }) {
  const [members, setMembers] = useState<ManagedMember[]>([]);
  const [invitations, setInvitations] = useState<ManagedInvitation[]>([]);
  const [profiles, setProfiles] = useState<ManagedTopicProfile[]>([]);
  const [listMessage, setListMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [blocked, setBlocked] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [owned, setOwned] = useState("");
  const [readable, setReadable] = useState("*");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const active = (id: number) => generation.current === id && !api.isClosed;
  const report = (e: unknown, id: number) => {
    if (!active(id)) return;
    if (e instanceof MemberApiError && e.status === 401) { onExpired(); return; }
    if (e instanceof MemberApiError && e.status === 403) { setMembers([]); setInvitations([]); setProfiles([]); setBlocked(true); }
    setMessage(e instanceof Error ? e.message : "操作失败");
  };
  const read = async (id: number) => {
    const result = await Promise.allSettled([api.members(), loadInvitations(api), loadTopicCatalog(api)]);
    if (!active(id)) return;
    const denied = result.find(r => r.status === "rejected" && r.reason instanceof MemberApiError && (r.reason.status === 401 || r.reason.status === 403));
    if (denied?.status === "rejected") throw denied.reason;
    if (result[0].status === "rejected") throw result[0].reason;
    setMembers(result[0].value.members);
    setInvitations(result[1].status === "fulfilled" ? result[1].value.invitations : []);
    setProfiles(result[2].status === "fulfilled" ? result[2].value.profiles : []);
    setListMessage([result[1].status === "rejected" ? "邀请列表暂时不可用。" : "", result[2].status === "rejected" ? "主题目录暂时不可用，可手动填写主题 ID。" : ""].filter(Boolean).join(" "));
  };
  useEffect(() => {
    const id = ++generation.current; setMembers([]); setInvitations([]); setProfiles([]); setMessage(""); setListMessage(""); setBlocked(false); setEmail(""); setName(""); setOwned(""); setReadable("*"); setRole("member");
    setBusy(session.role === "lab_owner");
    if (session.role === "lab_owner") void read(id).catch(e => report(e, id)).finally(() => { if (active(id)) setBusy(false); });
    return () => { generation.current++; };
  }, [api, session.userId, session.role]);
  const invite = async () => {
    const id = generation.current;
    setBusy(true); setMessage("");
    try {
      const result = await api.invite({ email: email.trim(), ...(name.trim() ? { displayName: name.trim() } : {}), role, ownedTopicIds: topicIds(owned), readTopicIds: topicIds(readable) });
      if (!active(id)) return;
      setMessage(`邀请已发送至 ${result.invitation.email}。有效期至 ${new Date(result.invitation.expiresAt).toLocaleString()}。`);
      setEmail(""); setName(""); await read(id);
    } catch (e) { report(e, id); }
    finally { if (active(id)) setBusy(false); }
  };
  const update = async (member: ManagedMember, changes: { role?: MemberRole; ownedTopicIds?: string[]; readTopicIds?: string[]; status?: "active" | "disabled" }) => {
    const id = generation.current;
    setBusy(true); setMessage("");
    try {
      await api.updateMember(member.userId, { baseRevision: member.revision, ...changes });
      if (!active(id)) return;
      if (member.userId === session.userId) { onExpired(); return; }
      await read(id); if (active(id)) setMessage("成员权限已更新，原有会话将重新验证。");
    } catch (e) { report(e, id); }
    finally { if (active(id)) setBusy(false); }
  };
  if (session.role !== "lab_owner" || blocked) return <section className="member-admin mm-section"><h2>成员与邀请</h2><p role="status">{message || "只有管理员可以管理成员和邀请。"}</p></section>;
  return <section className="member-admin" aria-labelledby="member-admin-title">
    <div className="section-head"><div><h2 id="member-admin-title">成员与邀请</h2><p>邀请成员加入组内工作台。账号权限变化后需要重新登录。</p></div><Button disabled={busy} onClick={() => { const id = generation.current; setBusy(true); void read(id).catch(e => report(e, id)).finally(() => { if (active(id)) setBusy(false); }); }}>刷新成员</Button></div>
    <form className="member-invite" onSubmit={e => { e.preventDefault(); void invite(); }}>
      <h3>邀请新成员</h3>
      <fieldset disabled={busy} className="member-form member-auth-fields">
        <label>成员邮箱<input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>成员称呼<input maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>邀请角色<select aria-label="邀请角色" value={role} onChange={e => setRole(e.target.value as MemberRole)}><RoleOptions /></select></label>
        <label>负责主题 ID<input value={owned} onChange={e => setOwned(e.target.value)} placeholder="例如 vla, robotics" /></label>
        {role === "topic_owner" && <TopicSelection label="选择负责方向" value={owned} onChange={setOwned} profiles={profiles} />}
        <label>可读主题 ID<input value={readable} onChange={e => setReadable(e.target.value)} placeholder="* 表示全部主题；多个 ID 以逗号分隔" /></label>
        <TopicSelection label="选择阅读方向" value={readable} onChange={setReadable} profiles={profiles} all />
        <p className="muted small">可读主题填 * 表示全部主题；留空则不授予主题阅读权限。</p>
        <Button type="submit" variant="primary" loading={busy}>发送邀请邮件</Button>
      </fieldset>
    </form>
    {message && <p role="status" className="aside-note">{message}</p>}
    {listMessage && <p className="mm-help">{listMessage}</p>}
    <label className="mm-help">成员状态 <select className="mm-status-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">全部成员</option><option value="active">已启用</option><option value="invited">待激活</option><option value="disabled">已停用</option></select></label>
    <div className="member-management-list">{members.filter(member => statusFilter === "all" || member.status === statusFilter).map(member => <MemberRow key={`${member.userId}:${member.revision}`} member={member} busy={busy} profiles={profiles} update={(item, changes) => void update(item, changes)} />)}</div>
    {!busy && !members.length && <p>尚无可显示的成员。</p>}
    <section className="mm-panel"><h3>最近邀请</h3><p className="mm-help">邀请只发送到指定邮箱。邀请有效期为 72 小时；重新发送会撤销旧邀请，不会变更已有权限。</p>{invitations.length ? <div className="mm-table-wrap"><table><thead><tr><th>邮箱</th><th>状态</th><th>有效期至</th><th>操作</th></tr></thead><tbody>{invitations.map(invitation => <tr key={invitation.invitationId}><td>{invitation.email}</td><td>{invitationStatusLabels[invitation.status]}</td><td>{new Date(invitation.expiresAt).toLocaleString()}</td><td>{invitation.status !== "accepted" && members.some(m => m.userId === invitation.userId && m.status === "invited") ? <Button disabled={busy} onClick={() => { const member = members.find(m => m.userId === invitation.userId)!; setEmail(member.email); setName(member.displayName); setRole(member.role); setOwned(member.ownedTopicIds.join(", ")); setReadable(member.readTopicIds.join(", ")); setMessage("邀请信息已填入上方表单。确认后点击发送邀请邮件，旧邀请将失效。"); }}>填写重邀信息</Button> : "—"}</td></tr>)}</tbody></table></div> : !busy && <p className="mm-empty">暂无邀请记录。</p>}</section>
  </section>;
}
