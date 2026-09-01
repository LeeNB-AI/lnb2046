const state = {
  terms: {},
  templates: {},
  product: {},
  hotspots: null,
  notes: [],
  productProfiles: [],
  history: [],
  stats: {},
  selectedIndex: 0,
  knowledgeScope: "all",
  tone: "mixed",
  hotspotUsageMode: "balanced",
  textMode: "cloud-api",
  coverMode: "cloud-api",
  modelConfig: {},
  knowledgeImportDraft: null,
  analysisRules: null,
  ruleProfiles: [],
  activeRuleId: "",
  coverAssets: [],
  coverAssetPath: "",
  productImageFolder: "",
  selectedCoverVariant: 0,
  sopTaskType: "placement",
  sopPlatform: "xiaohongshu",
  sopLastOutput: "",
};

const $ = (selector) => document.querySelector(selector);
const $all = (selector) => Array.from(document.querySelectorAll(selector));
const API_BASE_KEY = "xhsWorkbenchApiBaseUrl";
const TEXT_API_KEY_STORAGE = "xhsWorkbenchTextApiKey";
const COVER_API_KEY_STORAGE = "xhsWorkbenchCoverApiKey";
const XHS_LOCAL_HELPER_BASE = "http://127.0.0.1:4789";
const CODEX_IMAGEGEN_PATH = "/Users/libucuo/.codex/skills/.system/imagegen/scripts/image_gen.py";
const CODEX_IMAGEGEN_PYTHON = "/Users/libucuo/WorkBuddy/2026-08-06-20-04-17/image-workflow/venv/bin/python";

const defaultModelOptions = {
  text: [{ id: "gpt-5", name: "gpt-5" }],
  cover: [{ id: "gpt-image-1", name: "gpt-image-1" }],
};

function splitList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function maskClientSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  return text.length <= 10 ? "已保存" : `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function storedApiKey(type) {
  return localStorage.getItem(type === "cover" ? COVER_API_KEY_STORAGE : TEXT_API_KEY_STORAGE) || "";
}

function visibleApiKey(type) {
  const input = type === "cover" ? $("#coverApiKey") : $("#textApiKey");
  return input?.value.trim() || storedApiKey(type);
}

function modelConfigForRequest() {
  return {
    ...getModelConfig(),
    textApiKey: visibleApiKey("text"),
    coverApiKey: visibleApiKey("cover"),
  };
}

async function api(path, options = {}) {
  const url = apiUrl(path);
  const base = getApiBaseUrl();
  if (path.startsWith("/api/") && /\/v1\/?$|api\.openai\.com|aiapi\.world/i.test(base)) {
    throw new Error("工作台服务地址填错了：这里要填工作台网站地址，不是模型 API 地址。模型 API 地址请填在“文案 API 地址/封面 API 地址”。");
  }
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();
  let data = null;
  if (contentType.includes("application/json")) {
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      throw new Error("接口返回了损坏的 JSON，请检查后端服务是否正常。");
    }
  } else {
    const preview = rawText.replace(/\s+/g, " ").trim().slice(0, 90) || `HTTP ${response.status}`;
    if (response.status === 413 || /PAYLOAD_TOO_LARGE|Request Entity Too Large/i.test(preview)) {
      throw new Error("上传内容太大：产品图已自动压缩，请少选几张或换更小的图片再试。");
    }
    throw new Error(`接口没有返回 JSON，可能是工作台服务地址不对或服务返回了网页：${preview}`);
  }
  if (!response.ok || data.error) throw new Error(data.error || "请求失败");
  return data;
}

function defaultApiBaseUrl() {
  return window.location.protocol === "file:" ? "http://127.0.0.1:4173" : window.location.origin;
}

function getApiBaseUrl() {
  if (window.location.protocol !== "file:") return window.location.origin.replace(/\/$/, "");
  return ($("#apiBaseUrl")?.value || localStorage.getItem(API_BASE_KEY) || defaultApiBaseUrl()).trim().replace(/\/$/, "");
}

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

function assetUrl(path) {
  if (!path) return "";
  if (/^(https?:|file:|data:|blob:)/i.test(path)) return path;
  const base = window.location.protocol === "file:" ? getApiBaseUrl() : "";
  return `${base}${path}`;
}

function displayAssetUrl(path) {
  const url = assetUrl(path);
  if (!url || /^(data:|blob:)/i.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

function isLocalWorkbench() {
  const base = getApiBaseUrl();
  return window.location.protocol === "file:" || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(base);
}

function onlineXhsCliMessage(action = "操作") {
  return `线上工作台需要先连接本地助手，才能${action}你电脑里的小红书 CLI。第一次请点“下载本地助手”并运行，扫码登录后就能在这个面板里拉取热点。`;
}

function showOnlineXhsCliHint(action = "操作") {
  const message = onlineXhsCliMessage(action);
  $("#xhsConfigStatus").textContent = message;
  $("#xhsStatus").textContent = "未连接本地助手";
  $("#hotspotTime").textContent = "请先运行本地助手，再从右侧面板拉取热点";
  setDot($("#xhsDot"), false);
  return message;
}

function downloadXhsLocalHelper() {
  const isWindows = /win/i.test(navigator.platform || navigator.userAgent || "");
  const origin = window.location.origin.replace(/\/$/, "");
  const fileName = isWindows ? "install-xhs-cli-windows.bat" : "install-xhs-cli.sh";
  const helperUrl = `${origin}/${fileName}`;
  const macCommand = `curl -fsSL "${helperUrl}" | zsh`;
  const runCommand = isWindows ? `cd $env:USERPROFILE\\Downloads; .\\${fileName}` : macCommand;
  const commandBox = $("#xhsInstallCommand");
  if (commandBox) {
    commandBox.classList.remove("hidden");
    commandBox.value = runCommand;
  }
  navigator.clipboard?.writeText(runCommand).catch(() => {});
  if (!isWindows) {
    $("#xhsConfigStatus").textContent =
      "已复制 Mac 安装命令。请打开“终端”，粘贴后回车；它会自动安装/检测 CLI、测试登录、必要时显示二维码。这个方式不会再被 macOS 的 .command 权限拦截。";
    $("#xhsStatus").textContent = "等待本地助手运行";
    $("#hotspotTime").textContent = "助手运行后，可直接在右侧面板测试登录并拉取热点";
    return;
  }
  const link = document.createElement("a");
  link.href = helperUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  const message =
    "已下载 Windows 本地助手，并尝试复制运行命令。运行后会自动安装/检测 CLI、测试登录、必要时弹出二维码。请保持 PowerShell 窗口打开，网页会连接它。建议使用不常用的小红书账号。";
  $("#xhsConfigStatus").textContent = message;
  $("#xhsStatus").textContent = "等待本地助手运行";
  $("#hotspotTime").textContent = "助手运行后，可直接在右侧面板测试登录并拉取热点";
}

async function localHelperApi(path, options = {}) {
  const response = await fetch(`${XHS_LOCAL_HELPER_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const rawText = await response.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error("本地助手返回内容无法识别，请重新运行本地助手。");
  }
  if (!response.ok || data.error) {
    throw new Error(data.error || data.message || `本地助手请求失败：HTTP ${response.status}`);
  }
  return data;
}

function applyXhsHelperStatus(status) {
  const xhs = status.xhs || status;
  const available = Boolean(xhs.available);
  const loggedIn = Boolean(xhs.loggedIn);
  setDot($("#xhsDot"), available && loggedIn);
  $("#xhsStatus").textContent = xhs.message || (available ? "小红书 CLI 已连接" : "未检测到小红书 CLI");
  $("#xhsConfigStatus").textContent = xhs.message || "本地助手已连接";
  if (xhs.xhsCliPath && $("#xhsCliPath")) $("#xhsCliPath").value = xhs.xhsCliPath;
  return { available, loggedIn };
}

async function checkXhsLocalHelper() {
  const status = await localHelperApi("/api/status");
  applyXhsHelperStatus(status);
  return status;
}

async function runXhsHelperInstallAndLogin(button) {
  button.disabled = true;
  button.textContent = "连接中...";
  try {
    let status;
    try {
      status = await checkXhsLocalHelper();
    } catch {
      downloadXhsLocalHelper();
      return;
    }
    if (!status.xhs?.available) {
      button.textContent = "安装中...";
      $("#xhsConfigStatus").textContent = "本地助手已连接，正在安装/检测小红书 CLI...";
      status = await localHelperApi("/api/xhs/install", {
        method: "POST",
        body: JSON.stringify({ xhsCliPath: $("#xhsCliPath")?.value.trim() || "" }),
      });
      applyXhsHelperStatus(status);
    }
    if (!status.xhs?.loggedIn) {
      button.textContent = "等待扫码...";
      $("#xhsConfigStatus").textContent = "二维码会显示在本地助手的终端窗口里。扫码完成后，网页会自动更新状态。建议使用不常用的小红书账号。";
      status = await localHelperApi("/api/xhs/login", {
        method: "POST",
        body: JSON.stringify({ xhsCliPath: $("#xhsCliPath")?.value.trim() || "" }),
      });
      applyXhsHelperStatus(status);
    }
    button.textContent = "已连接";
  } catch (error) {
    $("#xhsConfigStatus").textContent = `连接失败：${error.message}`;
    setDot($("#xhsDot"), false);
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "测试连接与登录";
    }, 900);
  }
}

function apiSafeAssetPath(path) {
  if (!path || /^data:/i.test(path)) return "";
  return path;
}

function coverSourceText(coverImage) {
  if (!coverImage) return "";
  if (/^data:/i.test(coverImage)) return "线上临时图片，可直接导出下载";
  if (/^https?:/i.test(coverImage)) return coverImage;
  if (!coverImage.startsWith("/")) return coverImage;
  return assetUrl(coverImage);
}

function downloadNameForNote(note) {
  const base = String(note?.title || note?.id || "xhs-cover")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 36);
  return `${base || "xhs-cover"}.png`;
}

function selectedCoverImage(note) {
  const variants = Array.isArray(note?.coverVariants) ? note.coverVariants : [];
  return variants[state.selectedCoverVariant]?.image || note?.coverImage || "";
}

function selectedCoverSource(note) {
  const variants = Array.isArray(note?.coverVariants) ? note.coverVariants : [];
  return variants[state.selectedCoverVariant]?.source || note?.coverImage || "";
}

function initApiConfigInputs() {
  const input = $("#apiBaseUrl");
  if (!input) return;
  if (window.location.protocol !== "file:") {
    input.value = window.location.origin;
    localStorage.setItem(API_BASE_KEY, window.location.origin);
    return;
  }
  input.value = localStorage.getItem(API_BASE_KEY) || defaultApiBaseUrl();
}

function getProductInput() {
  const modelConfig = getModelConfig();
  return {
    name: $("#productName").value.trim(),
    category: $("#productCategory").value.trim(),
    hotKeywords: $("#hotKeywords").value.trim(),
    sellingPoints: $("#sellingPoints").value.trim(),
    targetAudience: $("#targetAudience").value.trim(),
    blockedTerms: $("#blockedTerms").value.trim(),
    xhsCategory: modelConfig.xhsCategory,
  };
}

function setProductInput(product) {
  $("#productName").value = product.name || "";
  $("#productCategory").value = product.category || "";
  $("#hotKeywords").value = product.hotKeywords || "";
  $("#sellingPoints").value = product.sellingPoints || "";
  $("#targetAudience").value = product.targetAudience || "";
  $("#blockedTerms").value = product.blockedTerms || "";
}

function sopTaskLabel(taskType = state.sopTaskType) {
  const labels = {
    placement: "产品摆放图",
    background: "实拍换背景",
    "white-combo": "白底组合",
    handheld: "人物拿产品",
    "xhs-note": "小红书笔记",
    cover: "封面图",
    "content-image": "内容图",
  };
  return labels[taskType] || "产品摆放图";
}

