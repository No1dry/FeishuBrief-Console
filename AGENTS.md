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

- Member `/app` (or `#/app`) imports only MemberApp and same-origin authenticated Member API code. Never import GitHubClient, RemoteProvider or WorkspaceProvider into the member dependency graph; never store member preferences, invitations, OTPs or private content in localStorage/sessionStorage. The separate FeishuBrief-Member service implements Phase 4; show invite-only email login on 401, and unavailable when the service is missing (404/501). Never substitute synthetic data or PAT login. Lab owners manage members through the same-origin member API with CSRF and expected revisions. Do not send real invitation/login email during tests.
- Admin topic profiles/radars require the corresponding backend feature capability. Radar reads must pin a private-state commit, validate the hash, and apply revocations before display. Keep `src/radar-contract.ts` identical to the engine contract apart from line endings.

## Phase 5 member Console

- `member-session.tsx` owns session epochs, cancellation, visibility/bfcache/BroadcastChannel invalidation and confirmed logout. Keep hidden tabs empty. An in-flight or uncertain logout must not reload private data on revalidation.
- `member-personal-api.ts` and `member-management-api.ts` parse the same-origin Member contracts. Read capability support before new routes; do not infer personal delivery or scheduling from a saved channel preference. Personal delivery remains disabled through Phase 5.
- Subscription draft preview is a separate read/compute operation. Saving uses `baseRevision`; preserve drafts on 409. Only explicit station edition creation writes history, with a stable `requestId` on an uncertain retry.
- Private edition deep links never grant access; use only the current session. Saved items and feedback must reflect server revocations and topic ACLs. Do not cache private content in persistent browser storage.
- `feishubrief-surface` in server HTML identifies the document CSP. Cross-surface navigation must fully reload; the member document may connect only to its own origin, while the legacy admin document may also connect to GitHub.
- See `docs/phase5-implementation.md`. `scripts/check-member-live.ts` is an optional sibling-project integration check using real local HTTP, in-memory SQLite and injected mail; never replace its synthetic data with production state.

## Phase 6 personal notifications

- Read `notificationBindings`, configured channels and runtime capabilities; never infer a verified account from a saved subscription channel. Keep all platform recipient identifiers and credentials server-side.
- Personal delivery is a separate explicit action on a fixed edition. Preserve its requestId and version on uncertain retries. Preview, save and station edition creation never send messages.
- Binding challenges belong to the current browser session. QR images must use the authenticated same-origin route; do not allow arbitrary remote image URLs or weaken CSP.
- Show accepted and provider-confirmed separately from member read feedback. Unknown outcomes require platform/manual review before an explicitly acknowledged resend; do not enable retry buttons that bypass unresolved sibling attempts.
- New pages use the existing session epoch and cancellation lifecycle. No private data in persistent browser storage, page URLs, logs or public artifacts.
