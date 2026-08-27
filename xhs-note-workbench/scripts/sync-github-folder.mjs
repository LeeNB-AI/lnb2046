import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const repository = "LeeNB-AI/lnb2046";
const branch = "main";
const targetPrefix = "xhs-note-workbench";
const root = process.cwd();

const files = [
  ".gitignore",
  ".vercelignore",
  "README.md",
  "api/[...path].js",
  "api/_cloud.js",
  "app.js",
  "index.html",
  "package-lock.json",
  "package.json",
  "server.js",
  "styles.css",
  "supabase/schema.sql",
  "vercel.json",
  "start-workbench.command",
  "start-workbench-windows.bat",
  "scripts/sync-github-folder.mjs",
];

async function readToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const rl = readline.createInterface({ input, output });
  const token = await rl.question("GitHub token: ");
  rl.close();
  return token.trim();
}

function githubRequest(token, method, apiPath, body = null) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "api.github.com",
        path: apiPath,
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "xhs-note-workbench-sync",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (raw += chunk));
        response.on("end", () => {
          const data = raw ? JSON.parse(raw) : {};
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(data.message || `GitHub API HTTP ${response.statusCode}`));
            return;
          }
          resolve(data);
        });
      },
    );
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function main() {
  const token = await readToken();
  if (!token) throw new Error("Missing GitHub token");

  const branchInfo = await githubRequest(token, "GET", `/repos/${repository}/branches/${branch}`);
  const parentSha = branchInfo.commit.sha;
  const baseTree = branchInfo.commit.commit.tree.sha;

  const tree = [];
  for (const file of files) {
    const localPath = path.join(root, file);
    if (!fs.existsSync(localPath)) continue;
    const content = fs.readFileSync(localPath, "utf8");
    const blob = await githubRequest(token, "POST", `/repos/${repository}/git/blobs`, {
      content,
      encoding: "utf-8",
    });
    tree.push({
      path: `${targetPrefix}/${file}`,
      mode: file === "start-workbench.command" ? "100755" : "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  const nextTree = await githubRequest(token, "POST", `/repos/${repository}/git/trees`, {
    base_tree: baseTree,
    tree,
  });
  const commit = await githubRequest(token, "POST", `/repos/${repository}/git/commits`, {
    message: "Add AI knowledge import and product image folders",
    tree: nextTree.sha,
    parents: [parentSha],
  });
  await githubRequest(token, "PATCH", `/repos/${repository}/git/refs/heads/${branch}`, {
    sha: commit.sha,
    force: false,
  });

  console.log(`Synced ${tree.length} files to ${repository}/${targetPrefix} at ${commit.sha}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