function cleanOverlayText(text, fallback = "真的好用") {
  return String(text || fallback)
    .replace(/[，。！？!?,.;；：:“”"'（）()《》【】[\]、|｜~～]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14);
}

function shortLinesFromSellingPoints(points) {
  const items = splitList(points).slice(0, 4);
  const fallback = ["顺手好用", "场景自然", "质感在线", "体验加分"];
  return (items.length ? items : fallback).map((item) => cleanOverlayText(item, item).slice(0, 7));
}

function syncSopFromProductInput() {
  const product = getProductInput();
  $("#sopProductName").value = product.name || "";
  $("#sopSearchKeywords").value = product.hotKeywords || "";
  $("#sopSellingPoints").value = product.sellingPoints || "";
  $("#sopTargetAudience").value = product.targetAudience || "";
  $("#sopConstraints").value = product.blockedTerms || "";
  $("#sopResultStatus").textContent = "已同步生成输入";
}

function getSopInput() {
  return {
    taskType: state.sopTaskType,
    platform: state.sopPlatform,
    productName: $("#sopProductName")?.value.trim() || $("#productName")?.value.trim() || "待命名商品",
    sellingPoints: $("#sopSellingPoints")?.value.trim() || $("#sellingPoints")?.value.trim(),
    targetAudience: $("#sopTargetAudience")?.value.trim() || $("#targetAudience")?.value.trim(),
    searchKeywords: $("#sopSearchKeywords")?.value.trim() || $("#hotKeywords")?.value.trim(),
    sourceMaterials: $("#sopSourceMaterials")?.value || "白底图和产品实拍",
    sceneStyle: $("#sopSceneStyle")?.value.trim() || "生活化桌面场景，自然光，真实手机随手拍质感",
    outputCount: Math.max(1, Math.min(5, Number($("#sopOutputCount")?.value || 3))),
    constraints: $("#sopConstraints")?.value.trim() || $("#blockedTerms")?.value.trim(),
  };
}

function platformName(platform) {
  return platform === "douyin" ? "抖音" : "小红书";
}

function imagePromptForSop(input) {
  const product = input.productName;
  const points = splitList(input.sellingPoints).slice(0, 5).join("、") || "突出核心卖点和真实使用场景";
  const overlays = shortLinesFromSellingPoints(input.sellingPoints);
  const common = [
    `商品：${product}`,
    `卖点：${points}`,
    `画幅：3:4 经典比例`,
    `风格：${platformName(input.platform)}高清真实生活化商品图，自然光，高对比，手机实拍感，主体清晰`,
    `产品要求：保持产品外观、包装、比例、颜色和文字不变，不改变品牌信息，不生成错误文字`,
    `压字要求：文案放在上三分之一或留白处，不遮挡产品；多句上下错开；白字黑细边或黄字黑边；去掉标点；不用汉仪相关商用字体`,
    `约束：${input.constraints || "克制表达，不夸大功效，不低俗，不露骨"}`,
  ].join("\n");
  const taskPrompts = {
    placement: `请生成 ${input.outputCount} 张高质量商品摆放图。\n${common}\n场景：${input.sceneStyle}\n构图：产品放大到画面中下部，2-3 个包装盒与若干单品有层次地摆放，可加入同色系生活道具，干净高级但像真实拍摄。\n封面压字候选：${overlays.join(" / ")}`,
    background: `请基于上传的实拍产品图生成 ${input.outputCount} 张换背景图。\n${common}\n操作：抠出原产品主体并保持不变，只替换背景与摆放环境。\n新背景：${input.sceneStyle}\n质感：保留真实阴影、接触面、环境反光和轻微透视，不要像硬贴图。\n封面压字候选：${overlays.join(" / ")}`,
    "white-combo": `请基于白底产品图组合生成 ${input.outputCount} 张商品场景图。\n${common}\n素材：${input.sourceMaterials}\n摆法：2-3 盒产品加多个单品，随机和规律摆法各占一部分，画面有前后层次。\n场景：${input.sceneStyle}\n排除：不要黑底，不要过度棚拍，不要改变产品形状。\n封面压字候选：${overlays.join(" / ")}`,
    handheld: `请生成 ${input.outputCount} 张人物拿产品的真实生活化图片。\n${common}\n人物：成年人，日常自然状态，像 iPhone 随手拍，皮肤质感真实，构图允许轻微不完美。\n动作：人物把 ${product} 自然拿在手里，产品大小符合真实尺寸，靠近胸前或脸下方但不遮挡关键信息。\n场景：${input.sceneStyle}\n边界：不出现未成年人，不做露骨姿势，不突出身体部位。\n封面压字候选：${overlays.join(" / ")}`,
    cover: `请生成 ${input.outputCount} 张 ${platformName(input.platform)} 封面图。\n${common}\n主画面：产品放大 50%，位于中下部或右下部，背景改为 ${input.sceneStyle}。\n封面文字：主标题「${cleanOverlayText(overlays[0], product).slice(0, 6)}」，副标题「${cleanOverlayText(overlays[1], "打开体验").slice(0, 6)}」。\n检查：中文无错字、无多字漏字、字不压产品，远看一眼能读懂。`,
    "content-image": `请生成 ${input.outputCount} 张与封面同场景的内容图。\n${common}\n主画面：延续 ${input.sceneStyle}，产品主体不变，画面留出贴纸空间。\n内容结构：每张图 1 个小标题加 3 个价值贴纸；小标题 7 字内，贴纸 7 字左右。\n贴纸候选：${overlays.map((line) => `✅ ${line}`).join(" / ")} / ❌ 别再将就\n检查：所有标点去掉，贴纸分散在空白区域，不遮挡产品。`,
  };
  return taskPrompts[input.taskType] || taskPrompts.placement;
}

function xhsCopyForSop(input) {
  const product = input.productName;
  const points = shortLinesFromSellingPoints(input.sellingPoints);
  const audience = input.targetAudience || "重视生活品质、想找到省心选择的人群";
  const titleBase = cleanOverlayText(points[0], product);
  const tags = splitList(`${input.searchKeywords}\n${product}\n${points.join("、")}`)
    .slice(0, 8)
    .map((tag) => `#${tag.replace(/^#/, "")}`)
    .join(" ");
  return [
    `标题方向`,
    `1. ${titleBase}真的省心`,
    `2. ${product}我会回购`,
    `3. ${cleanOverlayText(points[1], "日常刚需")}这点很戳`,
    ``,
    `封面文案`,
    `主：${cleanOverlayText(points[0], "这个很懂").slice(0, 6)}`,
    `备：${cleanOverlayText(points[1], "舒服省心").slice(0, 6)}`,
    ``,
    `内容图文案`,
    `图1 小标题：痛点说清楚｜❌ 别再将就｜❌ 选择太难｜✅ 看这几点`,
    `图2 小标题：卖点看得见｜✅ ${points[0] || "体验加分"}｜✅ ${points[1] || "质感在线"}｜✅ ${points[2] || "日常好用"}`,
    `图3 小标题：适合这样用｜✅ ${cleanOverlayText(input.sceneStyle, "日常场景").slice(0, 7)}｜✅ 新手友好｜✅ 点商品看`,
    ``,
    `正文`,
    `最近在看 ${product}，我最在意的不是参数堆满，而是日常用起来是不是真的顺手。${points.slice(0, 3).join("、")} 这几个点比较打动我，放在 ${input.sceneStyle} 这种场景里也很自然。`,
    `${audience} 可以重点看这款的使用感和场景适配度。想省时间的话，先从核心卖点和评价反馈判断，再决定要不要入手。`,
    ``,
    `标签`,
    tags || `#${product} #好物分享 #小红书种草`,
  ].join("\n");
}

function productionStepsForSop(input) {
  const shared = [
    `1. 准备 ${input.sourceMaterials}，优先选择包装清晰、角度完整、无强反光的素材。`,
    `2. 生图时固定 3:4 比例，先保证产品不变，再调整背景、道具、光线和构图。`,
    `3. 压字放在上三分之一或留白处，中文短句先去标点，再检查错字和遮挡。`,
    `4. 每次生成 ${input.outputCount} 张，保留最像真实拍摄的一张继续做同场景扩展。`,
  ];
  if (input.taskType === "xhs-note") {
    return [
      `1. 用搜索词收集 10-20 篇同类笔记，提取标题句式、痛点表达、封面压字和评论高频词。`,
      `2. 把商品 brief 填完整：卖点、目标人群、痛点、期待成为、特殊禁用表达。`,
      `3. 先生成 3 个标题方向和 3 组封面变量，再写 200 字内正文。`,
      `4. 最后把封面图、内容图提示词拆开执行，保持同场景和同一套视觉语言。`,
    ].join("\n");
  }
  return shared.join("\n");
}

function renderSopOutput(result) {
  state.sopLastOutput = result;
  const container = $("#sopResult");
  if (!container) return;
  container.className = "sop-output";
  container.innerHTML = result
    .split(/\n{2,}/)
    .map((block) => {
      const [firstLine, ...rest] = block.split("\n");
      const body = rest.join("\n");
      if (!body) return `<pre>${escapeHtml(firstLine)}</pre>`;
      return `<section class="sop-output-block"><h4>${escapeHtml(firstLine)}</h4><pre>${escapeHtml(body)}</pre></section>`;
    })
    .join("");
}

function generateSopWorkbench() {
  const input = getSopInput();
  const imagePrompt = imagePromptForSop(input);
  const noteCopy = xhsCopyForSop(input);
  const steps = productionStepsForSop(input);
  const output = [
    `可复制生图提示词`,
    imagePrompt,
    input.taskType === "xhs-note" ? `小红书笔记执行稿\n${noteCopy}` : `配套小红书文案\n${noteCopy}`,
    `制作步骤\n${steps}`,
  ].join("\n\n");
  renderSopOutput(output);
  $("#sopResultStatus").textContent = `${sopTaskLabel(input.taskType)} 已生成`;
}

async function copySopOutput() {
  if (!state.sopLastOutput) generateSopWorkbench();
  try {
    await navigator.clipboard.writeText(state.sopLastOutput);
    $("#sopResultStatus").textContent = "已复制全部 SOP";
  } catch {
    $("#sopResultStatus").textContent = "浏览器未允许复制，可手动选中右侧内容";
  }
}

function getModelConfig() {
  return {
    textMode: state.textMode,
    textProvider: state.textMode === "local-cli" ? "本地 CLI" : "自定义 API",
    textApiBaseUrl: $("#textApiBaseUrl").value.trim(),
    textModel: $("#textModel").value.trim() || "gpt-5",
    textLocalEngine: $("#textLocalEngine").value.trim(),
    coverMode: state.coverMode,
    coverProvider: state.coverMode === "local-cli" ? "本地 CLI" : "自定义 API",
    coverApiBaseUrl: $("#coverApiBaseUrl").value.trim(),
    imageModel: $("#imageModel").value.trim() || "gpt-image-1",
    imageCliPath: $("#imageCliPath").value.trim(),
    pythonPath: $("#pythonPath").value.trim(),
    productImageFolder: $("#productImageFolder")?.value.trim() || "",
    xhsCliPath: $("#xhsCliPath").value.trim(),
    xhsCategory: $("#xhsCategory").value,
    temperature: Number($("#temperature").value),
    noteCount: Number($("#noteCount").value),
    strictCompliance: $("#strictCompliance").checked,
    knowledgeScope: state.knowledgeScope,
    tone: state.tone,
    hotspotUsageMode: state.hotspotUsageMode,
  };
}

function setModelConfig(config = {}) {
  const isLegacyText = !config.textMode || config.textMode === "offline-rules" || config.textProvider === "本地规则";
  const isLegacyCover = !config.coverMode || config.coverMode === "offline-template" || config.coverProvider === "本地封面模板";
  state.textMode = isLegacyText || config.textMode === "cloud" ? "cloud-api" : config.textMode;
  state.coverMode = isLegacyCover || config.coverMode === "cloud" ? "cloud-api" : config.coverMode;
  $("#textApiBaseUrl").value = isLegacyText ? "https://api.openai.com/v1" : config.textApiBaseUrl || "https://api.openai.com/v1";
  $("#textModel").value = isLegacyText ? "gpt-5" : config.textModel || "gpt-5";
  $("#textLocalEngine").value = config.textLocalEngine || "";
  $("#coverApiBaseUrl").value = isLegacyCover ? "https://api.openai.com/v1" : config.coverApiBaseUrl || "https://api.openai.com/v1";
  $("#imageModel").value = isLegacyCover ? "gpt-image-1" : config.imageModel || "gpt-image-1";
  $("#imageCliPath").value = config.imageCliPath || CODEX_IMAGEGEN_PATH;
  $("#pythonPath").value = config.pythonPath || (navigator.platform.toLowerCase().includes("win") ? "python" : CODEX_IMAGEGEN_PYTHON);
  if ($("#textApiKey")) $("#textApiKey").value = storedApiKey("text");
  if ($("#coverApiKey")) $("#coverApiKey").value = storedApiKey("cover");
  if ($("#productImageFolder")) $("#productImageFolder").value = config.productImageFolder || "";
  state.productImageFolder = config.productImageFolder || "";
  $("#xhsCliPath").value = config.xhsCliPath || "/Users/libucuo/.local/bin/xhs";
  $("#xhsCategory").value = config.xhsCategory || "love";
  $("#temperature").value = config.temperature ?? 0.65;
  $("#noteCount").value = config.noteCount || 5;
  $("#strictCompliance").checked = config.strictCompliance !== false;
  state.knowledgeScope = config.knowledgeScope || "all";
  state.tone = config.tone || "mixed";
  state.hotspotUsageMode = config.hotspotUsageMode || "balanced";
  selectSegment("#knowledgeScope", "scope", state.knowledgeScope);
  selectSegment("#toneControl", "tone", state.tone);
  selectSegment("#hotspotUsageMode", "mode", state.hotspotUsageMode);
  selectSegment("#textModeControl", "mode", state.textMode);
  selectSegment("#coverModeControl", "mode", state.coverMode);
  setModelSelectOptions("text", [{ id: $("#textModel").value, name: $("#textModel").value }]);
  setModelSelectOptions("cover", [{ id: $("#imageModel").value, name: $("#imageModel").value }]);
  updateModelFieldVisibility();
}

function setDot(dot, ok) {
  dot.classList.toggle("ok", Boolean(ok));
  dot.classList.toggle("warn", !ok);
}

function setModelSelectOptions(type, models = defaultModelOptions[type]) {
  const select = type === "text" ? $("#textModelSelect") : $("#coverModelSelect");
  const input = type === "text" ? $("#textModel") : $("#imageModel");
  const options = models.length ? models : defaultModelOptions[type];
  select.innerHTML = options
    .map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name || model.id)}</option>`)
    .join("");
  if (options.some((model) => model.id === input.value)) select.value = input.value;
  else {
    select.value = options[0].id;
    input.value = options[0].id;
  }
}

function updateModelFieldVisibility() {
  const textMode = state.textMode === "local-cli" ? "local" : "cloud";
  const coverMode = state.coverMode === "local-cli" ? "local" : "cloud";
  $all("[data-text-field]").forEach((field) => {
    field.classList.toggle("hidden", !field.dataset.textField.split(/\s+/).includes(textMode));
  });
  $all("[data-cover-field]").forEach((field) => {
    field.classList.toggle("hidden", !field.dataset.coverField.split(/\s+/).includes(coverMode));
  });
  const installButton = $("#installXhsCliBtn");
  if (installButton) installButton.textContent = isLocalWorkbench() ? "安装/检测 CLI" : "下载/连接本地助手";
}

async function loadStatus() {
  try {
    await loadApiSettings();
    const status = await api("/api/status");
    const localTextKey = storedApiKey("text");
    const localCoverKey = storedApiKey("cover");
    const textAvailable = status.textgen.available || Boolean(localTextKey);
    const coverAvailable = status.imagegen.available || Boolean(localCoverKey);
    setDot($("#xhsDot"), status.xhs.available && status.xhs.loggedIn);
    setDot($("#textDot"), textAvailable);
    setDot($("#imageDot"), coverAvailable);
    $("#xhsStatus").textContent = status.xhs.message;
    $("#textStatus").textContent = localTextKey ? "文案 Key 已保存在当前浏览器" : status.textgen.message;
    $("#imageStatus").textContent = localCoverKey ? "封面 Key 已保存在当前浏览器" : status.imagegen.message;
    $("#xhsConfigStatus").textContent = status.xhs.message || "线上版请粘贴导入热点";
    $("#textConfigStatus").textContent = localTextKey ? "浏览器已保存文案 Key，可生成" : status.textgen.message;
    $("#coverConfigStatus").textContent = localCoverKey ? "浏览器已保存封面 Key，可生成" : status.imagegen.message;
    if (!isLocalWorkbench()) {
      try {
        await checkXhsLocalHelper();
      } catch {
        showOnlineXhsCliHint("测试和拉取");
      }
    }
  } catch (error) {
    $("#xhsStatus").textContent = `状态检查失败：${error.message}`;
    $("#textStatus").textContent = "状态检查失败";
    $("#imageStatus").textContent = "状态检查失败";
    $("#xhsConfigStatus").textContent = "状态检查失败";
    $("#textConfigStatus").textContent = "状态检查失败";
    $("#coverConfigStatus").textContent = "状态检查失败";
  }
}

async function loadApiSettings() {
  try {
    const settings = await api("/api/settings");
    const localTextKey = storedApiKey("text");
    const localCoverKey = storedApiKey("cover");
    const textState = localTextKey
      ? `文案 Key：浏览器已保存 ${maskClientSecret(localTextKey)}`
      : settings.textApiKeySet
        ? `文案 Key：后台已配置 ${settings.textApiKeyMasked || ""}`
        : "文案 Key 未配置";
    const coverState = localCoverKey
      ? `封面 Key：浏览器已保存 ${maskClientSecret(localCoverKey)}`
      : settings.coverApiKeySet
        ? `封面 Key：后台已配置 ${settings.coverApiKeyMasked || ""}`
        : "封面 Key 未配置";
    $("#apiKeyStatus").textContent = `${textState}｜${coverState}`;
  } catch (error) {
    $("#apiKeyStatus").textContent = `接口不可用：${error.message}`;
  }
}

async function saveApiConfig() {
  return saveScopedConfig("all");
}

async function saveScopedConfig(scope = "all") {
  const apiBaseUrl = getApiBaseUrl();
  localStorage.setItem(API_BASE_KEY, apiBaseUrl);
  const textApiKey = scope === "all" || scope === "text" ? $("#textApiKey").value.trim() : "";
  const coverApiKey = scope === "all" || scope === "cover" ? $("#coverApiKey").value.trim() : "";
  if (textApiKey) localStorage.setItem(TEXT_API_KEY_STORAGE, textApiKey);
  if (coverApiKey) localStorage.setItem(COVER_API_KEY_STORAGE, coverApiKey);
  const payload = {
    modelConfig: getModelConfig(),
    ...(textApiKey ? { textApiKey } : {}),
    ...(coverApiKey ? { coverApiKey } : {}),
  };
  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  $("#apiKeyStatus").textContent = "已保存模型设置和 API Key";
  if (scope === "text") $("#textConfigStatus").textContent = textApiKey || storedApiKey("text") ? "已保存文案 API Key" : "已保存文案设置，未填写 Key";
  if (scope === "cover") $("#coverConfigStatus").textContent = coverApiKey || storedApiKey("cover") ? "已保存封面 API Key" : "已保存封面设置，未填写 Key";
  await loadStatus();
}

async function fetchModelList(type, button) {
  const isText = type === "text";
  const apiBaseUrl = isText ? $("#textApiBaseUrl").value.trim() : $("#coverApiBaseUrl").value.trim();
  const apiKey = visibleApiKey(type);
  const status = isText ? $("#textConfigStatus") : $("#coverConfigStatus");
  if (!apiBaseUrl) {
    status.textContent = "请先填写 API 地址";
    return;
  }
  button.disabled = true;
  button.textContent = "拉取中...";
  status.textContent = "正在拉取模型列表";
  try {
    const result = await api("/api/models/list", {
      method: "POST",
      body: JSON.stringify({ type, apiBaseUrl, apiKey }),
    });
    setModelSelectOptions(type, result.models || []);
    status.textContent = `已拉取 ${result.models?.length || 0} 个模型`;
  } catch (error) {
    status.textContent = `拉取失败：${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "拉取模型";
  }
}

