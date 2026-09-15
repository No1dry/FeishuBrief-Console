# FeishuBrief Console

独立前端工作台。后端仍是私有仓库 `No1dry/FeishuBrief` 及其 GitHub Actions，日报网页仍在 `No1dry/daily-brief-site`。

前端地址：<https://no1dry.github.io/FeishuBrief-Console/>

## 登录

打开工作台，使用仅授权 `No1dry/FeishuBrief` 的细粒度 GitHub Token，选择：

- Contents：Read and write，用于读取信源和提交编辑配置。
- Actions：Read and write，用于查看运行记录和手动触发现有工作流。
- Metadata：Read-only，GitHub 自动提供。

Token 仅保存在当前页面的内存中，刷新或关闭后需要重新输入。不要把 Token 写入源码、环境构建参数、URL、localStorage 或 sessionStorage。只读 Token 可查看数据，写入权限不足时 GitHub 会拒绝操作。

页面直接调用 GitHub 官方 REST API。没有代理服务，不会把令牌发送给其他域名；公开的 Pages 构建中不包含私有信源注册表、实际编辑策略、运行记录或历史日报快照。

## 已连接的功能

- 读取私库信源、当前编辑配置、Actions 运行状态，以及已公开的七期日报归档。
- 编辑研究方向、关键词、别名、排除词、主题权重与优先级。
- 编辑信源启停、优先级、抓取上限，论文阈值、数量、arXiv 上限和历史排重窗口。
- 编辑主编候选数量、网页唯一文章上限、消息栏目数量、总览开关和主编超时。
- 提交前显示与远程配置的差异；只允许修改后端的 `config/editorial-profile.json`。提交会产生正常 Git 提交，下次运行读取该版本。
- 用文件 SHA 检查并发冲突，拒绝覆盖已经变化的远程配置。
- “生成日报”调用现有 `daily.yml`，固定传入 `send_notifications: false`。
- “推送已有日报”独立确认日期和渠道，固定使用仓库预设目标，不提供群 ID 输入；不完整摘要禁止提交。
- 本地草稿、撤销重做、版本备份、导入导出和历史内容回放。

提交配置不会自动触发日报。手动任务被 GitHub 接收后会排队执行；提交成功不表示任务已经完成，应在运行中心或原始 Actions 页面核对。

周报生成、DeepSeek Worker/Reviewer 和语义评分尚未加入后端。后端的 `config/console-capabilities.json` 标明可生效字段，未支持字段的变更会被提交检查阻止，不会假装生效。

论文回放使用已保存的候选和确定性线索，不能恢复之前已被剔除的数据，也不是模型学术质量评分。生产端沿用已有论文评分与排重实现，并读取新的编辑配置。关键词用于候选筛选和主编排序，不会自动改写所有平台的搜索 API。

## 本地开发

```sh
npm ci
npm run dev
npm test
npm run build
```

默认端口 5180。测试使用模拟 GitHub 响应，不发送真实消息；默认使用本机 Google Chrome。测试自动启动本地服务。

## 发布 Pages

```sh
gh auth login
npm run deploy
```

部署脚本只向 `No1dry/FeishuBrief-Console` 的 `gh-pages` 分支上传静态构建，使用 GitHub Pages 的分支发布模式。它不会访问或修改日报后端的 Secrets、推送群、定时设置，也不依赖给 GitHub CLI 增加 workflow 写入权限。

更新前端源码后，先将源码提交到本仓库，再运行部署。构建时不要复制原型的 `public/data/snapshot.json`；部署器会拒绝这类私有快照。

## 代码

- `src/github.ts`：固定仓库和路径的 GitHub API 客户端。
- `src/remote.tsx`：内存会话、远程同步和提交状态。
- `src/Connection.tsx`：登录、配置差异确认和手动任务确认。
- `src/workspace.tsx`：本地草稿与远程基准，区分本地保存和远程生效。
- `src/policy.ts`：配置协议和历史回放；后端使用同版本协议独立校验。
- `src/pages/`：研究、信源、论文、日报、消息、模型、运行和版本视图。
- `scripts/deploy-pages.mjs`：独立 Pages 发布。

设计沿用 `frontend-design` 和 `hallmark` 的 Cobalt 工作台。字体在构建中自托管，图标使用 Lucide。
