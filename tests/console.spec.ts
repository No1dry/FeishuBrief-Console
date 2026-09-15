import { test, expect } from "@playwright/test";
import { mockGitHub, open, reconnect } from "./github-fixture";
test.beforeEach(async ({ page }) => {
  await mockGitHub(page);
});
import {
  configSchema,
  defaultConfig,
  includesKeyword,
  previewPapers,
  reportQuality,
} from "../src/policy";
import type { ReportRecord } from "../src/types";

test("configuration rejects secrets and insufficient message counts", () => {
  expect(
    configSchema.safeParse({ ...defaultConfig, apiKey: "not-a-real-key" })
      .success,
  ).toBe(false);
  expect(
    configSchema.safeParse({
      ...defaultConfig,
      notifications: {
        ...defaultConfig.notifications,
        feishu: { tech: 1, finance: 0, politics: 0 },
      },
    }).success,
  ).toBe(false);
  expect(includesKeyword("triage agents and agency news", "agent")).toBe(false);
  expect(
    includesKeyword("vision-language-action policy", "vision language action"),
  ).toBe(true);
  expect(
    includesKeyword("Multi-Agent reinforcement learning", "multi-agent"),
  ).toBe(true);
});

test("historical paper preview deduplicates arXiv across platforms and honors source switches", () => {
  const article = {
    sourceId: "arxiv-cs-ai",
    title: "VLA benchmark",
    url: "https://arxiv.org/abs/2609.01234v2",
    excerpt:
      "We propose vision-language-action models. An open-source benchmark and dataset with experimental evaluation. ".repeat(
        3,
      ),
    category: "tech" as const,
  };
  const report = {
    date: "2026-09-14",
    articles: [
      article,
      {
        ...article,
        sourceId: "huggingface-papers",
        url: "https://huggingface.co/papers/2609.01234",
      },
    ],
    report: {
      hero_headline: "",
      daily_overview: "",
      tech_briefs: [],
      finance_briefs: [],
      politics_briefs: [],
    },
    url: "",
  } satisfies ReportRecord;
  const sources = [
    {
      id: "arxiv-cs-ai",
      name: "arXiv",
      url: "",
      type: "rss",
      category: "tech" as const,
    },
  ];
  expect(
    previewPapers(report, [], sources, defaultConfig).filter((p) => p.accepted),
  ).toHaveLength(1);
  expect(
    previewPapers(
      report,
      [{ ...report, date: "2026-09-13" }],
      sources,
      defaultConfig,
    ).filter((p) => p.accepted),
  ).toHaveLength(0);
  expect(reportQuality(report).ok).toBe(false);
});

test("research edits persist, undo, preview and version restore work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "/#/research");
  await expect(
    page.getByRole("heading", { name: "研究重点", exact: true }),
  ).toBeVisible();
  const weight = page.getByRole("slider", { name: "World Model 关注权重" });
  await weight.fill("1.8");
  await expect(weight).toHaveValue("1.8");
  await reconnect(page);
  await expect(weight).toHaveValue("1.8");
  await page.getByRole("button", { name: "预览影响", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "策略影响预览" }),
  ).toBeVisible();
  await expect(
    page.getByText("研究主题 / world-model / 权重", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存版本", exact: true }).click();
  await page.getByLabel("版本名称", { exact: true }).fill("研究策略测试");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存版本", exact: true })
    .click();
  await weight.fill("0.4");
  await page.getByRole("button", { name: "撤销更改", exact: true }).click();
  await expect(weight).toHaveValue("1.8");
  await page.getByRole("button", { name: "重做更改", exact: true }).click();
  await expect(weight).toHaveValue("0.4");
  await open(page, "/#/versions");
  await page.getByRole("button", { name: "查看差异", exact: true }).click();
  await page.getByRole("button", { name: "恢复为草稿", exact: true }).click();
  await open(page, "/#/research");
  await expect(weight).toHaveValue("1.8");
  expect(errors).toEqual([]);
});

test("source filtering, toggles, detail limits and export", async ({
  page,
}) => {
  await open(page, "/#/sources");
  await page
    .getByRole("textbox", { name: "搜索", exact: true })
    .fill("OpenAI News");
  await expect(page.locator(".source-row")).toHaveCount(1);
  const toggle = page.getByRole("switch", {
    name: "启用 OpenAI News",
    exact: true,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await reconnect(page);
  await page
    .getByRole("textbox", { name: "搜索", exact: true })
    .fill("OpenAI News");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "OpenAI News", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "每日上限", exact: true })
    .fill("12");
  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出配置", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("editorial-profile.json");
});

test("messages expose incomplete reports; web controls do not shrink notifications", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") requests.push(r.url());
  });
  await open(page, "/#/messages");
  await expect(
    page.getByText("归档摘要未通过完整性检查", { exact: true }),
  ).toBeVisible();
  const tech = page.getByRole("spinbutton", {
    name: "技术动态条数",
    exact: true,
  });
  await expect(tech).toHaveValue("5");
  await open(page, "/#/reports");
  await page.getByRole("button", { name: "网页展示", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "技术动态展示上限", exact: true })
    .fill("20");
  await open(page, "/#/messages");
  await expect(tech).toHaveValue("5");
  await page.getByRole("button", { name: "手机宽度", exact: true }).click();
  await expect(page.locator(".message-preview")).toHaveClass(/mobile/);
  expect(requests).toEqual([]);
});