async function loadState() {
  const data = await api("/api/knowledge");
  state.terms = data.terms || {};
  if (!Object.prototype.hasOwnProperty.call(state.terms, "补充知识")) state.terms.补充知识 = "";
  state.templates = data.templates || {};
  state.product = data.product || {};
  state.hotspots = data.topicLibrary || data.hotspots || null;
  state.notes = data.notes || [];
  state.productProfiles = data.productProfiles || [];
  state.history = data.history || [];
  state.stats = data.stats || {};
  state.modelConfig = data.modelConfig || {};
  state.analysisRules = data.analysisRules || null;
  state.ruleProfiles = data.ruleProfiles || [];
  state.activeRuleId = data.activeRuleId || state.ruleProfiles[0]?.id || "";
  state.coverAssets = data.coverAssets || [];
  state.coverAssetPath = state.coverAssets[0]?.path || "";
  setProductInput(state.product);
  setModelConfig(state.modelConfig);
  renderStats();
  renderManagers();
  renderRuleProfiles();
  renderProductProfiles();
  renderHotspots();
  renderNotesList();
  renderDraftBox();
  renderHistory();
  renderSelectedNote();
}

function formatDateTime(value) {
  if (!value) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderStats() {
  $("#draftCount").textContent = state.stats.draftCount ?? state.notes.filter((note) => note.publishStatus !== "published").length;
  $("#publishedCount").textContent =
    state.stats.publishedCount ?? state.notes.filter((note) => note.publishStatus === "published").length;
  $("#knowledgeCount").textContent =
    state.stats.knowledgeCount ??
    Object.keys(state.terms || {}).length + Object.keys(state.templates || {}).length + state.productProfiles.length;
  $("#latestGeneratedAt").textContent = formatDateTime(state.stats.latestGeneratedAt || state.history[0]?.createdAt);
}

function riskLabel(item) {
  if (!item || typeof item === "string") return "";
  const labels = { safe: "安全", emotional: "情绪", slang: "梗感", risky: "风险" };
  return `<em class="risk-tag ${escapeHtml(item.risk || "safe")}">${labels[item.risk] || "安全"}</em>`;
}

function itemText(item) {
  return typeof item === "string" ? item : item?.text || "";
}

const hotspotGroups = [
  { label: "关键词", key: "keywords" },
  { label: "标题句式", key: "titlePatterns" },
  { label: "正文结构", key: "contentPatterns" },
  { label: "标签", key: "tags" },
  { label: "评论表达", key: "commentStyles" },
];

function renderHotspots() {
  const container = $("#hotspotList");
  if (!state.hotspots) {
    container.className = "hotspot-list empty";
    container.textContent = "点击“读取素材库”后展示选题素材。也可以粘贴 xhs JSON/TXT 扩充选题库。";
    return;
  }

  container.className = "hotspot-list";
  container.innerHTML = hotspotGroups
    .map(
      ({ label, key }) => `
        <div class="hotspot-group" data-hotspot-key="${key}">
          <h4>${label}</h4>
          <div class="chips">${(state.hotspots[key] || [])
            .map(
              (item, index) => `
                <span class="chip editable-chip" data-chip-index="${index}">
                  <button class="chip-text" data-chip-edit type="button">${escapeHtml(itemText(item))}</button>
                  ${riskLabel(item)}
                  <button class="chip-remove" data-chip-remove type="button" aria-label="删除">×</button>
                </span>
              `,
            )
            .join("")}
            <input class="chip-input" data-chip-input placeholder="输入后按空格添加" />
          </div>
        </div>
      `,
    )
    .join("");

  const source =
    state.hotspots.source === "manual-import"
      ? "粘贴导入"
      : state.hotspots.source === "xhs-cli"
        ? "小红书 CLI"
        : state.hotspots.source === "manual-edit"
          ? "手动编辑"
          : "素材库";
  const warningCount = state.hotspots.warnings?.length || 0;
  $("#hotspotTime").textContent = `${source}${warningCount ? `，${warningCount} 个提示` : ""}`;
}

function normalizeChipItem(key, text, existing) {
  const clean = String(text || "").trim();
  if (!clean) return null;
  if (key === "titlePatterns") return { ...(typeof existing === "object" ? existing : {}), text: clean, risk: existing?.risk || "safe", source: existing?.source || "manual-edit" };
  return clean;
}

function addHotspotChip(key, text) {
  if (!state.hotspots) state.hotspots = { keywords: [], titlePatterns: [], contentPatterns: [], tags: [], commentStyles: [], source: "manual-edit" };
  const nextItem = normalizeChipItem(key, text);
  if (!nextItem) return;
  const current = state.hotspots[key] || [];
  const exists = current.some((item) => itemText(item) === itemText(nextItem));
  if (!exists) state.hotspots[key] = [...current, nextItem].slice(0, 30);
  state.hotspots.source = "manual-edit";
  renderHotspots();
}

function removeHotspotChip(key, index) {
  state.hotspots[key] = (state.hotspots[key] || []).filter((_, itemIndex) => itemIndex !== index);
  state.hotspots.source = "manual-edit";
  renderHotspots();
}

function editHotspotChip(key, index) {
  const current = state.hotspots[key]?.[index];
  const nextText = window.prompt("编辑选题素材", itemText(current));
  if (nextText == null) return;
  const nextItem = normalizeChipItem(key, nextText, current);
  if (!nextItem) return removeHotspotChip(key, index);
  state.hotspots[key][index] = nextItem;
  state.hotspots.source = "manual-edit";
  renderHotspots();
}

function bindHotspotEditor() {
  $("#hotspotList").addEventListener("keydown", (event) => {
    const input = event.target.closest("[data-chip-input]");
    if (!input) return;
    const group = input.closest("[data-hotspot-key]");
    const key = group?.dataset.hotspotKey;
    if (!key) return;
    if (["Enter", " ", ","].includes(event.key) || event.key === "，") {
      event.preventDefault();
      addHotspotChip(key, input.value);
    } else if (event.key === "Backspace" && !input.value) {
      event.preventDefault();
      const lastIndex = (state.hotspots?.[key] || []).length - 1;
      if (lastIndex >= 0) removeHotspotChip(key, lastIndex);
    }
  });

  $("#hotspotList").addEventListener("click", (event) => {
    const group = event.target.closest("[data-hotspot-key]");
    const chip = event.target.closest("[data-chip-index]");
    if (!group || !chip) return;
    const key = group.dataset.hotspotKey;
    const index = Number(chip.dataset.chipIndex);
    if (event.target.closest("[data-chip-remove]")) removeHotspotChip(key, index);
    else if (event.target.closest("[data-chip-edit]")) editHotspotChip(key, index);
  });
}

function renderProductProfiles() {
  const list = $("#productProfilesList");
  if (!state.productProfiles.length) {
    list.className = "profile-list empty";
    list.textContent = "暂无商品档案。可以先把上方生成输入保存为商品档案。";
    return;
  }

  list.className = "profile-list";
  list.innerHTML = state.productProfiles
    .map(
      (profile) => `
        <article class="profile-card">
          <div>
            <strong>${escapeHtml(profile.name || "未命名商品")}</strong>
            <p>${escapeHtml(profile.category || "未填写类目")}</p>
            <small>${escapeHtml(profile.hotKeywords || "未填写热点关键词")}</small>
          </div>
          <div class="profile-actions">
            <button class="secondary-btn profile-sync" data-profile-id="${escapeHtml(profile.id)}">同步到生成输入</button>
            <button class="secondary-btn profile-delete" data-profile-delete="${escapeHtml(profile.id)}">删除</button>
          </div>
        </article>
      `,
    )
    .join("");

  $all("[data-profile-id]").forEach((button) => {
    button.addEventListener("click", () => syncProductProfile(button.dataset.profileId));
  });
  $all("[data-profile-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteProductProfile(button.dataset.profileDelete));
  });
}

