# FeishuBrief Console

This repository owns only the React/Vite frontend. The private backend is No1dry/FeishuBrief. Published reports are in No1dry/daily-brief-site. Never mix the three deployment targets.

- Keep the GitHub credential in memory only. Never persist it, add it to build-time environment variables, log it, include it in a URL, or send it outside api.github.com.
- Never bundle actual private source/config/run snapshots in the public frontend. Test fixtures must be synthetic and labelled as such.
- Configuration writes are limited to config/editorial-profile.json on the backend main branch, with an expected file SHA. The backend independently validates the protocol.
- The generate command must keep send_notifications=false. Existing-report notification is a separate, explicit confirmation and must leave chat_id empty to use the repository's preset destination.
- Do not dispatch real generation or notifications during tests. Browser tests intercept GitHub API requests.
- Do not mark unsupported weekly or multi-model settings as active. Read backend capabilities before submitting.
- Preserve the existing tokens, responsive layout and bilingual type pairing.
- Run npm test and npm run build for changes to authentication, configuration or dispatch logic.