test("keyword dialog validates duplicates and saves a real new focus", async ({
  page,
}) => {
  await open(page, "/#/research");
  await page.getByRole("button", { name: "新增主题", exact: true }).click();
  await page.getByLabel("主题名称", { exact: true }).fill("机器人学习");
  await page.getByLabel("主题 ID", { exact: true }).fill("robot-learning");
  await page
    .getByRole("textbox", { name: "添加关键词", exact: true })
    .fill("robot learning");
  await page
    .getByRole("textbox", { name: "添加关键词", exact: true })
    .press("Enter");
  await page.getByRole("button", { name: "保存主题", exact: true }).click();
  await expect(
    page
      .locator(".topic-identity")
      .getByRole("button", { name: "机器人学习", exact: true }),
  ).toBeVisible();
});

test("global search and invalid config import", async ({ page }) => {
  await open(page, "/#/overview");
  await page.getByRole("button", { name: "搜索工作台", exact: true }).click();
  await page
    .getByRole("combobox", { name: "搜索页面、信源和内容" })
    .fill("信源");
  await page
    .getByRole("combobox", { name: "搜索页面、信源和内容" })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "信源管理", exact: true }),
  ).toBeVisible();
  await open(page, "/#/settings");
  await page.getByLabel("导入配置文件").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...defaultConfig, unauthorizedField: "secret" }),
    ),
  });
  await expect(page.getByRole("alert")).toContainText("配置不符合 V3 协议");
});

for (const width of [320, 375, 414, 768, 1024, 1440]) {
  test(`all pages fit ${width}px with no runtime errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 1000 });
    for (const id of [
      "overview",
      "research",
      "sources",
      "papers",
      "reports",
      "messages",
      "models",
      "runs",
      "versions",
      "settings",
    ]) {
      await open(page, `/#/${id}`);
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1 }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        id,
      ).toBe(true);
      if (["overview", "research", "sources"].includes(id))
        await page.screenshot({
          path: `test-results/screenshots/${id}-${width}.png`,
          fullPage: true,
        });
    }
    expect(errors).toEqual([]);
  });
}

test("disconnect returns to the private workspace gate", async ({ page }) => {
  await open(page, "/#/settings");
  await page.getByRole("button", { name: "断开连接", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "连接 GitHub 工作区" }),
  ).toBeVisible();
});

test("parallel tabs detect stale edits without overwriting the saved draft", async ({
  page,
  context,
}) => {
  await open(page, "/#/research");
  await expect(
    page.getByRole("heading", { name: "研究重点", exact: true }),
  ).toBeVisible();
  const other = await context.newPage();
  await mockGitHub(other);
  await open(other, "/#/research");
  await expect(
    other.getByRole("heading", { name: "研究重点", exact: true }),
  ).toBeVisible();
  await page.getByRole("slider", { name: "World Model 关注权重" }).fill("1.9");
  await expect(other.getByRole("alert")).toContainText("另一个窗口已更新配置");
  await other.getByRole("slider", { name: "World Model 关注权重" }).fill("0.2");
  await reconnect(page);
  await expect(
    page.getByRole("slider", { name: "World Model 关注权重" }),
  ).toHaveValue("1.9");
});

test("numeric editing allows clearing and corrects out-of-range values", async ({
  page,
}) => {
  await open(page, "/#/models");
  const input = page.getByRole("spinbutton", { name: "主编超时", exact: true });
  await input.clear();
  await input.pressSequentially("420");
  await expect(input).toHaveValue("420");
  await input.fill("30");
  await input.blur();
  await expect(input).toHaveValue("420");
  await expect(page.getByText("范围 120–600，已保留原值")).toBeVisible();
  await page.getByRole("button", { name: "架构参考", exact: true }).click();
  const image = page.getByRole("dialog").locator("img");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(1672);
});

test("mobile navigation and keyboard dialog dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "/");
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "论文策略", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "论文策略", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "搜索工作台", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("visible text meets contrast requirements", async ({ page }) => {
  for (const id of [
    "overview",
    "research",
    "sources",
    "papers",
    "messages",
    "models",
  ]) {
    await open(page, `/#/${id}`);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1 }),
    ).toBeVisible();
    const failures = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d")!;
      const rgba = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      const luminance = (color: number[]) =>
        color
          .slice(0, 3)
          .map((v) => {
            const n = v / 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          })
          .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
      const failures: { text: string; ratio: number }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        if (
          !el.getClientRects().length ||
          el.closest(":disabled") ||
          ![...el.childNodes].some(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
          )
        )
          continue;
        const style = getComputedStyle(el);
        if (style.visibility !== "visible" || style.opacity === "0") continue;
        let parent: Element | null = el,
          background: number[] = [];
        while (parent) {
          background = rgba(getComputedStyle(parent).backgroundColor);
          if (background[3] === 255) break;
          parent = parent.parentElement;
        }
        if (!parent) continue;
        const a = luminance(rgba(style.color)),
          b = luminance(background);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const minimum =
          parseFloat(style.fontSize) >= 24 ||
          (parseFloat(style.fontSize) >= 18 && Number(style.fontWeight) >= 700)
            ? 3
            : 4.5;
        if (ratio < minimum)
          failures.push({
            text: (el.textContent ?? "").trim().slice(0, 40),
            ratio: Math.round(ratio * 100) / 100,
          });
      }
      return failures;
    });
    expect(failures, id).toEqual([]);
  }
});
