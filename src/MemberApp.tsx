import { useEffect, useState } from "react";
import { Button } from "./components";
import MemberLogin from "./MemberLogin";
import MemberAdmin from "./MemberAdmin";
import MemberRadar from "./MemberRadar";
import MemberSubscription from "./MemberSubscription";
import MemberBriefs from "./MemberBriefs";
import MemberLibrary from "./MemberLibrary";
import MemberTopics from "./MemberTopics";
import MemberOperations from "./MemberOperations";
import MemberNotifications from "./MemberNotifications";
import MemberDeliveries from "./MemberDeliveries";
import { MemberSessionProvider, useMemberSession } from "./member-session";
import { MemberApiError } from "./member-api";
import { loadSubscription, type PersonalComponentProps } from "./member-personal-api";
import "./member-shell.css";

// The invitation survives only in memory until verified; remove it before rendering.
let pendingInvitation: string | undefined;
if (/^#invite=/.test(location.hash) && /\/app(?:\/|$)/.test(location.pathname)) {
  const value = new URLSearchParams(location.hash.slice(1)).get("invite");
  if (value && value.length <= 512) pendingInvitation = value;
  history.replaceState(history.state, "", location.pathname + location.search);
}
const sections = [
  { path: "radar", label: "我的雷达", title: "我的主题雷达", description: "选择主次方向，调整本人关键词与子方向。" },
  { path: "subscription", label: "我的订阅", title: "我的订阅", description: "设置关注范围、阅读节奏与内容偏好。" },
  { path: "briefs", label: "我的简报", title: "我的简报", description: "阅读个人版本，回看历史与入选原因。" },
  { path: "library", label: "内容库", title: "内容库", description: "浏览已审核且获准阅读的研究内容。" },
  { path: "saved", label: "我的收藏", title: "我的收藏", description: "保留值得继续阅读的研究进展。" },
  { path: "notifications", label: "接收与通知", title: "接收与通知", description: "验证个人接收账号，管理定时投递与发送记录。" },
  { path: "members", label: "成员管理", title: "成员管理", description: "邀请组内成员并分配阅读与管理权限。" },
  { path: "topics", label: "主题管理", title: "主题管理", description: "维护研究边界与重叠主题的评估规则。" },
  { path: "operations", label: "服务运行", title: "服务运行与审计", description: "查看内容批次、站内组装与管理变更。" },
  { path: "deliveries", label: "投递管理", title: "个人投递管理", description: "核对发送状态，按固定版本与目标处理补发。" },
] as const;
function readPath() {
  const hash = location.hash.match(/^#\/app(?:\/(.*))?$/);
  const pathname = location.pathname.match(/\/app(?:\/(.*))?$/);
  return (hash ? hash[1] : pathname?.[1])?.replace(/\/$/, "") || "radar";
}
function FirstSteps({ api, session, onExpired, onNavigate }: PersonalComponentProps) {
  const [first, setFirst] = useState(false);
  useEffect(() => {
    let active = true;
    void loadSubscription(api).then(value => { if (active && !api.isClosed) setFirst(!value.subscription); })
      .catch(error => { if (active && !api.isClosed && error instanceof MemberApiError && error.status === 401) onExpired(); });
    return () => { active = false; };
  }, [api]);
  if (!first || !session.preferencesEnabled) return null;
  return <aside className="member-first-steps"><div><h2>开始你的个人简报</h2><p>选择主次方向，预览合格内容，再保存第一份订阅。</p></div><Button variant="primary" onClick={() => onNavigate("subscription")}>建立我的订阅</Button></aside>;
}
function MemberWorkspace() {
  const { api, session, capabilities, phase, message, epoch, refresh, expire, authenticated, logout } = useMemberSession();
  const [path, setPath] = useState(readPath);
  const [invitation, setInvitation] = useState(pendingInvitation);
  const [section, editionId, extra] = path.split("/");
  const current = sections.find(item => item.path === section);
  const owner = session?.role === "lab_owner", topicOwner = session?.role === "topic_owner";
  const navigate = (input: string) => {
    const next = input.replace(/^\/app\/?/, "") || "radar";
    const prefix = location.pathname.match(/^(.*\/app)(?:\/.*)?$/)?.[1];
    const suffix = next === "radar" ? "" : "/" + next;
    history.pushState(null, "", prefix ? prefix + suffix : "#/app" + suffix);
    setPath(readPath()); window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const changed = () => setPath(readPath());
    window.addEventListener("popstate", changed); window.addEventListener("hashchange", changed);
    return () => { window.removeEventListener("popstate", changed); window.removeEventListener("hashchange", changed); };
  }, []);
  useEffect(() => { document.title = (current?.title || "成员工作台") + " · FeishuBrief"; }, [current]);
  const signedIn = () => { pendingInvitation = undefined; setInvitation(undefined); authenticated(); };
  const allowed = ["members", "operations", "deliveries"].includes(section) ? owner : section === "topics" ? owner || topicOwner : true;
  const supported = ["radar", "members"].includes(section) ||
    (["notifications", "deliveries"].includes(section) ? capabilities?.notificationBindings : section === "subscription" ? capabilities?.draftPreview :
      section === "briefs" ? capabilities?.personalEditions :
      section === "library" || section === "saved" ? capabilities?.library && capabilities.feedback : !!capabilities);
  const valid = !!current && !extra && (!editionId || (section === "briefs" && /^[a-f0-9]{64}$/.test(editionId)));
  const props = api && session ? { api, session, onExpired: expire, onNavigate: navigate } : null;
  return <main className="member-shell member-workspace">
    <a className="member-skip" href="#member-content" onClick={event => { event.preventDefault(); const content = document.getElementById("member-content"); content?.focus(); content?.scrollIntoView({ block: "start" }); }}>跳至内容</a>
    <header className="page-heading member-heading"><div><p className="member-brand">FEISHUBRIEF <span>组内工作台</span></p><h1>{current?.title || "页面不存在"}</h1><p>{session ? session.displayName + " · " : ""}{current?.description}</p></div><div className="page-actions"><Button onClick={refresh} disabled={phase === "loading"}>重新读取</Button>{(session || phase === "logout-unconfirmed") && <Button onClick={() => void logout()}>退出</Button>}</div></header>
    {message && <p role="status" className="aside-note">{message}</p>}
    {phase === "loading" && !message && <p role="status">正在验证成员会话…</p>}
    {phase === "login" && api && <MemberLogin key={epoch} api={api} invitationToken={invitation} onAuthenticated={signedIn} />}
    {phase === "ready" && session && props && <>
      <nav className="page-tabs member-navigation" aria-label="成员工作台">{sections.filter(item =>
        (["radar", "members"].includes(item.path) || !!capabilities) &&
        (!["notifications", "deliveries"].includes(item.path) || capabilities?.notificationBindings) &&
        (!["members", "operations", "deliveries"].includes(item.path) || owner) && (item.path !== "topics" || owner || topicOwner)
      ).map(item => <button key={item.path} className={section === item.path ? "active" : ""} aria-current={section === item.path ? "page" : undefined} onClick={() => navigate(item.path)}>{item.label}</button>)}</nav>
      <div id="member-content" key={epoch + ":" + path} tabIndex={-1}>
        {!valid ? <p role="status">页面不存在。请从工作台导航选择功能。</p> : !allowed ? <p role="status">当前账号没有此页面的访问权限。</p> : !supported ? <p role="status">成员服务尚未提供此功能，请联系管理员升级服务。</p> : <>
          {section === "radar" && <>{capabilities?.draftPreview && <FirstSteps {...props} />}<MemberRadar {...props} /></>}
          {section === "subscription" && <MemberSubscription {...props} />}
          {section === "briefs" && <MemberBriefs {...props} editionId={editionId} />}
          {section === "library" && <MemberLibrary {...props} />}
          {section === "saved" && <MemberLibrary {...props} savedOnly />}
          {section === "notifications" && <MemberNotifications {...props} capabilities={capabilities!} />}
          {section === "members" && <MemberAdmin {...props} />}
          {section === "topics" && <MemberTopics {...props} />}
          {section === "operations" && <MemberOperations {...props} />}
          {section === "deliveries" && <MemberDeliveries {...props} />}
        </>}
      </div>
      <footer className="member-footer"><span>个人内容仅当前账号可见</span><span>现有群体完整简报继续保留</span></footer>
    </>}
  </main>;
}
export default function MemberApp() { return <MemberSessionProvider><MemberWorkspace /></MemberSessionProvider>; }
