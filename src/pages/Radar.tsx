import { useEffect, useState } from "react";
import { useRemote } from "../remote";
import { Button, Empty } from "../components";
import RadarView, { initialPreferences } from "../RadarView";
import type { RadarSnapshot, RadarPreferences } from "../radar-contract";

export default function Radar() {
  const remote = useRemote();
  const [radar, setRadar] = useState<RadarSnapshot | null>(null);
  const [error, setError] = useState("");
  const [preferences, setPreferences] = useState<RadarPreferences>();
  const [refresh, setRefresh] = useState(0);
  const supported = remote.session?.capabilities.features?.topicRadar === 1;
  useEffect(() => {
    let cancelled = false;
    setRadar(null); setPreferences(undefined); setError("");
    if (supported && remote.api) void remote.api.readRadar().then(result => {
      if (cancelled) return;
      const ids = result.revokedRevisionIds;
      setRadar({ ...result.radar, items: result.radar.items.filter(i => !ids.has(i.revisionId)), topics: result.radar.topics.map(t => ({ ...t, itemIds: t.itemIds.filter(id => !ids.has(id)) })) });
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "读取失败"); });
    return () => { cancelled = true; };
  }, [remote.api, remote.session, refresh, supported]);
  return <>
    <header className="page-heading"><div><h1>主题雷达</h1><p>共享合格内容、主题证据与跨主题去重。主题设置在“研究重点”维护。</p></div><Button onClick={() => setRefresh(n => n + 1)}>刷新雷达</Button></header>
    {!supported && <Empty title="当前后端尚未开放主题雷达" />}
    {error && <p role="alert">{error}</p>}
    {supported && !radar && !error && <p role="status">正在读取私有雷达…</p>}
    {radar && <>
      <div className="radar-toolbar"><Button onClick={() => setPreferences(preferences ? undefined : initialPreferences(radar))}>{preferences ? "退出偏好预览" : "预览成员偏好"}</Button><span>版本 {radar.radarId.slice(0, 12)} · {radar.topics.length} 个主题</span></div>
      <p className="muted small">雷达保留生成时的主题设置；管理员更新配置后，新共享批次才会采用新的边界。</p>
      {preferences && <p className="aside-note">这是管理员的临时预览，关闭后清空。成员在独立成员端维护本人偏好；此处不会保存订阅或发送消息。</p>}
      <RadarView key={radar.radarId + String(!!preferences)} radar={radar} preferences={preferences} onChange={setPreferences} showDiagnostics />
    </>}
  </>;
}
