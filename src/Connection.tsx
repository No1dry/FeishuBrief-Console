import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  CloudUpload,
  GitBranch,
  KeyRound,
  LogOut,
  Play,
  RefreshCw,
  Send,
} from "lucide-react";
import { Badge, Button, ExternalLink, Modal, Select } from "./components";
import { BACKEND_REPOSITORY, unsupportedChanges } from "./github";
import { DiffTable } from "./pages/Operations";
import { diffConfig, reportQuality } from "./policy";
import { useRemote } from "./remote";
import { useWorkspace } from "./workspace";

const tokenSetup =
  "https://github.com/settings/personal-access-tokens/new?name=FeishuBrief%20Console&description=Personal%20briefing%20workbench&target_name=No1dry&contents=write&actions=write";
export function ConnectionGate() {
  const remote = useRemote();
  const [token, setToken] = useState("");
  return (
    <section className="connection-gate">
      <span className="connection-emblem">
        <GitBranch size={30} />
      </span>
      <h1>连接 GitHub 工作区</h1>
      <p>载入私有信源与编辑策略，管理日报运行。</p>
      <div className="connection-repository">
        <span>后端仓库</span>
        <strong>{BACKEND_REPOSITORY}</strong>
        <Badge>私有</Badge>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = token;
          setToken("");
          void remote.connect(value);
        }}
      >
        <label className="field">
          GitHub 访问令牌
          <input
            aria-label="GitHub 访问令牌"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Fine-grained personal access token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={remote.busy}
            required
          />
        </label>
        {remote.error && (
          <p className="field-error" role="alert">
            {remote.error}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          icon={KeyRound}
          loading={remote.busy}
          disabled={token.trim().length < 20 && !remote.busy}
        >
          {remote.busy ? "正在载入工作区" : "连接工作区"}
        </Button>
        {remote.busy && <Button onClick={remote.disconnect}>取消</Button>}
      </form>
      <div className="connection-help">
        <p>仅授权 FeishuBrief 仓库：Contents 与 Actions 读写权限。</p>
        <p>
          令牌仅在当前页面内存中使用，刷新或关闭后需重新连接。不会上传到前端仓库或写入浏览器存储。
        </p>
        <ExternalLink href={tokenSetup}>创建细粒度 Token</ExternalLink>
      </div>
    </section>
  );
}

export function PublishDialog({ onClose }: { onClose: () => void }) {
  const remote = useRemote();
  const workspace = useWorkspace();
  if (!remote.session) return null;
  const changes = diffConfig(remote.session.remote.config, workspace.config);
  const unsupported = unsupportedChanges(
    remote.session.remote.config,
    workspace.config,
    remote.session.capabilities,
  );
  return (
    <Modal title="提交配置到 GitHub" onClose={onClose} wide>
      <div className="preview-context">
        <Badge tone="blue">{BACKEND_REPOSITORY}</Badge>
        <span>main · 下次运行读取新配置</span>
      </div>
      <DiffTable
        before={remote.session.remote.config}
        after={workspace.config}
      />
      {!!unsupported.length && (
        <div className="quality-notice">
          <CircleAlert size={18} />
          <div>
            <strong>以下配置尚未接入后端</strong>
            <p>{unsupported.join("、")}</p>
          </div>
          <Button
            onClick={() => workspace.replace(remote.session!.remote.config)}
          >
            载入远程配置
          </Button>
        </div>
      )}
      {remote.error && (
        <p className="field-error" role="alert">
          {remote.error}
        </p>
      )}
      {workspace.error && <p className="field-error">{workspace.error}</p>}
      <div className="save-boundary">
        <GitBranch size={16} />
        <span>本次提交只更新编辑策略，不触发日报或发送消息。</span>
      </div>
      <div className="modal-actions">
        <Button
          onClick={() => void remote.refresh()}
          loading={remote.busy}
          icon={RefreshCw}
        >
          读取远程配置
        </Button>
        <Button
          icon={CloudUpload}
          variant="primary"
          loading={remote.busy}
          disabled={
            !changes.length ||
            !!unsupported.length ||
            !remote.session.canWrite ||
            workspace.conflict
          }
          onClick={async () => {
            if (await remote.publish(structuredClone(workspace.config)))
              onClose();
          }}
        >
          确认提交
        </Button>
      </div>
    </Modal>
  );
}

