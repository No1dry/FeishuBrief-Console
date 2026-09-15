import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repo = "No1dry/FeishuBrief-Console";
const root = fileURLToPath(new URL("../", import.meta.url));
const token = execFileSync("gh", ["auth", "token"], {
  encoding: "utf8",
}).trim();
async function api(route, method = "GET", body, optional = false) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/${route}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    },
  );
  if (optional && response.status === 404) return null;
  if (!response.ok)
    throw new Error(`${method} ${route}: HTTP ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}
async function files(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isSymbolicLink())
      throw new Error("Symlinks are not deployment assets");
    if (entry.isDirectory())
      result.push(
        ...(await files(path.join(directory, entry.name), `${name}/`)),
      );
    else
      result.push({
        name,
        content: await readFile(path.join(directory, entry.name)),
      });
  }
  return result;
}
const assets = [
  ...(await files(path.join(root, "dist"))),
  { name: ".nojekyll", content: Buffer.from("") },
];
for (const asset of assets) {
  if (
    /snapshot\.json|sources\.config|editorial-profile\.json|\.env/i.test(
      asset.name,
    )
  )
    throw new Error(`Private data cannot be deployed: ${asset.name}`);
  if (
    /\.(?:js|json|html)$/.test(asset.name) &&
    /(?:github_pat_|ghp_)[a-zA-Z0-9_]{20,}|oc_[a-zA-Z0-9]{20,}/.test(
      asset.content.toString(),
    )
  )
    throw new Error(`Credential pattern in ${asset.name}`);
}
const ref = await api("git/ref/heads/gh-pages", "GET", undefined, true);
const parent = ref?.object.sha ?? (await api("git/ref/heads/main")).object.sha;
const oldTree = ref
  ? await api(`git/trees/${parent}?recursive=1`)
  : { tree: [] };
const existing = new Set(
  oldTree.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.sha),
);
const entries = [];
for (let i = 0; i < assets.length; i += 6) {
  entries.push(
    ...(await Promise.all(
      assets.slice(i, i + 6).map(async ({ name, content }) => {
        let sha = createHash("sha1")
          .update(`blob ${content.length}\0`)
          .update(content)
          .digest("hex");
        if (!existing.has(sha))
          sha = (
            await api("git/blobs", "POST", {
              content: content.toString("base64"),
              encoding: "base64",
            })
          ).sha;
        return { path: name, mode: "100644", type: "blob", sha };
      }),
    )),
  );
  console.log(
    `Static assets ${Math.min(i + 6, assets.length)}/${assets.length}`,
  );
}
const tree = await api("git/trees", "POST", { tree: entries });
const commit = await api("git/commits", "POST", {
  message: "deploy: publish authenticated FeishuBrief Console",
  tree: tree.sha,
  parents: [parent],
});
if (ref)
  await api("git/refs/heads/gh-pages", "PATCH", {
    sha: commit.sha,
    force: false,
  });
else
  await api("git/refs", "POST", {
    ref: "refs/heads/gh-pages",
    sha: commit.sha,
  });
const pages = await api("pages", "GET", undefined, true);
if (!pages)
  await api("pages", "POST", {
    source: { branch: "gh-pages", path: "/" },
    build_type: "legacy",
  });
else if (pages.source?.branch !== "gh-pages" || pages.source?.path !== "/")
  throw new Error("Unexpected Pages source; not overwriting it.");
console.log(
  JSON.stringify({
    commit: commit.sha,
    url: "https://no1dry.github.io/FeishuBrief-Console/",
  }),
);