function renderHistory() {
  const list = $("#historyList");
  if (!state.history.length) {
    list.className = "history-list empty";
    list.textContent = "生成后会保存批次记录，并保留每篇笔记的发布状态。";
    return;
  }

  list.className = "history-list";
  const visibleHistory = state.history.slice(0, 3);
  const hiddenCount = Math.max(0, state.history.length - visibleHistory.length);
  list.innerHTML =
    visibleHistory
    .map((batch) => {
      const batchNotes = state.notes.filter((note) => (batch.noteIds || []).includes(note.id));
      const published = batchNotes.filter((note) => note.publishStatus === "published").length;
      const draft = batchNotes.length - published;
      return `
        <div class="history-row">
          <div>
            <strong>${escapeHtml(batch.productName || "未命名商品")}</strong>
            <p>${formatDateTime(batch.createdAt)} · ${batch.count || batch.noteIds?.length || 0} 篇</p>
          </div>
          <div class="history-actions">
            <span>草稿 ${draft} / 已发布 ${published}</span>
            <button class="secondary-btn history-view" data-history-view="${escapeHtml(batch.id)}">查看</button>
            <button class="secondary-btn history-delete" data-history-delete="${escapeHtml(batch.id)}">删除</button>
          </div>
        </div>
      `;
    })
      .join("") +
    (hiddenCount
      ? `<div class="history-more">还有 ${hiddenCount} 条历史记录已收起，完整记录保存在本地草稿箱数据里。</div>`
      : "");

  $all("[data-history-view]").forEach((button) => {
    button.addEventListener("click", () => viewHistoryBatch(button.dataset.historyView));
  });
  $all("[data-history-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteHistoryBatch(button.dataset.historyDelete));
  });
}

function viewHistoryBatch(batchId) {
  const batch = state.history.find((item) => item.id === batchId);
  if (!batch) return;
  const notes = batch.notes?.length ? batch.notes : state.notes.filter((note) => (batch.noteIds || []).includes(note.id));
  if (!notes.length) return;
  state.notes = notes;
  state.selectedIndex = 0;
  renderNotesList();
  renderDraftBox();
  renderSelectedNote();
  $("#copySection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDraftBox() {
  const list = $("#draftBoxList");
  const summary = $("#draftBoxSummary");
  if (!list || !summary) return;
  const drafts = state.notes.filter((note) => note.publishStatus !== "published");
  summary.textContent = drafts.length ? `${drafts.length} 篇待发布` : "暂无草稿";
  if (!drafts.length) {
    list.className = "history-list empty";
    list.textContent = "暂无草稿。新生成的笔记会默认进入草稿箱。";
    return;
  }

  list.className = "history-list";
  list.innerHTML = drafts
    .map(
      (note) => `
        <div class="draft-row">
          <div>
            <strong>${escapeHtml(note.title || "未命名草稿")}</strong>
            <p>${escapeHtml(note.angle || "未分类")} · 合规分 ${note.quality?.score || "-"}</p>
          </div>
          <button class="secondary-btn" data-draft-note="${escapeHtml(note.id)}">查看</button>
        </div>
      `,
    )
    .join("");

  $all("[data-draft-note]").forEach((button) => {
    button.addEventListener("click", () => viewDraftNote(button.dataset.draftNote));
  });
}

function viewDraftNote(noteId) {
  const index = state.notes.findIndex((note) => note.id === noteId);
  if (index < 0) return;
  state.selectedIndex = index;
  renderNotesList();
  renderSelectedNote();
  $("#copySection").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteHistoryBatch(batchId) {
  const result = await api("/api/history/delete", {
    method: "POST",
    body: JSON.stringify({ batchId }),
  });
  state.history = result.history || [];
  state.stats = result.stats || state.stats;
  renderStats();
  renderDraftBox();
  renderHistory();
}

function renderManagers() {
  const activeRule = state.ruleProfiles.find((rule) => rule.id === state.activeRuleId);
  const visibleTerms = activeRule ? { ...state.terms, ...activeRule.terms } : state.terms;
  const visibleTemplates = activeRule ? { ...state.templates, ...activeRule.templates } : state.templates;
  $("#termManager").innerHTML = Object.entries(visibleTerms)
    .map(
      ([name, value]) => `
        <div class="manager-row">
          <h4>${escapeHtml(name)}</h4>
          <textarea data-term="${escapeHtml(name)}">${escapeHtml(value)}</textarea>
        </div>
      `,
    )
    .join("");

  $("#templateManager").innerHTML = Object.entries(visibleTemplates)
    .map(
      ([name, value]) => `
        <div class="manager-row">
          <h4>${escapeHtml(name)}</h4>
          <textarea data-template="${escapeHtml(name)}">${escapeHtml(value)}</textarea>
        </div>
      `,
    )
    .join("");

  $all("[data-term]").forEach((input) => {
    input.addEventListener("input", (event) => {
      if (activeRule) {
        activeRule.terms[event.target.dataset.term] = event.target.value;
      } else {
        state.terms[event.target.dataset.term] = event.target.value;
      }
    });
  });

  $all("[data-template]").forEach((input) => {
    input.addEventListener("input", (event) => {
      if (activeRule) {
        activeRule.templates[event.target.dataset.template] = event.target.value;
      } else {
        state.templates[event.target.dataset.template] = event.target.value;
      }
    });
  });
}

function classifyKnowledgeLine(line) {
  const text = String(line || "").trim();
  if (!text) return null;
  const normalized = text.replace(/^[\-*•\d.、\s]+/, "");
  const [rawKey, ...rest] = normalized.split(/[:：]/);
  const value = rest.length ? rest.join("：").trim() : normalized;
  const key = rawKey.trim();
  const targetMap = [
    [/人群|需求|用户|目标人群/, "terms", "人群需求词"],
    [/痛点|问题|顾虑|担心/, "terms", "痛点词"],
    [/场景|使用场景|时机/, "terms", "场景词"],
    [/卖点|优势|特点|成分|利益点/, "terms", "卖点词"],
    [/禁用|避开|禁止|风险词/, "terms", "禁用词"],
    [/标题|题目|title/i, "templates", "标题模板"],
    [/正文|内容|文案|body/i, "templates", "正文模板"],
    [/评论|铺垫|comment/i, "templates", "评论模板"],
    [/封面|cover|图片/i, "templates", "封面模板"],
  ];
  const match = targetMap.find(([pattern]) => pattern.test(key) || (!rest.length && pattern.test(normalized.slice(0, 12))));
  if (!match) return { group: "terms", field: "补充知识", value: normalized };
  return { group: match[1], field: match[2], value };
}

function parseKnowledgePaste(rawText) {
  const draft = { terms: {}, templates: {} };
  String(rawText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const item = classifyKnowledgeLine(line);
      if (!item) return;
      draft[item.group][item.field] = [draft[item.group][item.field], item.value].filter(Boolean).join("\n");
    });
  draft.ruleProfile = buildRuleProfileFromPaste(rawText, draft);
  return draft;
}

function buildRuleProfileFromPaste(rawText, draft) {
  const lines = String(rawText || "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4);
  const keyPoints = lines.filter((line) => line.length <= 120).slice(0, 8);
  const nameSource = keyPoints[0] || "导入规则";
  const keywords = splitList(
    [
      draft.terms?.人群需求词,
      draft.terms?.痛点词,
      draft.terms?.场景词,
      draft.terms?.卖点词,
      lines.filter((line) => /关键词|标签|场景|痛点|人群|风格|口吻/.test(line)).join("\n"),
    ].filter(Boolean).join("\n"),
  ).slice(0, 24);
  return {
    id: `rule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: nameSource.slice(0, 28),
    rawText,
    terms: {
      ...(draft.terms || {}),
      规则用词: keywords.join("、"),
      分析要点: keyPoints.join("\n"),
    },
    templates: draft.templates || {},
    analysisRules: {
      summary: keyPoints.join("\n"),
      keyPoints,
      titleRules: lines.filter((line) => /标题|题目|钩子|开头|点击/.test(line)).join("\n"),
      bodyRules: lines.filter((line) => /正文|结构|段落|内容|种草|测评/.test(line)).join("\n"),
      copyRules: lines.filter((line) => /文案|表达|语气|评论|转化|口吻|CTA/.test(line)).join("\n"),
      coverRules: lines.filter((line) => /封面|图片|视觉|大字|构图|配色|素材/.test(line)).join("\n"),
      styleKeywords: keywords,
      forbiddenPatterns: splitList(lines.filter((line) => /禁用|避免|不要|风险|违规|不能|慎用/.test(line)).join("\n")),
      source: "knowledge-import",
      importedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
  };
}

function renderKnowledgeImportPreview(draft) {
  const container = $("#knowledgeImportPreview");
  const entries = [
    ...Object.entries(draft.terms || {}).map(([name, value]) => ["词库", name, value]),
    ...Object.entries(draft.templates || {}).map(([name, value]) => ["模板", name, value]),
    ...(draft.ruleProfile ? [["规则", draft.ruleProfile.name, draft.ruleProfile.analysisRules?.summary || draft.ruleProfile.rawText]] : []),
  ].filter(([, , value]) => String(value || "").trim());
  if (!entries.length) {
    container.className = "import-preview empty";
    container.textContent = "没有识别到可导入内容。";
    $("#applyKnowledgeImportBtn").disabled = true;
    return;
  }
  container.className = "import-preview";
  container.innerHTML = entries
    .map(
      ([group, name, value]) => `
        <div class="import-preview-row">
          <span>${escapeHtml(group)}</span>
          <strong>${escapeHtml(name)}</strong>
          <p>${escapeHtml(value)}</p>
        </div>
      `,
    )
    .join("");
  $("#applyKnowledgeImportBtn").disabled = false;
}

function renderRuleProfiles() {
  const select = $("#activeRuleSelect");
  const container = $("#ruleSummaryPreview");
  if (!select || !container) return;
  select.innerHTML =
    `<option value="">基础知识库</option>` +
    state.ruleProfiles
      .map((rule) => `<option value="${escapeHtml(rule.id)}">${escapeHtml(rule.name || "未命名规则")}</option>`)
      .join("");
  select.value = state.activeRuleId || "";
  const activeRule = state.ruleProfiles.find((rule) => rule.id === state.activeRuleId);
  if (!activeRule) {
    container.className = "import-preview empty";
    container.textContent = state.ruleProfiles.length ? "当前使用基础知识库。选择规则后，下方词库会切换到该规则提取出的用词。" : "暂无规则档案。";
    return;
  }
  const points = activeRule.analysisRules?.keyPoints || [];
  container.className = "import-preview";
  container.innerHTML = (points.length ? points : [activeRule.rawText || activeRule.name])
    .slice(0, 6)
    .map(
      (point, index) => `
        <div class="import-preview-row">
          <span>规则${index + 1}</span>
          <strong>${escapeHtml(activeRule.name || "规则")}</strong>
          <p>${escapeHtml(point)}</p>
        </div>
      `,
    )
    .join("");
}

async function scanProductImageFolder() {
  const folderPath = $("#productImageFolder")?.value.trim();
  if (!folderPath) {
    $("#coverAssetStatus").textContent = "线上请点“选择文件夹”；本地可填写路径后扫描。";
    return;
  }
  if (!isLocalWorkbench()) {
    $("#coverAssetStatus").textContent = "线上网页不能直接扫描电脑路径，请点“选择文件夹”导入产品图。";
    return;
  }
  $("#coverAssetStatus").textContent = "正在扫描产品图文件夹...";
  try {
    const result = await api("/api/assets/scan-folder", {
      method: "POST",
      body: JSON.stringify({ folderPath }),
    });
    state.coverAssets = result.coverAssets || [];
    state.coverAssetPath = result.asset?.path || "";
    state.productImageFolder = folderPath;
    $("#coverAssetStatus").textContent = result.asset
      ? `已找到 ${state.coverAssets.length} 张产品图，当前将优先使用：${result.asset.name}`
      : "文件夹里没有找到 png、jpg、jpeg、webp 图片";
  } catch (error) {
    $("#coverAssetStatus").textContent = `扫描失败：${error.message}`;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function loadImageForResize(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片无法预览或格式不受支持"));
    image.src = dataUrl;
  });
}

async function compressImageFile(file, maxSide = 1280, quality = 0.76) {
  const original = await fileToDataUrl(file);
  if (file.size <= 900 * 1024) return original;
  const image = await loadImageForResize(original);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function importProductImageFiles(files) {
  const images = Array.from(files || []).filter((file) => /^image\/(png|jpe?g|webp)$/i.test(file.type)).slice(0, 20);
  if (!images.length) {
    $("#coverAssetStatus").textContent = "没有选到 png、jpg、webp 产品图";
    return;
  }
  $("#coverAssetStatus").textContent = `正在导入 ${images.length} 张产品图...`;
  try {
    const coverAssets = [];
    for (const file of images) {
      const dataUrl = await compressImageFile(file);
      if (isLocalWorkbench()) {
        const result = await api("/api/assets/upload", {
          method: "POST",
          body: JSON.stringify({ name: file.webkitRelativePath || file.name, dataUrl }),
        });
        if (result.asset) coverAssets.push(result.asset);
      } else {
        coverAssets.push({
          id: `browser-asset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          name: file.webkitRelativePath || file.name,
          path: dataUrl,
          createdAt: new Date().toISOString(),
        });
      }
    }
    state.coverAssets = coverAssets.length ? coverAssets : state.coverAssets;
    state.coverAssetPath = state.coverAssets[0]?.path || "";
    $("#coverAssetStatus").textContent = state.coverAssetPath
      ? `已导入 ${state.coverAssets.length} 张产品图，生成封面时会优先参考`
      : "产品图导入完成，但没有可用图片";
  } catch (error) {
    $("#coverAssetStatus").textContent = `导入失败：${error.message}`;
  }
}

