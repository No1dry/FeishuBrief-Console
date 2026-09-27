import { useEffect, useRef, useState } from "react";
import { Button } from "./components";
import RadarView from "./RadarView";
import { previewRadar, type RadarSnapshot, type RadarPreferences } from "./radar-contract";
import { MemberApi, MemberApiError, type MemberSession } from "./member-api";

export default function MemberRadar({ api, session, onExpired }: { api: MemberApi; session: MemberSession; onExpired: () => void }) {
  const [radar, setRadar] = useState<RadarSnapshot | null>(null);
  const [preferences, setPreferences] = useState<RadarPreferences | null>(null);
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(true), [message, setMessage] = useState("");
  const active = useRef(false);
  useEffect(() => {
    let mounted = true; active.current = true;
    void Promise.all([api.radar(), api.preferences()]).then(([radar, data]) => {
      if (!mounted || api.isClosed) return;
      setRadar(radar); setPreferences(data.preferences); setRevision(data.revision);
    }).catch(error => {
      if (!mounted || api.isClosed) return;
      if (error instanceof MemberApiError && error.status === 401) onExpired();
      else setMessage(error instanceof MemberApiError && error.code === "no_readable_topics" ? error.message : "已登录。主题内容暂时不可用，可稍后重新读取。");
    }).finally(() => { if (mounted && !api.isClosed) setBusy(false); });
    return () => { mounted = false; active.current = false; };
  }, [api]);
  const save = async () => {
    if (!preferences || !radar || !session.preferencesEnabled || busy) return;
    try { previewRadar(radar, preferences); } catch { setMessage("请检查主次方向、子方向和关键词后再保存。"); return; }
    setBusy(true); setMessage("");
    try {
      const result = await api.save(preferences, revision);
      if (!active.current || api.isClosed) return;
      setPreferences(result.preferences); setRevision(result.revision); setMessage("偏好已保存。保存和预览不会发送消息。");
    } catch (error) {
      if (!active.current || api.isClosed) return;
      if (error instanceof MemberApiError && [401, 403].includes(error.status)) { onExpired(); return; }
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally { if (active.current && !api.isClosed) setBusy(false); }
  };
  return <section aria-label="主题雷达与快速偏好">
    {message && <p role="status" className="aside-note">{message}</p>}
    {busy && !radar && <p role="status">正在读取主题雷达…</p>}
    {radar && preferences && <>
      <p className="muted small">调整关注范围并预览已有合格内容。</p>
      <fieldset disabled={busy} className="member-form"><RadarView key={`${radar.radarId}:${revision}`} radar={radar} preferences={preferences} onChange={setPreferences} /></fieldset>
      <Button variant="primary" disabled={busy || !session.preferencesEnabled} onClick={() => void save()}>保存我的偏好</Button>
      {!session.preferencesEnabled && <p>当前账号为只读，无法保存偏好。</p>}
    </>}
  </section>;
}
