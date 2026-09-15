import { configSchema, diffConfig, reportQuality, type Config } from "./policy";
import type { ReportRecord, Snapshot, Source } from "./types";

export const BACKEND_REPOSITORY = "No1dry/FeishuBrief";
export const REPORT_REPOSITORY = "No1dry/daily-brief-site";
export const CONFIG_PATH = "config/editorial-profile.json";
const API = "https://api.github.com";
export interface RemoteConfig {
  config: Config;
  sha: string;
}
export interface Capabilities {
  version: number;
  supportedConfigPaths: string[];
  workflows: { generate: string; notify: string };
}
export interface GitHubSession {
  login: string;
  canWrite: boolean;
  remote: RemoteConfig;
  capabilities: Capabilities;
}
export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function encodeContent(value: unknown): string {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
function decodeContent(value: string): unknown {
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(value.replace(/\s+/g, "")), (c) => c.charCodeAt(0)),
    ),
  );
}
export function unsupportedChanges(
  before: Config,
  after: Config,
  capabilities: Capabilities,
): string[] {
  return diffConfig(before, after)
    .filter(
      (change) =>
        !capabilities.supportedConfigPaths.some(
          (prefix) =>
            change.path === prefix || change.path.startsWith(`${prefix}.`),
        ),
    )
    .map((change) => change.path);
}