async function previewKnowledgeImport() {
  const rawText = $("#knowledgePasteText").value.trim();
  if (!rawText) {
    $("#knowledgeImportStatus").textContent = "请先粘贴内容";
    state.knowledgeImportDraft = null;
    renderKnowledgeImportPreview({ terms: {}, templates: {} });
    return;
  }
  $("#knowledgeImportStatus").textContent = "AI 正在分析资料...";
  try {
    state.knowledgeImportDraft = await api("/api/knowledge/analyze", {
      method: "POST",
      body: JSON.stringify({
        rawText,
        product: getProductInput(),
        modelConfig: modelConfigForRequest(),
      }),
    });
    $("#knowledgeImportStatus").textContent = state.knowledgeImportDraft.usedAi
      ? "AI 已完成分类预览，确认后写入"
      : "AI 不可用，已用本地规则预览";
  } catch (error) {
    state.knowledgeImportDraft = parseKnowledgePaste(rawText);
    $("#knowledgeImportStatus").textContent = `AI 分析失败，已用本地规则预览：${error.message}`;
  }
  renderKnowledgeImportPreview(state.knowledgeImportDraft);
}

function mergeKnowledgeValue(current, incoming) {
  const parts = splitList(`${current || ""}\n${incoming || ""}`);
  return [...new Set(parts)].join("、");
}

async function applyKnowledgeImport() {
  const draft = state.knowledgeImportDraft;
  if (!draft) {
    $("#knowledgeImportStatus").textContent = "请先预览导入结果";
    return;
  }
  Object.entries(draft.terms || {}).forEach(([name, value]) => {
    state.terms[name] = mergeKnowledgeValue(state.terms[name], value);
  });
  Object.entries(draft.templates || {}).forEach(([name, value]) => {
    state.templates[name] = mergeKnowledgeValue(state.templates[name], value);
  });
  if (draft.ruleProfile) {
    state.ruleProfiles = [draft.ruleProfile, ...state.ruleProfiles.filter((rule) => rule.name !== draft.ruleProfile.name)].slice(0, 30);
    state.activeRuleId = draft.ruleProfile.id;
    state.analysisRules = draft.ruleProfile.analysisRules;
    const importedTerms = splitList(draft.ruleProfile.terms?.规则用词 || "");
    state.hotspots = {
      ...(state.hotspots || {}),
      keywords: [...new Set([...importedTerms, ...((state.hotspots || {}).keywords || [])])].slice(0, 24),
      titlePatterns: [
        ...(draft.ruleProfile.analysisRules?.keyPoints || []).map((text) => ({ text, risk: "safe", source: "knowledge-rule" })),
        ...((state.hotspots || {}).titlePatterns || []),
      ].slice(0, 16),
      source: "knowledge-rule",
      warnings: ["当前选题库已接入知识库规则"],
    };
  }
  await saveKnowledge();
  renderManagers();
  renderRuleProfiles();
  renderHotspots();
  renderStats();
  $("#knowledgeImportStatus").textContent = "已写入知识库";
  $("#knowledgePasteText").value = "";
  state.knowledgeImportDraft = null;
  renderKnowledgeImportPreview({ terms: {}, templates: {} });
}

function renderNotesList() {
  const list = $("#notesList");
  if (!state.notes.length) {
    list.className = "notes-list empty";
    list.textContent = "生成后会出现 5 个差异化选题。";
    $("#editorPanel").classList.add("hidden");
    return;
  }

  list.className = "notes-list";
  list.innerHTML = state.notes
    .map(
      (note, index) => {
        const isPublished = note.publishStatus === "published";
        return `
        <div class="note-row ${index === state.selectedIndex ? "selected" : ""}" data-note-index="${index}" role="button" tabindex="0">
          <span>${index + 1}</span>
          <div>
            <div class="note-title-line">
              <strong>${escapeHtml(note.title)}</strong>
              <em class="status-badge ${isPublished ? "published" : "draft"}">${isPublished ? "已发布" : "草稿"}</em>
            </div>
            <p>${escapeHtml(note.angle)} · ${note.stage === "topic" ? "待生成文案" : "已生成文案"} · 合规分 ${note.quality?.score || "-"}</p>
            <button class="status-btn" data-status-note="${escapeHtml(note.id)}" data-next-status="${isPublished ? "draft" : "published"}">
              ${isPublished ? "退回草稿" : "标为已发布"}
            </button>
          </div>
        </div>
      `;
      },
    )
    .join("");

  $all("[data-note-index]").forEach((button) => {
    const selectNote = () => {
      state.selectedIndex = Number(button.dataset.noteIndex);
      state.selectedCoverVariant = 0;
      renderNotesList();
      renderSelectedNote();
    };
    button.addEventListener("click", selectNote);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectNote();
      }
    });
  });

  $all("[data-status-note]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await setNoteStatus(button.dataset.statusNote, button.dataset.nextStatus);
    });
  });
}

async function setNoteStatus(noteId, publishStatus) {
  const result = await api("/api/notes/status", {
    method: "POST",
    body: JSON.stringify({ noteId, publishStatus }),
  });
  state.notes = result.notes || state.notes;
  state.stats = result.stats || state.stats;
  state.history = result.history || state.history;
  renderStats();
  renderNotesList();
  renderDraftBox();
  renderHistory();
  renderSelectedNote();
}

function renderSelectedNote() {
  const note = state.notes[state.selectedIndex];
  if (!note) {
    $("#copyEmpty").classList.remove("hidden");
    $("#editorPanel").classList.add("hidden");
    $("#previewTitle").textContent = "生成后在这里预览标题";
    $("#previewBody").textContent = "这里会按照小红书详情页的阅读节奏展示正文，方便你判断封面、标题和正文是否像一篇真实笔记。";
    $("#previewTags").textContent = "#女生护理 #亲密关系";
    $("#previewComments").innerHTML = "";
    $("#previewCoverText").textContent = "等待生成";
    renderPreviewCoverGallery(null);
    $("#coverPromptBox").value = "";
    $("#coverVariantList").innerHTML = "";
    $("#coverOutputPath").value = "";
    $("#coverDownloadBtn").classList.add("hidden");
    $("#coverDownloadBtn").removeAttribute("href");
    $("#coverThumb").removeAttribute("src");
    $("#coverThumb").classList.remove("visible");
    $("#coverThumbFallback").classList.remove("hidden");
    $("#previewCover").removeAttribute("src");
    $("#previewCover").classList.remove("visible");
    $("#coverFallback").classList.remove("hidden");
    return;
  }

  $("#copyEmpty").classList.add("hidden");
  $("#editorPanel").classList.remove("hidden");
  $("#selectedAngle").textContent = note.angle;
  $("#editTitle").value = note.title;
  $("#editBody").value = note.body || "";
  $("#editBody").placeholder = note.body ? "" : "已生成选题。点击右上角“生成文案”，会基于这个标题扩写正文。";
  $("#editTags").value = note.tags || "";
  $("#editTags").placeholder = note.tags ? "" : "生成文案后会补齐标签";
  $("#editComments").value = (note.comments || []).join("\n");
  $("#editComments").placeholder = note.comments?.length ? "" : "生成文案后会补齐铺垫评论";
  $("#coverPromptBox").value = note.coverPrompt || "";
  $("#coverBriefBox").value = note.coverBrief || "";
  renderCoverVariants(note);
  const activeCoverImage = selectedCoverImage(note);
  $("#coverOutputPath").value = coverSourceText(selectedCoverSource(note) || activeCoverImage);
  if (note.coverAssetPath) {
    state.coverAssetPath = note.coverAssetPath;
    $("#coverAssetStatus").textContent = "当前笔记已绑定产品图";
  } else if (state.coverAssetPath) {
    $("#coverAssetStatus").textContent = "已扫描产品图文件夹，可生成时使用";
  }

  $("#previewTitle").textContent = note.title;
  $("#previewBody").textContent = note.body || "当前只有选题，还没有生成正文。";
  $("#previewTags").textContent = note.tags || "#待生成";
  $("#previewCoverText").textContent = note.coverText || note.title;
  $("#previewComments").innerHTML = (note.comments || [])
    .map((comment) => `<div class="comment-line">${escapeHtml(comment)}</div>`)
    .join("");
  $("#likeCount").textContent = note.metrics?.likes || 149;
  $("#favCount").textContent = note.metrics?.favorites || 50;
  $("#commentCount").textContent = note.metrics?.comments || 41;
  $("#slideCount").textContent = `${state.selectedIndex + 1}/${state.notes.length}`;
  $("#coverStatus").textContent =
    note.coverStatus === "done" ? "已生成真实封面" : note.coverStatus === "failed" ? "封面生成失败" : "等待生成";

  if (activeCoverImage) {
    const coverUrl = displayAssetUrl(activeCoverImage);
    $("#previewCover").src = coverUrl;
    $("#previewCover").classList.add("visible");
    $("#coverFallback").classList.add("hidden");
    $("#coverThumb").src = coverUrl;
    $("#coverThumb").classList.add("visible");
    $("#coverThumbFallback").classList.add("hidden");
    $("#coverDownloadBtn").href = assetUrl(activeCoverImage);
    $("#coverDownloadBtn").download = downloadNameForNote(note);
    $("#coverDownloadBtn").classList.remove("hidden");
  } else {
    $("#previewCover").removeAttribute("src");
    $("#previewCover").classList.remove("visible");
    $("#coverFallback").classList.remove("hidden");
    $("#coverThumb").removeAttribute("src");
    $("#coverThumb").classList.remove("visible");
    $("#coverThumbFallback").classList.remove("hidden");
    $("#coverDownloadBtn").classList.add("hidden");
    $("#coverDownloadBtn").removeAttribute("href");
  }
  renderPreviewCoverGallery(note);
}

