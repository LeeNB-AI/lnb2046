#!/usr/bin/env node
"use strict";

const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");

const PORT = Number(process.env.XHS_HELPER_PORT || 4789);
const HOST = "127.0.0.1";
let cachedXhsPath = process.env.XHS_BIN || "";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function send(res, status, payload) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function run(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout: options.timeout || 30000,
        maxBuffer: options.maxBuffer || 12 * 1024 * 1024,
        env: { ...process.env, PATH: helperPath() },
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error?.code || 0,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          message: String(stderr || error?.message || "").trim(),
        });
      },
    );
  });
}

function helperPath() {
  const additions = [
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), ".cargo", "bin"),
    path.join(os.homedir(), ".npm-global", "bin"),
  ];
  return [...additions, process.env.PATH || ""].join(path.delimiter);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error("请求内容太大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("请求 JSON 无法识别"));
      }
    });
    req.on("error", reject);
  });
}

async function commandExists(command) {
  if (!command) return "";
  if (command.includes("/") || command.includes("\\")) {
    const result = await run(command, ["--help"], { timeout: 12000 });
    return result.ok ? command : "";
  }
  const checker = process.platform === "win32" ? "where" : "which";
  const result = await run(checker, [command], { timeout: 12000 });
  return result.ok ? result.stdout.split(/\r?\n/).find(Boolean)?.trim() || command : "";
}

async function findXhs(preferred = "") {
  const candidates = [
    preferred,
    cachedXhsPath,
    process.env.XHS_BIN,
    path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "xhs.exe" : "xhs"),
    "xhs",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const found = await commandExists(candidate);
    if (!found) continue;
    const result = await run(found, ["--help"], { timeout: 12000 });
    if (result.ok) {
      cachedXhsPath = found;
      return found;
    }
  }
  return "";
}

function parseJsonLoose(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function xhsStatus(preferred = "") {
  const xhsPath = await findXhs(preferred);
  if (!xhsPath) {
    return {
      available: false,
      loggedIn: false,
      needsInstall: true,
      message: "未检测到小红书 CLI。请点击安装，或确认 xhs 已加入系统 PATH。",
    };
  }
  const result = await run(xhsPath, ["status", "--json"], { timeout: 30000 });
  const data = parseJsonLoose(result.stdout.trim());
  const loggedIn =
    result.ok &&
    !/login|not.*logged|未登录|扫码|qrcode|unauthorized/i.test(`${result.stdout}\n${result.stderr}`);
  return {
    available: true,
    loggedIn,
    needsInstall: false,
    xhsCliPath: xhsPath,
    raw: data || result.stdout || result.stderr,
    message: loggedIn ? "小红书 CLI 已连接并已登录" : "小红书 CLI 已安装，但需要扫码登录",
  };
}

async function installXhs(preferred = "") {
  const current = await findXhs(preferred);
  if (current) return { xhs: await xhsStatus(current), message: "小红书 CLI 已可用" };
  let uv = await commandExists("uv");
  if (!uv) {
    return {
      xhs: await xhsStatus(preferred),
      error: "未检测到 uv。请先运行下载的本地助手安装脚本，它会自动安装 uv 和 xhs CLI。",
    };
  }
  const install = await run(uv, ["tool", "install", "xiaohongshu-cli", "--force"], {
    timeout: 180000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!install.ok) {
    return { xhs: await xhsStatus(preferred), error: install.message || "小红书 CLI 安装失败" };
  }
  return { xhs: await xhsStatus(preferred), message: "小红书 CLI 安装完成" };
}

async function loginXhs(preferred = "") {
  const install = await installXhs(preferred);
  if (install.error) return install;
  const xhsPath = install.xhs.xhsCliPath || (await findXhs(preferred));
  if (!xhsPath) return { xhs: install.xhs, error: "未检测到 xhs CLI" };
  if (install.xhs.loggedIn) return { xhs: install.xhs, message: "已经登录，无需重复扫码" };
  console.log("");
  console.log("XHS login QR code will appear below. Please scan with the Xiaohongshu app.");
  console.log("Recommendation: use a Xiaohongshu account that is not your main daily account.");
  console.log("");
  const code = await new Promise((resolve) => {
    const child = spawn(xhsPath, ["login", "--qrcode"], {
      stdio: "inherit",
      env: { ...process.env, PATH: helperPath() },
    });
    child.on("close", resolve);
    child.on("error", () => resolve(1));
  });
  const status = await xhsStatus(xhsPath);
  return {
    xhs: status,
    message: code === 0 || status.loggedIn ? "登录流程已结束" : "登录流程结束，但仍未确认登录成功",
  };
}

async function fetchHotspots(body) {
  const preferred = body.xhsCliPath || "";
  const status = await xhsStatus(preferred);
  if (!status.available) return { status: { xhs: status }, error: status.message };
  if (!status.loggedIn) return { status: { xhs: status }, error: "小红书 CLI 需要先扫码登录" };
  const category = body.product?.xhsCategory || body.xhsCategory || "love";
  const xhsPath = status.xhsCliPath || (await findXhs(preferred));
  const attempts = [
    ["hot", "-c", category, "--json"],
    ["hotspots", "-c", category, "--json"],
    ["trending", "-c", category, "--json"],
  ];
  for (const args of attempts) {
    const result = await run(xhsPath, args, { timeout: 60000 });
    const rawText = result.stdout.trim() || result.stderr.trim();
    if (result.ok && rawText) {
      return {
        status: { xhs: await xhsStatus(xhsPath) },
        source: "xhs-local-helper",
        command: `xhs ${args.join(" ")}`,
        rawText,
        fetchedAt: new Date().toISOString(),
      };
    }
  }
  return { status: { xhs: status }, error: "CLI 未返回热点内容，请确认 xhs 命令版本支持热点接口。" };
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === "GET" && url.pathname === "/api/status") {
      send(res, 200, { ok: true, helper: { available: true, port: PORT }, xhs: await xhsStatus() });
      return;
    }
    const body = req.method === "POST" ? await parseBody(req) : {};
    if (req.method === "POST" && url.pathname === "/api/xhs/install") {
      const result = await installXhs(body.xhsCliPath || "");
      send(res, result.error ? 500 : 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/xhs/login") {
      const result = await loginXhs(body.xhsCliPath || "");
      send(res, result.error ? 500 : 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/xhs/hotspots") {
      const result = await fetchHotspots(body);
      send(res, result.error ? 500 : 200, result);
      return;
    }
    send(res, 404, { error: "未找到本地助手接口" });
  } catch (error) {
    send(res, 500, { error: error.message || "本地助手运行失败" });
  }
}

const server = http.createServer(route);
server.listen(PORT, HOST, () => {
  console.log("");
  console.log(`XHS local helper is running at http://${HOST}:${PORT}`);
  console.log("Keep this terminal or PowerShell window open while using the online workbench.");
  console.log("The web workbench can now test login and fetch hotspots from the right panel.");
  console.log("Recommendation: use a Xiaohongshu account that is not your main daily account.");
  console.log("");
});