export function RemoteStatus() {
  const remote = useRemote();
  if (!remote.session) return <ConnectionGate />;
  return (
    <section className="settings-section">
      <div className="connection-row">
        <GitBranch size={24} />
        <div>
          <strong>{BACKEND_REPOSITORY}</strong>
          <span>
            {remote.session.login} ·{" "}
            {remote.session.canWrite ? "仓库可写" : "只读访问"}
          </span>
        </div>
        <Badge tone="green">已连接</Badge>
      </div>
      <div className="connection-row">
        <KeyRound size={24} />
        <div>
          <strong>当前页面会话</strong>
          <span>令牌不持久化；后台仍会独立执行定时日报</span>
        </div>
      </div>
      <div className="backup-row">
        <Button
          icon={RefreshCw}
          loading={remote.busy}
          onClick={() => void remote.refresh()}
        >
          刷新工作区
        </Button>
        <Button icon={LogOut} onClick={remote.disconnect}>
          断开连接
        </Button>
      </div>
      {remote.error && (
        <p role="alert" className="field-error">
          {remote.error}
        </p>
      )}
      {remote.lastCommit && (
        <ExternalLink href={remote.lastCommit}>查看最近配置提交</ExternalLink>
      )}
    </section>
  );
}

export function RunDialog({
  mode,
  onClose,
}: {
  mode: "generate" | "notify";
  onClose: () => void;
}) {
  const remote = useRemote();
  const workspace = useWorkspace();
  const [date, setDate] = useState(remote.snapshot?.reports[0]?.date ?? "");
  const [feishu, setFeishu] = useState(false),
    [pushplus, setPushplus] = useState(false),
    [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [error, setError] = useState("");
  const record = remote.snapshot?.reports.find(
    (report) => report.date === date,
  );
  const quality = record ? reportQuality(record) : null;
  const dirty = remote.session
    ? diffConfig(remote.session.remote.config, workspace.config).length
    : 0;
  const submit = async () => {
    if (!remote.api || !remote.session?.canWrite || busy || submitted) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "generate") await remote.api.generate();
      else if (record) await remote.api.notify(record, { feishu, pushplus });
      else throw new Error("请选择已归档日报。");
      setSubmitted(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "任务提交失败，请检查 Actions 权限。",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={mode === "generate" ? "生成日报，不推送" : "推送已归档日报"}
      onClose={onClose}
    >
      {submitted ? (
        <div className="empty">
          <Check size={28} />
          <h2>任务已提交</h2>
          <p>GitHub 将异步排队执行。任务提交成功不等于生成或推送已经完成。</p>
          <ExternalLink
            href={`https://github.com/${BACKEND_REPOSITORY}/actions`}
          >
            查看 Actions 状态
          </ExternalLink>
        </div>
      ) : (
        <div className="form-stack">
          {mode === "generate" ? (
            <>
              <p>
                运行完整抓取与生成流程，发布网页，跳过飞书和 PushPlus 消息发送。
              </p>
              <div className="save-boundary">
                <GitBranch size={16} />
                <span>
                  使用 main 中已提交的配置
                  {dirty ? `；当前仍有 ${dirty} 处未提交更改` : ""}。
                </span>
              </div>
            </>
          ) : (
            <>
              <label className="field">
                日报日期
                <Select
                  label="推送日报日期"
                  value={date}
                  onChange={setDate}
                  options={(remote.snapshot?.reports ?? []).map((report) => ({
                    value: report.date,
                    label: report.date,
                  }))}
                />
              </label>
              <label className="channel-check">
                <input
                  type="checkbox"
                  checked={feishu}
                  onChange={(e) => setFeishu(e.target.checked)}
                />
                飞书：仓库预设群
              </label>
              <label className="channel-check">
                <input
                  type="checkbox"
                  checked={pushplus}
                  onChange={(e) => setPushplus(e.target.checked)}
                />
                微信：仓库预设 PushPlus 订阅
              </label>
              <p className="data-note">
                使用已有日报，不重新抓取或调用模型。该操作会发送真实消息；重复提交可能重复发送。
              </p>
              {quality && !quality.ok && (
                <p className="field-error">
                  该期摘要未通过检查：{quality.issues.join("；")}
                </p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button onClick={onClose}>取消</Button>
            <Button
              variant="primary"
              icon={mode === "generate" ? Play : Send}
              loading={busy}
              disabled={
                !remote.session?.canWrite ||
                (mode === "notify" && (!quality?.ok || (!feishu && !pushplus)))
              }
              onClick={() => void submit()}
            >
              {mode === "generate" ? "确认生成" : "确认推送"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