export class GitHubClient {
  #token: string;
  #controller = new AbortController();
  constructor(
    token: string,
    private transport: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.#token = token.trim();
    if (this.#token.length < 20 || /\s/.test(this.#token))
      throw new Error("请填写有效的 GitHub 访问令牌。");
  }
  disconnect() {
    this.#token = "";
    this.#controller.abort();
  }
  async #request<T>(route: string, method = "GET", body?: unknown): Promise<T> {
    if (!this.#token) throw new GitHubError(401, "连接已关闭，请重新连接。");
    if (
      route !== "/user" &&
      !route.startsWith(`/repos/${BACKEND_REPOSITORY}`) &&
      !route.startsWith(`/repos/${REPORT_REPOSITORY}`)
    )
      throw new Error("请求超出工作区范围。");
    const response = await this.transport(`${API}${route}`, {
      method,
      redirect: "error",
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.#token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([
        this.#controller.signal,
        AbortSignal.timeout(45000),
      ]),
    });
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: "令牌无效或已过期，请重新连接。",
        403: "GitHub 拒绝请求：请检查令牌的仓库权限和 API 配额。",
        404: "资源不存在，或令牌没有权限访问简报仓库。",
        409: "配置已被其他操作修改，请重新读取后合并更改。",
        422: "GitHub 无法接受本次变更，请检查配置版本和操作参数。",
      };
      throw new GitHubError(
        response.status,
        messages[response.status] ??
          `GitHub 请求失败（${response.status}），请稍后重试。`,
      );
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  async #file(
    repository: string,
    path: string,
    ref = "main",
  ): Promise<{ value: unknown; sha: string }> {
    const file = await this.#request<{
      content: string;
      encoding: string;
      sha: string;
    }>(`/repos/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`);
    if (file.encoding !== "base64" || !file.content)
      throw new Error(`无法读取 ${path} 的完整内容。`);
    return { value: decodeContent(file.content), sha: file.sha };
  }
  async readConfig(): Promise<RemoteConfig> {
    const file = await this.#file(BACKEND_REPOSITORY, CONFIG_PATH);
    return { config: configSchema.parse(file.value), sha: file.sha };
  }
  async connect(): Promise<GitHubSession> {
    const [user, repo, remote, caps] = await Promise.all([
      this.#request<{ login: string }>("/user"),
      this.#request<{ permissions?: { push?: boolean } }>(
        `/repos/${BACKEND_REPOSITORY}`,
      ),
      this.readConfig(),
      this.#file(BACKEND_REPOSITORY, "config/console-capabilities.json"),
    ]);
    const capabilities = caps.value as Capabilities;
    if (
      capabilities.version !== 1 ||
      !Array.isArray(capabilities.supportedConfigPaths) ||
      capabilities.workflows?.generate !== "daily.yml" ||
      capabilities.workflows?.notify !== "push-feishu-once.yml"
    )
      throw new Error("后端工作台协议不兼容。");
    return {
      login: user.login,
      canWrite: repo.permissions?.push === true,
      remote,
      capabilities,
    };
  }
  async readSnapshot(): Promise<Snapshot> {
    const warnings: string[] = [];
    const [registered, candidates, runsResult, listing] = await Promise.all([
      this.#file(BACKEND_REPOSITORY, "sources.config.json"),
      this.#file(BACKEND_REPOSITORY, "sources.candidates.json"),
      this.#request<{ workflow_runs: Record<string, unknown>[] }>(
        `/repos/${BACKEND_REPOSITORY}/actions/runs?per_page=20`,
      ).catch(() => {
        warnings.push("Actions 记录读取失败，请检查 Actions 读取权限。");
        return { workflow_runs: [] };
      }),
      this.#request<{ name: string; type: string }[]>(
        `/repos/${REPORT_REPOSITORY}/contents?ref=gh-pages`,
      ).catch(() => {
        warnings.push("公开日报归档读取失败。");
        return [];
      }),
    ]);
    if (!Array.isArray(registered.value) || !Array.isArray(candidates.value))
      throw new Error("后端信源注册表格式不正确。");
    const sources = [...registered.value, ...candidates.value].map((s) => {
      const {
        id,
        name,
        type,
        url,
        category,
        subcategory,
        enabled,
        lang,
        locales,
        limit,
        dailyLimit,
        keywords,
        entityType,
        entity,
        tier,
        topics,
        shadowMode,
      } = s;
      return {
        id,
        name,
        type,
        url,
        category,
        subcategory,
        enabled,
        lang,
        locales,
        limit,
        dailyLimit,
        keywords,
        entityType,
        entity,
        tier,
        topics,
        shadowMode,
      } as Source;
    });
    const dates = listing
      .filter(
        (entry) =>
          entry.type === "dir" && /^\d{4}-\d{2}-\d{2}$/.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .slice(0, 7);
    const reports: ReportRecord[] = [];
    for (let i = 0; i < dates.length; i += 3) {
      const results = await Promise.allSettled(
        dates.slice(i, i + 3).map(async (date) => {
          const [report, articles] = await Promise.all([
            this.#file(REPORT_REPOSITORY, `${date}/${date}.json`, "gh-pages"),
            this.#file(
              REPORT_REPOSITORY,
              `${date}/${date}-articles.json`,
              "gh-pages",
            ),
          ]);
          const sidecar = articles.value as {
            articles: ReportRecord["articles"];
            displayedPaperKeys?: string[];
          };
          if (!Array.isArray(sidecar.articles))
            throw new Error("日报归档格式不正确");
          return {
            date,
            report: report.value as ReportRecord["report"],
            articles: sidecar.articles,
            displayedPaperKeys: sidecar.displayedPaperKeys,
            url: `https://no1dry.github.io/daily-brief-site/${date}/${date}.html`,
          };
        }),
      );
      results.forEach((result, j) =>
        result.status === "fulfilled"
          ? reports.push(result.value)
          : warnings.push(`${dates[i + j]}：归档读取失败`),
      );
    }
    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      origin: "github-live",
      repository: BACKEND_REPOSITORY,
      sources,
      reports: reports.sort((a, b) => b.date.localeCompare(a.date)),
      runs: runsResult.workflow_runs.map((r) => ({
        databaseId: r.id as number,
        status: r.status as string,
        conclusion: r.conclusion as string | null,
        workflowName: r.name as string,
        headSha: r.head_sha as string,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
        event: r.event as string,
        url: r.html_url as string,
      })),
      warnings,
    };
  }
  async publish(
    config: Config,
    session: GitHubSession,
  ): Promise<{ remote: RemoteConfig; commit: string; url: string }> {
    if (!session.canWrite) throw new Error("当前账号没有仓库写权限。");
    const validated = configSchema.parse(config);
    const unsupported = unsupportedChanges(
      session.remote.config,
      validated,
      session.capabilities,
    );
    if (unsupported.length)
      throw new Error(`这些配置尚未被后端支持：${unsupported.join("、")}`);
    const latest = await this.readConfig();
    if (latest.sha !== session.remote.sha)
      throw new GitHubError(409, "远程配置已变化，请先刷新并比较配置。");
    const result = await this.#request<{
      content: { sha: string };
      commit: { sha: string; html_url: string };
    }>(`/repos/${BACKEND_REPOSITORY}/contents/${CONFIG_PATH}`, "PUT", {
      message: `config: update editorial profile from console (${validated.name})`,
      content: encodeContent(validated),
      sha: session.remote.sha,
      branch: "main",
    });
    return {
      remote: { config: validated, sha: result.content.sha },
      commit: result.commit.sha,
      url: result.commit.html_url,
    };
  }
  async generate(): Promise<void> {
    await this.#request(
      `/repos/${BACKEND_REPOSITORY}/actions/workflows/daily.yml/dispatches`,
      "POST",
      { ref: "main", inputs: { send_notifications: false } },
    );
  }
  async notify(
    report: ReportRecord,
    channels: { feishu: boolean; pushplus: boolean },
  ): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(report.date) || !reportQuality(report).ok)
      throw new Error("该期日报未通过消息完整性检查，不能推送。");
    if (!channels.feishu && !channels.pushplus)
      throw new Error("至少选择一个推送渠道。");
    await this.#request(
      `/repos/${BACKEND_REPOSITORY}/actions/workflows/push-feishu-once.yml/dispatches`,
      "POST",
      {
        ref: "main",
        inputs: {
          report_date: report.date,
          chat_id: "",
          send_feishu: channels.feishu,
          send_pushplus: channels.pushplus,
        },
      },
    );
  }
  async readConfigVersions() {
    return this.#request<
      {
        sha: string;
        html_url: string;
        commit: { message: string; author: { date: string; name: string } };
      }[]
    >(
      `/repos/${BACKEND_REPOSITORY}/commits?path=${CONFIG_PATH}&sha=main&per_page=20`,
    );
  }
  async readVersion(sha: string): Promise<Config> {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("配置提交 ID 无效。");
    return configSchema.parse(
      (await this.#file(BACKEND_REPOSITORY, CONFIG_PATH, sha)).value,
    );
  }
}