function renderCoverVariants(note) {
  const list = $("#coverVariantList");
  if (!list) return;
  const variants = Array.isArray(note.coverVariants) ? note.coverVariants : [];
  if (!variants.length) {
    list.innerHTML = "";
    state.selectedCoverVariant = 0;
    return;
  }
  state.selectedCoverVariant = Math.min(state.selectedCoverVariant || 0, variants.length - 1);
  list.innerHTML = variants
    .map(
      (variant, index) =>
        `<button class="cover-variant-btn ${index === state.selectedCoverVariant ? "active" : ""}" data-cover-variant="${index}" type="button">${escapeHtml(variant.label || `封面 ${index + 1}`)}</button>`,
    )
    .join("");
  $all("[data-cover-variant]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCoverVariant = Number(button.dataset.coverVariant);
      note.coverImage = variants[state.selectedCoverVariant]?.image || note.coverImage;
      renderSelectedNote();
    });
  });
}

function renderPreviewCoverGallery(note) {
  const gallery = $("#previewCoverGallery");
  if (!gallery) return;
  if (!note) {
    gallery.innerHTML = "";
    return;
  }

  const variants = Array.isArray(note.coverVariants) && note.coverVariants.length
    ? note.coverVariants
    : note.coverImage
      ? [{ label: "当前封面", image: note.coverImage, source: note.coverImage }]
      : [];
  state.selectedCoverVariant = Math.min(state.selectedCoverVariant || 0, Math.max(variants.length - 1, 0));

  if (!variants.length) {
    const count = Math.max(1, Math.min(4, Number($("#coverCount")?.value || 1)));
    gallery.innerHTML = Array.from(
      { length: count },
      (_, index) => `
        <div class="preview-cover-card empty">
          <div class="preview-cover-thumb">封面 ${index + 1}</div>
          <strong>待生成</strong>
        </div>
      `,
    ).join("");
    return;
  }

  gallery.innerHTML = variants
    .map((variant, index) => {
      const isActive = index === state.selectedCoverVariant;
      return `
        <button class="preview-cover-card ${isActive ? "active" : ""}" data-preview-cover="${index}" type="button">
          <img class="preview-cover-thumb" src="${escapeHtml(displayAssetUrl(variant.image))}" alt="封面预览 ${index + 1}" />
          <strong>${escapeHtml(variant.label || `封面 ${index + 1}`)}</strong>
        </button>
      `;
    })
    .join("");

  $all("[data-preview-cover]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCoverVariant = Number(button.dataset.previewCover);
      note.coverImage = variants[state.selectedCoverVariant]?.image || note.coverImage;
      renderSelectedNote();
    });
  });
}

function coverHookLines(note, variantIndex = 0) {
  const source = String(note.coverText || note.title || "封面草稿").replace(/[｜|]/g, " ").replace(/\s+/g, " ").trim();
  const clean = source
    .replace(/女生别不好意思，?/g, "")
    .replace(/真的很正常/g, "很正常")
    .slice(0, 28);
  const presets = [
    ["同居久了像", "左手摸右手？"],
    ["小心机准备", "关系升温感"],
    ["别再硬聊了", "试试这一步"],
    ["舒服自然", "才是真的会"],
  ];
  if (clean.length < 8) return presets[variantIndex % presets.length];
  const first = clean.slice(0, Math.min(9, clean.length));
  const second = clean.slice(first.length, first.length + 10) || presets[variantIndex % presets.length][1];
  return [first, second];
}

function drawCoverText(ctx, text, x, y, size, color, accent, rotate = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.font = `900 ${size}px "Arial Rounded MT Bold", "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = Math.max(10, size * 0.16);
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(3, size * 0.04);
  ctx.strokeText(text, 0, 0);
  ctx.restore();
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function composeCoverFromAsset({ note, asset, variantIndex = 0 }) {
  const image = await loadImageForResize(asset.path);
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext("2d");
  const palettes = [
    { bg: "#fff4ea", ink: "#101828", accent: "#ff4d6d", blue: "#0b2f8a" },
    { bg: "#eaf8f5", ink: "#1f2937", accent: "#ff7a1a", blue: "#005f73" },
    { bg: "#fff2f4", ink: "#151515", accent: "#ef3054", blue: "#2f3a8f" },
    { bg: "#f7f0ff", ink: "#20152f", accent: "#00a896", blue: "#4b3fce" },
  ];
  const palette = palettes[variantIndex % palettes.length];
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = canvas.width / canvas.height;
  let sx = 0;
  let sy = 0;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;
  if (imageRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = Math.max(0, (image.naturalHeight - sh) * 0.54);
  }
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, 0, 820);
  gradient.addColorStop(0, "rgba(255,255,255,0.90)");
  gradient.addColorStop(0.44, "rgba(255,255,255,0.58)");
  gradient.addColorStop(1, "rgba(255,255,255,0.06)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, 900);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundRectPath(ctx, 70, 84, 230, 66, 33);
  ctx.fill();
  ctx.fillStyle = palette.accent;
  ctx.font = '900 30px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText("小红书感封面", 98, 128);

  const [line1, line2] = coverHookLines(note, variantIndex);
  drawCoverText(ctx, line1, 106, 330, 86, palette.ink, "rgba(255,255,255,0.95)", -1.5);
  drawCoverText(ctx, line2, 106, 462, 92, palette.blue, palette.accent, -2);

  ctx.fillStyle = palette.accent;
  ctx.font = '900 64px "Arial Rounded MT Bold", "PingFang SC", sans-serif';
  ctx.fillText(variantIndex % 2 ? "!" : "?", 850, 462);
  ctx.font = '900 48px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(variantIndex % 2 ? "真的会" : "试试看", 118, 610);
  ctx.fillStyle = palette.blue;
  ctx.fillText(variantIndex % 2 ? "轻松一点" : "找回感觉", 328, 610);
  ctx.fillStyle = "#ffbf1f";
  ctx.font = "900 62px Arial, sans-serif";
  ctx.fillText("⚡", 650, 612);

  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(118, 536);
  ctx.lineTo(250, 536);
  ctx.stroke();

  const brief = String($("#coverBriefBox")?.value || note.coverBrief || "").trim();
  if (brief) {
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    roundRectPath(ctx, 76, 1320, 872, 92, 28);
    ctx.fill();
    ctx.fillStyle = "rgba(31,41,55,0.78)";
    ctx.font = '700 28px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(brief.slice(0, 28), 116, 1377);
  }

  return canvas.toDataURL("image/png");
}

async function generateClientMaterialCovers(note, count) {
  const assets = state.coverAssets.filter((asset) => asset?.path && /^data:image\//i.test(asset.path));
  if (!assets.length) return null;
  const variants = [];
  for (let index = 0; index < count; index += 1) {
    const asset = assets[(state.selectedIndex + index) % assets.length];
    const image = await composeCoverFromAsset({ note, asset, variantIndex: index });
    variants.push({
      label: `素材封面 ${index + 1}`,
      image,
      source: `浏览器合成：${asset.name || "产品图"}`,
      assetName: asset.name || "",
      createdAt: new Date().toISOString(),
    });
  }
  return variants;
}

function qualitySummaryText(summary) {
  if (!summary) return "未生成";
  const issueText = summary.issues?.length ? `，${summary.issues.length} 个提示` : "";
  return `合规分 ${summary.score}${issueText}`;
}

async function saveKnowledge() {
  const product = getProductInput();
  const modelConfig = getModelConfig();
  const result = await api("/api/knowledge", {
    method: "POST",
    body: JSON.stringify({
      terms: state.terms,
      templates: state.templates,
      product,
      productProfiles: state.productProfiles,
      topicLibrary: state.hotspots,
      ruleProfiles: state.ruleProfiles,
      activeRuleId: state.activeRuleId,
      analysisRules: state.analysisRules,
      modelConfig,
    }),
  });
  state.stats = result.stats || state.stats;
  renderStats();
}

async function fetchHotspots() {
  const buttons = [$("#fetchHotspotsBtn"), $("#fetchHotspotsInlineBtn")].filter(Boolean);
  buttons.forEach((button) => {
    button.disabled = true;
    button.textContent = "读取中...";
  });
  $("#hotspotTime").textContent = "正在整理选题素材";
  try {
    await saveKnowledge();
    const product = getProductInput();
    const pasted = $("#hotspotImportText")?.value.trim();
    const fallbackText = [
      product.hotKeywords,
      product.name,
      product.category,
      product.sellingPoints,
      product.targetAudience,
    ]
      .filter(Boolean)
      .join("\n");
    state.hotspots = await api("/api/hotspots/import", {
      method: "POST",
      body: JSON.stringify({ rawText: pasted || fallbackText, product }),
    });
    renderHotspots();
    $("#hotspotTime").textContent = pasted ? "已导入粘贴素材" : "已基于商品信息生成基础素材";
    buttons.forEach((button) => (button.textContent = button.id === "fetchHotspotsBtn" ? "刷新素材库" : "读取素材库"));
  } catch (error) {
    $("#hotspotTime").textContent = `读取失败：${error.message}`;
    buttons.forEach((button) => (button.textContent = button.id === "fetchHotspotsBtn" ? "刷新素材库" : "读取素材库"));
  } finally {
    buttons.forEach((button) => (button.disabled = false));
  }
}

async function fetchXhsHotspots() {
  const button = $("#fetchXhsCliBtn");
  button.disabled = true;
  button.textContent = "拉取中...";
  $("#xhsConfigStatus").textContent = "正在调用小红书 CLI";
  $("#hotspotTime").textContent = "正在调用小红书 CLI";
  try {
    await saveScopedConfig("xhs");
    const product = getProductInput();
    if (isLocalWorkbench()) {
      state.hotspots = await api("/api/xhs/hotspots", {
        method: "POST",
        body: JSON.stringify({ product }),
      });
    } else {
      const localResult = await localHelperApi("/api/xhs/hotspots", {
        method: "POST",
        body: JSON.stringify({ product, xhsCliPath: $("#xhsCliPath")?.value.trim() || "" }),
      });
      const rawText = localResult.rawText || localResult.stdout || JSON.stringify(localResult.hotspots || localResult);
      state.hotspots = await api("/api/hotspots/import", {
        method: "POST",
        body: JSON.stringify({ rawText, product }),
      });
      applyXhsHelperStatus(localResult.status || { xhs: { available: true, loggedIn: true, message: "本地助手已拉取热点" } });
    }
    renderHotspots();
    $("#xhsConfigStatus").textContent = "已通过小红书 CLI 拉取并导入热点";
    $("#hotspotTime").textContent = "已通过小红书 CLI 拉取并导入热点";
  } catch (error) {
    $("#xhsConfigStatus").textContent = `拉取失败：${error.message}`;
    $("#hotspotTime").textContent = `拉取失败：${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "拉取热点";
  }
}

