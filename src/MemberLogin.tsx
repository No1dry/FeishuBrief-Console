import { useEffect, useRef, useState } from "react";
import { Button } from "./components";
import { MemberApi } from "./member-api";

export default function MemberLogin({ api, invitationToken, onAuthenticated }: { api: MemberApi; invitationToken?: string; onAuthenticated: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const request = async () => {
    setBusy(true); setMessage("");
    try {
      const result = await api.requestCode(email.trim(), invitationToken);
      if (!active.current) return;
      setChallengeId(result.challengeId); setCode("");
      setMessage("若该邮箱已获邀请，验证码将发送至邮箱。请查看收件箱。");
    } catch (e) { if (active.current) setMessage(e instanceof Error ? e.message : "请求失败"); }
    finally { if (active.current) setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setMessage("");
    try {
      await api.verifyCode(challengeId, code.trim());
      if (active.current) { setCode(""); onAuthenticated(); }
    } catch (e) { if (active.current) setMessage(e instanceof Error ? e.message : "登录失败"); }
    finally { if (active.current) setBusy(false); }
  };
  return <section className="member-login" aria-labelledby="member-login-title">
    <p className="eyebrow">FEISHUBRIEF · MEMBERS</p>
    <h2 id="member-login-title">登录组内 Console</h2>
    <p>目前仅限受邀成员。使用管理员邀请的邮箱获取验证码，无需设置密码。</p>
    {invitationToken && <p className="aside-note">已读取邀请，请使用邀请对应的邮箱激活账号。</p>}
    <form onSubmit={e => { e.preventDefault(); void (challengeId ? verify() : request()); }}>
      <fieldset disabled={busy} className="member-form member-auth-fields">
        <label>受邀邮箱<input type="email" required maxLength={254} autoComplete="email" value={email} disabled={!!challengeId} onChange={e => setEmail(e.target.value)} /></label>
        {challengeId && <label>邮箱验证码<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} /></label>}
        <Button type="submit" variant="primary" loading={busy}>{challengeId ? "验证并登录" : "发送验证码"}</Button>
        {challengeId && <div className="page-actions"><Button onClick={() => void request()}>重新发送验证码</Button><Button onClick={() => { setChallengeId(""); setCode(""); setMessage(""); }}>更换邮箱</Button></div>}
      </fieldset>
    </form>
    {message && <p role="status" className="aside-note">{message}</p>}
  </section>;
}
