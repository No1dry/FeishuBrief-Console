# Member Radar API v1

此文档是成员页面的对接契约。Phase 4 的真实服务端已实现在独立目录 `FeishuBrief-Member`，Console 保持纯前端。当前已完成本地代码与离线验证；生产域名、SMTP 和服务部署需要单独配置。

页面使用同源 `/api/member/`，会话为 Secure、HttpOnly Cookie，服务端验证 Origin/CSRF。跨域部署通过受控反向代理接到同源；不向 URL、前端构建或 localStorage 放入私人数据/Token。

| 方法与路径 | 请求 / 响应 |
|---|---|
| `POST auth/request-code` | `{email, invitationToken?}` → `{challengeId}`；仅受邀邮箱可激活，响应不泄露邮箱是否存在 |
| `POST auth/verify-code` | `{challengeId, code}` → 会话对象；code 为 8 位数字，服务端设置 HttpOnly Cookie |
| `GET session` | `{userId, displayName, csrfToken, preferencesEnabled, role, ownedTopicIds, readTopicIds}`；401 表示未登录。客户端兼容不含角色字段的旧接口 |
| `GET radar` | `RadarSchema`，来自共享合格池，且已按此成员的阅读权限和当前撤销状态过滤；禁止输出管理员可见但成员无权读取的内容或诊断 |
| `GET preferences` | `{revision, preferences}`，只取会话本人 |
| `PUT preferences` | 请求 `{baseRevision, preferences}`；响应 `{revision, preferences}`；版本不同返回 409 |
| `POST logout` | `{}`，验证 CSRF 后撤销会话并返回 204 |
| `GET admin/members` | `{members:[{userId,email,displayName,role,status,revision,ownedTopicIds,readTopicIds}]}`；仅 `lab_owner`，成员 revision 为正整数 |
| `POST admin/invitations` | `{email,displayName?,role,ownedTopicIds,readTopicIds}` → `{user,invitation:{invitationId,email,expiresAt,status}}`；邀请只通过邮件发送，expiresAt 为毫秒时间戳 |
| `PUT admin/members/:id` | `{baseRevision,role?,ownedTopicIds?,readTopicIds?,status?}`；CAS 更新；权限变化撤销该成员原会话 |

所有响应 `Cache-Control: no-store`，JSON 接口设置 `application/json`。错误为 `{error:string}`。未部署服务可返回 404/501。登录前的两个 `auth/` 写接口通过精确 Origin、JSON、HttpOnly 浏览器 nonce 保护；其他写请求携带 `X-CSRF-Token`。个人偏好接口不接受客户端指定 `userId`，服务端从会话决定所有权。管理员修改目标成员仍需服务端再次校验 `lab_owner`。

邀请链接为 `/app#invite=<一次性令牌>`。成员页读取后立即清除 URL fragment，仅在内存保留到验证完成。邮箱、OTP、会话 CSRF、邀请令牌和私人内容不写入 localStorage/sessionStorage，不引入 GitHub PAT。注册模式固定为邀请制，用户自行注册是后续产品化方案。

`role` 为 `lab_owner | topic_owner | member | viewer`；`status` 为 `invited | active | disabled`。可读主题填 `*` 表示全部主题，空列表不授予主题阅读权限。Console 邀请表单默认 `*`，管理员可以限定主题 ID；负责主题和阅读权限分别设置。服务端保护最后一个启用管理员，并要求新成员完成邮箱验证后才能启用。

`preferences` 严格遵循 `src/radar-contract.ts`：

```json
{
  "primaryTopicId": "vla",
  "secondaryTopicIds": ["robotics", "reinforcement-learning"],
  "keywords": ["manipulation"],
  "excludeKeywords": [],
  "subtopicIds": {"vla": ["policy"]},
  "codeOnly": false
}
```

服务端还必须验证当前主题是否启用、成员是否可订阅、子方向归属、账号状态和并发版本；普通成员和 Topic Owner 不能通过这个接口修改全局主题。`preferencesEnabled=false` 的只读成员不得写入。成员关键词不能绕过证据、质量、主题可见性或撤销门。

成员主次方向与条目主归属是两个独立关系。主题雷达页面只预览已有合格条目，不创建正式 PersonalEdition。Phase 5 的“我的订阅”和“我的简报”接入服务端组装及个人历史，见下节；个人自动调度仍未启用。

客户端在退出、401/403、会话重新读取和账号切换时取消旧请求并清空内存。切回浏览器标签页时重新验证会话。退出请求失败时清空本页私人数据并提供重试，不把请求失败宣称为已退出。服务端即时阻止已停用账号，前端检查不能代替服务端授权。已登录但尚无雷达时，管理员仍可进入成员管理。

部署时为 `/app`、`/admin` 提供 SPA 回退；单纯 GitHub Pages 可用 `#/app` 打开成员入口，但 Pages 本身不能提供这些认证 API。管理员入口继续连接私库，成员模块不会导入 GitHub/Workspace Provider。

本地开发：Member Service 监听 `127.0.0.1:5190`；启动 Vite 前设置 `MEMBER_API_PROXY=1`，将 `/api/member` 转发到该服务。Member Service 的 `MEMBER_ORIGIN` 应设为浏览器实际访问的前端源 `http://127.0.0.1:5180`。代理默认关闭，不把上游 API 地址注入浏览器构建。邀请流程使用 `/app` 路径，需要 SPA fallback。

## Phase 5 完整接口

新页面先读取 `GET capabilities`，明确草稿预览、个人版本、内容库与反馈能力；个人投递和调度当前均为关闭。缺少能力接口的旧服务仍可使用雷达与成员管理，新页面不会假定可用。

| 方法与路径 | Console 用途 |
| --- | --- |
| `GET topics` | 订阅可选主题和子方向 |
| `GET/PUT subscription` | 本人完整订阅，带 `baseRevision` 保存 |
| `POST preview` | `{subscription:草稿}` 零写入预览，或 `{subscriptionRevisionId}` 预览已保存版本；两者互斥 |
| `GET/POST editions` | 本人历史；明确站内成版携带稳定 `requestId` |
| `GET editions/:editionId` | 私人版本深链接，服务端检查本人、当前权限与撤销 |
| `GET library` | 可读合格内容与仍有效的本人历史收藏 |
| `GET/POST feedback` | 读取本人当前反馈、标记与撤回 |
| `GET/PUT/DELETE admin/topics[/topicId]` | 完整目录管理及负责人权限、乐观版本控制 |
| `GET admin/invitations` | 邀请状态 |
| `GET admin/operations` | 批次/目录匹配/站内成版统计；个人发送记录明确未启用 |
| `GET admin/audit` | 管理员最近审计事件 |

确切服务端字段见 [Member API](https://github.com/No1dry/FeishuBrief-Member/blob/main/docs/api.md)，完整行为见 [Phase 5 说明](phase5-implementation.md)。个人版本返回展示投影，不应作为完整引擎重放协议验证。所有权不由 URL 中的标识决定。