async function resetTopicLibrary() {
  const button = $("#resetTopicLibraryBtn");
  button.disabled = true;
  button.textContent = "重置中...";
  $("#hotspotTime").textContent = "正在恢复默认选题素材";
  try {
    const product = getProductInput();
    state.hotspots = await api("/api/hotspots/import", {
      method: "POST",
      body: JSON.stringify({
        product,
        rawText: [product.hotKeywords, product.name, product.category, product.sellingPoints, product.targetAudience].filter(Boolean).join("\n"),
      }),
    });
    renderHotspots();
    $("#hotspotTime").textContent = "已恢复默认选题素材";
  } catch (error) {
    $("#hotspotTime").textContent = `重置失败：${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "重置素材";
  }
}

async function importHotspots() {
  const button = $("#importHotspotsBtn");
  const rawText = $("#hotspotImportText").value.trim();
  if (!rawText) {
    $("#hotspotTime").textContent = "请先粘贴选题素材或 JSON";
    return;
  }
  button.disabled = true;
  button.textContent = "导入中...";
  $("#hotspotTime").textContent = "正在结构化选题素材";
  try {
    await saveKnowledge();
    state.hotspots = await api("/api/hotspots/import", {
      method: "POST",
      body: JSON.stringify({ rawText, product: getProductInput() }),
    });
    renderHotspots();
    $("#hotspotTime").textContent = "已导入选题素材";
  } catch (error) {
    $("#hotspotTime").textContent = `导入失败：${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "导入素材";
  }
}

async function saveCurrentProductProfile() {
  const product = getProductInput();
  const id = state.productProfiles.find((profile) => profile.name === product.name)?.id || `profile-${Date.now()}`;
  const nextProfile = { id, ...product, updatedAt: new Date().toISOString() };
  state.productProfiles = [nextProfile, ...state.productProfiles.filter((profile) => profile.id !== id)].slice(0, 20);
  await saveKnowledge();
  renderProductProfiles();
}

function syncProductProfile(profileId) {
  const profile = state.productProfiles.find((item) => item.id === profileId);
  if (!profile) return;
  setProductInput(profile);
  $("#productSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteProductProfile(profileId) {
  state.productProfiles = state.productProfiles.filter((item) => item.id !== profileId);
  await saveKnowledge();
  renderProductProfiles();
}

function generationPayload() {
  return {
    product: getProductInput(),
    hotspots: state.hotspots,
    knowledgeScope: state.knowledgeScope,
    tone: state.tone,
    modelConfig: modelConfigForRequest(),
    activeRuleId: state.activeRuleId,
  };
}

async function generateFullFlow(button) {
  button.disabled = true;
  button.textContent = "生成中...";
  $("#qualityScore").textContent = "质检中";
  try {
    await saveKnowledge();
    const result = await api("/api/notes/generate", {
      method: "POST",
      body: JSON.stringify(generationPayload()),
    });
    state.notes = result.notes || [];
    state.history = result.history || state.history;
    state.stats = result.stats || state.stats;
    state.selectedIndex = 0;
    $("#qualityScore").textContent = qualitySummaryText(result.qualitySummary);
    renderStats();
    renderNotesList();
    renderDraftBox();
    renderHistory();
    renderSelectedNote();
    await generateCoversForAllNotes(button);
  } catch (error) {
    $("#qualityScore").textContent = `生成失败：${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "自动全部生成";
  }
}

async function generateCoversForAllNotes(button) {
  if (!state.notes.length) return;
  for (let index = 0; index < state.notes.length; index += 1) {
    const note = state.notes[index];
    button.textContent = `封面 ${index + 1}/${state.notes.length}`;
    $("#coverStatus").textContent = `正在生成第 ${index + 1} 张封面`;
    try {
      const materialVariants = await generateClientMaterialCovers(note, 1);
      if (materialVariants?.length) {
        state.notes[index] = {
          ...state.notes[index],
          coverImage: materialVariants[0].image,
          coverVariants: materialVariants,
          coverStatus: "done",
          coverAssetPath: materialVariants[0].source,
          coverBrief: $("#coverBriefBox")?.value.trim() || note.coverBrief || "",
        };
      } else {
        const result = await api("/api/covers/generate", {
          method: "POST",
          body: JSON.stringify({
            note,
            modelConfig: modelConfigForRequest(),
            coverApiKey: visibleApiKey("cover"),
            coverAssetPath: apiSafeAssetPath(state.coverAssetPath || note.coverAssetPath || ""),
            productImageFolder: isLocalWorkbench() ? $("#productImageFolder")?.value.trim() || state.productImageFolder || "" : "",
            coverBrief: $("#coverBriefBox")?.value.trim() || note.coverBrief || "",
          }),
        });
        state.notes[index] = {
          ...state.notes[index],
          coverImage: result.coverImage,
          coverStatus: "done",
          coverAssetPath: result.coverAssetPath || state.coverAssetPath || note.coverAssetPath || "",
          coverBrief: $("#coverBriefBox")?.value.trim() || note.coverBrief || "",
        };
      }
    } catch (error) {
      state.notes[index] = { ...state.notes[index], coverStatus: "failed", coverError: error.message };
    }
    if (index === state.selectedIndex) renderSelectedNote();
  }
  $("#coverStatus").textContent = state.notes.some((note) => note.coverStatus === "done") ? "自动封面已处理" : "封面生成失败";
}

async function generateTopics(button) {
  button.disabled = true;
  button.textContent = "生成中...";
  $("#qualityScore").textContent = "正在生成选题";
  try {
    await saveKnowledge();
    const result = await api("/api/notes/generate-topics", {
      method: "POST",
      body: JSON.stringify(generationPayload()),
    });
    state.notes = result.notes || [];
    state.history = result.history || state.history;
    state.stats = result.stats || state.stats;
    state.selectedIndex = 0;
    $("#qualityScore").textContent = qualitySummaryText(result.qualitySummary);
    renderStats();
    renderNotesList();
    renderDraftBox();
    renderHistory();
    renderSelectedNote();
  } catch (error) {
    $("#qualityScore").textContent = `选题失败：${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "生成选题";
  }
}

async function generateSelectedCopy(button) {
  const note = state.notes[state.selectedIndex];
  if (!note) return;
  button.disabled = true;
  button.textContent = "生成中...";
  $("#selectedAngle").textContent = "正在生成文案";
  try {
    await saveKnowledge();
    const result = await api("/api/notes/generate-copy", {
      method: "POST",
      body: JSON.stringify({ ...generationPayload(), noteId: note.id, note, notes: state.notes }),
    });
    state.notes = Array.isArray(result.notes) && result.notes.length ? result.notes : state.notes.map((item) => (item.id === (result.note?.id || note.id) ? { ...item, ...(result.note || {}) } : item));
    state.history = result.history || state.history;
    state.stats = result.stats || state.stats;
    $("#qualityScore").textContent = qualitySummaryText(result.qualitySummary);
    renderStats();
    renderNotesList();
    renderDraftBox();
    renderHistory();
    renderSelectedNote();
  } catch (error) {
    $("#selectedAngle").textContent = `文案失败：${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "生成文案";
  }
}

async function saveCurrentCopy() {
  const note = state.notes[state.selectedIndex];
  if (!note) return;
  note.title = $("#editTitle").value.trim();
  note.body = $("#editBody").value.trim();
  note.tags = $("#editTags").value.trim();
  note.comments = splitList($("#editComments").value);
  note.coverText = note.title;
  note.coverPrompt = $("#coverPromptBox").value.trim() || note.coverPrompt;
  note.coverBrief = $("#coverBriefBox").value.trim();
  note.coverAssetPath = apiSafeAssetPath(state.coverAssetPath || note.coverAssetPath || "");
  note.stage = note.body ? "copy" : "topic";
  const result = await api("/api/notes/update", {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  state.notes = result.notes || state.notes;
  state.history = result.history || state.history;
  state.stats = result.stats || state.stats;
  renderStats();
  renderDraftBox();
  renderHistory();
  renderNotesList();
  renderSelectedNote();
}

async function generateSelectedCover(button) {
  const note = state.notes[state.selectedIndex];
  if (!note) return;
  const count = Math.max(1, Math.min(4, Number($("#coverCount")?.value || 1)));
  button.disabled = true;
  button.textContent = "生成中...";
  $("#coverStatus").textContent = `正在生成 ${count} 张封面`;
  try {
    const materialVariants = await generateClientMaterialCovers(note, count);
    if (materialVariants?.length) {
      note.coverVariants = materialVariants;
      state.selectedCoverVariant = 0;
      note.coverImage = materialVariants[0].image;
      note.coverAssetPath = materialVariants[0].source;
    } else {
      const variants = [];
      for (let index = 0; index < count; index += 1) {
        $("#coverStatus").textContent = `正在生成第 ${index + 1}/${count} 张封面`;
        const result = await api("/api/covers/generate", {
          method: "POST",
          body: JSON.stringify({
            note,
            modelConfig: modelConfigForRequest(),
            coverApiKey: visibleApiKey("cover"),
            coverAssetPath: apiSafeAssetPath(state.coverAssetPath || note.coverAssetPath || ""),
            productImageFolder: isLocalWorkbench() ? $("#productImageFolder")?.value.trim() || state.productImageFolder || "" : "",
            coverBrief: $("#coverBriefBox").value.trim() || note.coverBrief || "",
          }),
        });
        variants.push({
          label: `AI 封面 ${index + 1}`,
          image: result.coverImage,
          source: result.coverImage,
          createdAt: new Date().toISOString(),
        });
      }
      note.coverVariants = variants;
      state.selectedCoverVariant = 0;
      note.coverImage = variants[0]?.image || note.coverImage;
      note.coverAssetPath = variants[0]?.source || note.coverAssetPath || "";
    }
    note.coverStatus = "done";
    state.coverAssetPath = note.coverAssetPath;
    note.coverBrief = $("#coverBriefBox").value.trim() || note.coverBrief || "";
    $("#coverStatus").textContent = `已生成 ${note.coverVariants?.length || 1} 张封面`;
    renderSelectedNote();
  } catch (error) {
    note.coverStatus = "failed";
    $("#coverStatus").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "生成封面";
  }
}

async function exportBackup() {
  const result = await api("/api/backup/export");
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  link.href = url;
  link.download = `xhs-workbench-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  $("#apiKeyStatus").textContent = "备份已导出";
}

async function importBackupFile(file) {
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);
  const result = await api("/api/backup/import", {
    method: "POST",
    body: JSON.stringify(parsed),
  });
  state.terms = result.terms || {};
  if (!Object.prototype.hasOwnProperty.call(state.terms, "补充知识")) state.terms.补充知识 = "";
  state.templates = result.templates || {};
  state.product = result.product || {};
  state.hotspots = result.topicLibrary || result.hotspots || null;
  state.notes = result.notes || [];
  state.productProfiles = result.productProfiles || [];
  state.history = result.history || [];
  state.stats = result.stats || {};
  state.modelConfig = result.modelConfig || {};
  state.analysisRules = result.analysisRules || null;
  state.ruleProfiles = result.ruleProfiles || [];
  state.activeRuleId = result.activeRuleId || state.ruleProfiles[0]?.id || "";
  state.coverAssets = result.coverAssets || [];
  state.coverAssetPath = state.coverAssets[0]?.path || "";
  setProductInput(state.product);
  setModelConfig(state.modelConfig);
  renderStats();
  renderManagers();
  renderProductProfiles();
  renderHotspots();
  renderRuleProfiles();
  renderNotesList();
  renderDraftBox();
  renderHistory();
  renderSelectedNote();
  $("#apiKeyStatus").textContent = "备份已导入";
}

function bindEvents() {
  $all("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      $all(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.scrollTarget}`).scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  setupScrollSpy();

  bindSegmented("#knowledgeScope", "scope", (value) => (state.knowledgeScope = value));
  bindSegmented("#toneControl", "tone", (value) => (state.tone = value));
  bindSegmented("#hotspotUsageMode", "mode", (value) => (state.hotspotUsageMode = value));
  bindSegmented("#textModeControl", "mode", (value) => {
    state.textMode = value;
    updateModelFieldVisibility();
  });
  bindSegmented("#coverModeControl", "mode", (value) => {
    state.coverMode = value;
    updateModelFieldVisibility();
  });
  $("#textModelSelect").addEventListener("change", (event) => ($("#textModel").value = event.target.value));
  $("#coverModelSelect").addEventListener("change", (event) => ($("#imageModel").value = event.target.value));
  $("#fetchTextModelsBtn").addEventListener("click", () => fetchModelList("text", $("#fetchTextModelsBtn")));
  $("#fetchCoverModelsBtn").addEventListener("click", () => fetchModelList("cover", $("#fetchCoverModelsBtn")));

  $("#fetchHotspotsBtn").addEventListener("click", fetchHotspots);
  $("#fetchHotspotsInlineBtn").addEventListener("click", fetchHotspots);
  $("#fetchXhsCliBtn").addEventListener("click", fetchXhsHotspots);
  $("#testXhsCliBtn").addEventListener("click", async () => {
    const button = $("#testXhsCliBtn");
    if (!isLocalWorkbench()) {
      await runXhsHelperInstallAndLogin(button);
      return;
    }
    button.disabled = true;
    button.textContent = "测试中...";
    try {
      await saveScopedConfig("xhs");
      const status = await api("/api/status");
      $("#xhsConfigStatus").textContent = status.xhs.message;
      $("#xhsStatus").textContent = status.xhs.message;
      setDot($("#xhsDot"), status.xhs.available && status.xhs.loggedIn);
      button.textContent = "测试完成";
    } catch (error) {
      $("#xhsConfigStatus").textContent = `测试失败：${error.message}`;
      button.textContent = "测试连接";
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = "测试连接";
      }, 900);
    }
  });
  $("#importHotspotsBtn").addEventListener("click", importHotspots);
  bindHotspotEditor();
  $("#resetTopicLibraryBtn").addEventListener("click", resetTopicLibrary);
  $("#activeRuleSelect").addEventListener("change", async (event) => {
    state.activeRuleId = event.target.value;
    state.analysisRules = state.ruleProfiles.find((rule) => rule.id === state.activeRuleId)?.analysisRules || null;
    renderRuleProfiles();
    renderManagers();
    await saveKnowledge();
  });
  $("#deleteRuleBtn").addEventListener("click", async () => {
    if (!state.activeRuleId) return;
    state.ruleProfiles = state.ruleProfiles.filter((rule) => rule.id !== state.activeRuleId);
    state.activeRuleId = state.ruleProfiles[0]?.id || "";
    state.analysisRules = state.ruleProfiles[0]?.analysisRules || null;
    renderRuleProfiles();
    renderManagers();
    await saveKnowledge();
  });
  $("#pickProductFolderBtn")?.addEventListener("click", () => $("#productImageFiles")?.click());
  $("#productImageFiles")?.addEventListener("change", async (event) => {
    await importProductImageFiles(event.target.files);
    event.target.value = "";
  });
  $("#scanProductFolderBtn")?.addEventListener("click", scanProductImageFolder);
  $("#previewKnowledgeImportBtn").addEventListener("click", previewKnowledgeImport);
  $("#applyKnowledgeImportBtn").addEventListener("click", applyKnowledgeImport);
  $("#exportBackupBtn")?.addEventListener("click", exportBackup);
  $("#importBackupBtn")?.addEventListener("click", () => $("#backupFileInput")?.click());
  $("#backupFileInput")?.addEventListener("change", async (event) => {
    try {
      await importBackupFile(event.target.files?.[0]);
    } catch (error) {
      $("#apiKeyStatus").textContent = `导入失败：${error.message}`;
    } finally {
      event.target.value = "";
    }
  });

  $("#saveApiConfigBtn").addEventListener("click", async () => {
    const button = $("#saveApiConfigBtn");
    button.disabled = true;
    button.textContent = "保存中...";
    try {
      await saveApiConfig();
      button.textContent = "已保存";
      window.setTimeout(() => (button.textContent = "保存全部配置"), 900);
    } catch (error) {
      $("#apiKeyStatus").textContent = `保存失败：${error.message}`;
      button.textContent = "保存全部配置";
    } finally {
      window.setTimeout(() => (button.disabled = false), 900);
    }
  });

  $("#saveTextConfigBtn").addEventListener("click", async () => {
    const button = $("#saveTextConfigBtn");
    button.disabled = true;
    button.textContent = "保存中...";
    try {
      await saveScopedConfig("text");
      button.textContent = "已保存";
      window.setTimeout(() => (button.textContent = "保存文案设置"), 900);
    } catch (error) {
      $("#textConfigStatus").textContent = `保存失败：${error.message}`;
      button.textContent = "保存文案设置";
    } finally {
      window.setTimeout(() => (button.disabled = false), 900);
    }
  });

  $("#saveCoverConfigBtn").addEventListener("click", async () => {
    const button = $("#saveCoverConfigBtn");
    button.disabled = true;
    button.textContent = "保存中...";
    try {
      await saveScopedConfig("cover");
      button.textContent = "已保存";
      window.setTimeout(() => (button.textContent = "保存封面设置"), 900);
    } catch (error) {
      $("#coverConfigStatus").textContent = `保存失败：${error.message}`;
      button.textContent = "保存封面设置";
    } finally {
      window.setTimeout(() => (button.disabled = false), 900);
    }
  });

  $("#saveXhsConfigBtn").addEventListener("click", async () => {
    const button = $("#saveXhsConfigBtn");
    button.disabled = true;
    button.textContent = "保存中...";
    try {
      await saveScopedConfig("xhs");
      button.textContent = "已保存";
      window.setTimeout(() => (button.textContent = "保存服务设置"), 900);
    } catch (error) {
      $("#apiKeyStatus").textContent = `保存失败：${error.message}`;
      button.textContent = "保存服务设置";
    } finally {
      window.setTimeout(() => (button.disabled = false), 900);
    }
  });
  $("#installXhsCliBtn")?.addEventListener("click", async () => {
    const button = $("#installXhsCliBtn");
    if (!isLocalWorkbench()) {
      try {
        const status = await checkXhsLocalHelper();
        if (status.xhs?.available) {
          $("#xhsConfigStatus").textContent = "本地助手已连接。可以点“测试连接与登录”，需要登录时会在终端显示二维码。";
          return;
        }
      } catch {
        downloadXhsLocalHelper();
      }
      return;
    }
    button.disabled = true;
    button.textContent = "检测中...";
    try {
      const result = await api("/api/xhs/install", {
        method: "POST",
        body: JSON.stringify({ xhsCliPath: $("#xhsCliPath")?.value.trim() || "" }),
      });
      if (result.xhsCliPath) $("#xhsCliPath").value = result.xhsCliPath;
      $("#xhsConfigStatus").textContent = result.message || "CLI 已可用";
      await loadStatus();
    } catch (error) {
      $("#xhsConfigStatus").textContent = `CLI 安装/检测失败：${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = "安装/检测 CLI";
    }
  });

  $("#generateBtn").addEventListener("click", () => generateFullFlow($("#generateBtn")));
  $("#generateTopicsBtn").addEventListener("click", () => generateTopics($("#generateTopicsBtn")));
  $("#openDraftBoxBtn").addEventListener("click", () => {
    $("#draftBoxPanel").classList.toggle("hidden");
    renderDraftBox();
  });

  $("#saveProductProfileBtn").addEventListener("click", async () => {
    const button = $("#saveProductProfileBtn");
    button.disabled = true;
    button.textContent = "保存中...";
    try {
      await saveCurrentProductProfile();
      button.textContent = "已保存";
      window.setTimeout(() => (button.textContent = "保存当前商品为档案"), 900);
    } catch (error) {
      button.textContent = `失败：${error.message}`;
    } finally {
      window.setTimeout(() => (button.disabled = false), 900);
    }
  });

  $("#saveKnowledgeBtn").addEventListener("click", async () => {
    const button = $("#saveKnowledgeBtn");
    button.disabled = true;
    button.textContent = "保存中...";
    try {
      await saveKnowledge();
      button.textContent = "已保存";
      window.setTimeout(() => (button.textContent = "保存本页修改"), 900);
    } catch (error) {
      button.textContent = `失败：${error.message}`;
    } finally {
      window.setTimeout(() => (button.disabled = false), 900);
    }
  });

  $("#saveInputBtn").addEventListener("click", async () => {
    const button = $("#saveInputBtn");
    button.disabled = true;
    button.textContent = "保存中...";
    try {
      await saveKnowledge();
      button.textContent = "已保存";
    } catch (error) {
      button.textContent = `失败：${error.message}`;
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = "保存输入";
      }, 900);
    }
  });

  $("#saveEditBtn").addEventListener("click", saveCurrentCopy);
  $("#generateCopyTopBtn").addEventListener("click", () => generateSelectedCopy($("#generateCopyTopBtn")));

  $("#regenerateBtn").addEventListener("click", async () => {
    const index = state.selectedIndex;
    const result = await api("/api/notes/generate", {
      method: "POST",
      body: JSON.stringify(generationPayload()),
    });
    if (result.notes?.[index]) {
      state.notes[index] = { ...result.notes[index], title: `${result.notes[index].title}｜改写版` };
      state.history = result.history || state.history;
      state.stats = result.stats || state.stats;
      renderStats();
      renderHistory();
      renderNotesList();
      renderSelectedNote();
    }
  });

  $("#coverBtn").addEventListener("click", () => generateSelectedCover($("#coverBtn")));
  $("#coverTopBtn").addEventListener("click", () => generateSelectedCover($("#coverTopBtn")));
  $("#coverCount")?.addEventListener("change", renderSelectedNote);
  $("#previewRefreshBtn").addEventListener("click", renderSelectedNote);
}

function setupScrollSpy() {
  const navItems = $all("[data-scroll-target]");
  const sections = navItems
    .map((button) => document.getElementById(button.dataset.scrollTarget))
    .filter(Boolean);
  if (!sections.length) return;

  const scrollRoot = $(".generation-column");
  const rootCanScroll = () => scrollRoot && scrollRoot.scrollHeight > scrollRoot.clientHeight + 8;
  let ticking = false;
  const setActive = (sectionId) => {
    navItems.forEach((button) => {
      button.classList.toggle("active", button.dataset.scrollTarget === sectionId);
    });
  };
  const updateActive = () => {
    ticking = false;
    const rootRect = rootCanScroll() ? scrollRoot.getBoundingClientRect() : { top: 0, height: window.innerHeight };
    const anchorY = rootRect.top + Math.min(rootRect.height * 0.35, 260);
    let activeSection = sections[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.bottom < rootRect.top + 40 || rect.top > rootRect.top + rootRect.height) continue;
      const distance = Math.abs(rect.top - anchorY);
      if (distance < bestDistance) {
        bestDistance = distance;
        activeSection = section;
      }
    }
    setActive(activeSection.id);
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
    schedule(updateActive);
  };
  const scrollTargets = scrollRoot && scrollRoot !== document.body ? [window, scrollRoot] : [window];
  scrollTargets.forEach((target) =>
    target.addEventListener(
    "scroll",
    onScroll,
    { passive: true },
    ),
  );
  window.addEventListener("resize", updateActive);
  updateActive();
}

function bindSegmented(selector, dataName, onChange) {
  $all(`${selector} button`).forEach((button) => {
    button.addEventListener("click", () => {
      $all(`${selector} button`).forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      onChange(button.dataset[dataName]);
    });
  });
}

function selectSegment(selector, dataName, value) {
  $all(`${selector} button`).forEach((button) => {
    button.classList.toggle("selected", button.dataset[dataName] === value);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

initApiConfigInputs();
bindEvents();
loadState().then(loadStatus).catch((error) => {
  $("#xhsStatus").textContent = `初始化失败：${error.message}`;
  $("#apiKeyStatus").textContent = `接口不可用：${error.message}`;
});
