# FeishuBrief Console

独立前端工作台。后端仍是私有仓库 `No1dry/FeishuBrief` 及其 GitHub Actions，日报网页仍在 `No1dry/daily-brief-site`。

前端地址：<https://no1dry.github.io/FeishuBrief-Console/>

## 登录

本节说明原有管理员 GitHub 控制台登录；组内成员使用下方 Phase 4 的邮箱验证码入口，无需 GitHub Token。

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

## Phase 2 主题雷达

管理员入口新增主题雷达；研究重点支持可配置收录范围、排除说明、正反例、子方向、相关性阈值、上限及删除主题。默认 VLA、WM、Agent、Robotics、RL 为可交叉研究维度，具身智能不再是独立默认主题。

成员入口 `/app` 或 `#/app` 支持主次方向、个人关键词、排除词、子方向与有代码偏好，使用独立的认证 API。当前仓库不包含 Member Service；未部署时显示未开放，不能把模拟测试通过当成真实成员系统上线。见 [成员 API 契约](docs/member-radar-api.md)。

## Phase 4 组内邀请登录

独立的同级项目 [FeishuBrief-Member](https://github.com/No1dry/FeishuBrief-Member/blob/main/README.md) 已提供成员服务。Console `/app` 已实现邀请制邮箱登录（8 位验证码）、管理员发送邀请、成员角色和阅读权限管理、停用成员及版本冲突保护；原有主题雷达与个人关键词偏好继续通过同源 API 保存。账号包括管理员、主题负责人、普通成员和只读成员；服务端负责最终权限检查。

本地启动、初始化首位管理员与登录步骤见 [Member Service 使用说明](https://github.com/No1dry/FeishuBrief-Member/blob/main/README.md)，HTTPS、SMTP、持久化数据库和同源代理配置见 [部署与运维](https://github.com/No1dry/FeishuBrief-Member/blob/main/docs/deployment.md)。本地 Vite 设置 `MEMBER_API_PROXY=1` 后可连接 `127.0.0.1:5190`；生产尚未部署，真实邮件投递尚未验收。单独发布 GitHub Pages 不会提供成员认证服务。

Phase 4 提供登录、邀请、角色管理和雷达偏好；完整个人和管理闭环已在下述 Phase 5 实现。Phase 6 已增加验证绑定和个人通知入口，运行能力依赖 Member Service 的显式配置，默认关闭。现有群体完整简报及群推送保持原流程。

## Phase 5 个人与管理闭环

- 我的订阅：主次方向、子方向、关键词、排除词、类型、条数、比例、开源偏好、频率及暂停；首次引导和独立草稿预览。
- 版本冲突保留草稿，读取最新版本后按字段确认合并。
- 我的简报：服务端预览、明确确认的站内成版、最近 100 个版本和私人深链接；展示入选原因与证据。
- 内容库与收藏：主题/类型/阅读状态筛选，已读、收藏、不相关及撤回；按当前权限和内容撤销过滤。
- 管理：成员邀请和主题授权、主题增删改及负责人权限、导入批次和站内组装统计、邀请状态与审计。
- 会话统一清理；后台和跨标签切换不保留旧账号内容；退出未确认时保持清空并支持重试。

成员功能入口为 `/app`，旧群体管理入口为 `/admin`。保存、预览及站内成版均不会发送飞书或微信消息。Phase 6 的外部通知通过单独确认或已明确启用的个人计划执行。

详见 [Phase 5 实现与验收说明](docs/phase5-implementation.md)。本地代码及浏览器联调完成；生产服务器、域名与真实 SMTP 仍需配置，尚未上线。

## Phase 6 个人绑定与通知

`/app/notifications` 提供飞书私聊一次性码、微信 PushPlus 好友二维码与验证码、解绑、上海时区的个人计划和固定版本通知。成员不填写平台接收 ID 或发送 Token。外部消息为更新提醒与本人登录后可读的版本链接。

管理员 `/app/deliveries` 可查询平台结果、记录未知结果的人工核对和确认补发；补发固定原版本与接收目标，需填写原因并确认重复风险。界面将平台受理、平台确认、未知和已读区分。详见 [Phase 6 Console](docs/phase6-implementation.md) 及 [平台接入/部署](https://github.com/No1dry/FeishuBrief-Member/blob/main/docs/phase6-implementation.md)。
