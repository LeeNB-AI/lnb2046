const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const ROOT = __dirname;
const DATA_DIR = process.env.XHS_WORKBENCH_DATA_DIR || path.join(ROOT, "data");
const OUTPUT_DIR = process.env.XHS_WORKBENCH_OUTPUT_DIR || path.join(DATA_DIR, "output");
const COVER_DIR = path.join(OUTPUT_DIR, "covers");
const ASSET_DIR = path.join(OUTPUT_DIR, "assets");
const STATE_FILE = path.join(DATA_DIR, "app-state.json");
const SECRET_FILE = path.join(DATA_DIR, "local-secrets.json");
const PORT = Number(process.env.PORT || 4173);

const defaults = {
  product: {
    name: "私密护理凝胶",
    category: "成人用品 / 两性健康",
    hotKeywords: "约会前准备, 亲密关系, 女生护理",
    sellingPoints:
      "温和配方，便携小支装，适合亲密关系前后的清洁护理；不主打医疗功效，强调舒适、安心、场景化。",
    targetAudience:
      "25-38 岁女性，重视亲密关系质量，想要更体面自然地处理私密护理问题。",
    blockedTerms: "治疗、根治、增强、未成年人、露骨动作、低俗暗示、夸大效果",
  },
  terms: {
    人群需求词: "体面、安心、亲密关系质量、私密护理、出差便携、独居女性、长期伴侣",
    痛点词: "不好意思开口、担心尴尬、怕刺激、怕营销味太重、护理步骤麻烦",
    场景词: "约会前、旅行途中、同居日常、换季敏感、亲密关系沟通",
    卖点词: "温和、便携、无负担、清爽、低调、日常护理",
    禁用词: "治疗、根治、增强、未成年人、露骨动作、低俗暗示、夸大效果",
    补充知识: "",
  },
  templates: {
    标题模板:
      "不是害羞，是这个细节真的会影响亲密关系｜女生约会前的小准备｜同居后才懂的护理小习惯",
    正文模板: "痛点共鸣开头 -> 场景描述 -> 产品自然出现 -> 使用感受 -> 温和提醒",
    评论模板: "适合敏感肌吗？｜这个可以放包里吗？｜想看无营销版测评",
    封面模板: "大字标题 + 干净浴室/梳妆台氛围 + 小支产品意象 + 温和生活方式感",
  },
  modelConfig: {
    textMode: "cloud-api",
    textProvider: "OpenAI",
    textApiBaseUrl: "https://api.openai.com/v1",
    textModel: "gpt-5",
    coverMode: "cloud-api",
    coverProvider: "OpenAI",
    coverApiBaseUrl: "https://api.openai.com/v1",
    imageModel: "gpt-image-1",
    imageCliPath: "",
    pythonPath: "",
    productImageFolder: "",
    xhsCliPath: "",
    xhsCategory: "love",
    hotspotUsageMode: "balanced",
    temperature: 0.65,
    noteCount: 5,
    strictCompliance: true,
  },
  productProfiles: [
    {
      id: "profile-default-care",
      name: "私密护理凝胶",
      category: "成人用品 / 两性健康",
      hotKeywords: "约会前准备, 亲密关系, 女生护理",
      sellingPoints:
        "温和配方，便携小支装，适合亲密关系前后的清洁护理；不主打医疗功效，强调舒适、安心、场景化。",
      targetAudience:
        "25-38 岁女性，重视亲密关系质量，想要更体面自然地处理私密护理问题。",
      blockedTerms: "治疗、根治、增强、未成年人、露骨动作、低俗暗示、夸大效果",
      updatedAt: new Date().toISOString(),
    },
  ],
  topicLibrary: null,
  analysisRules: {
    summary: "",
    keyPoints: [],
    titleRules: "",
    bodyRules: "",
    copyRules: "",
    coverRules: "",
    styleKeywords: [],
    forbiddenPatterns: [],
    source: "",
    importedAt: null,
  },
  ruleProfiles: [],
  activeRuleId: "",
  coverAssets: [],
  hotspots: null,
  notes: [],
  history: [],
};

const fallbackHotspots = {
  keywords: ["约会前准备", "亲密关系体面感", "女生护理习惯", "出差包好物", "同居后才懂"],
  titlePatterns: [
    { text: "不是我夸，这个细节真的很加分", risk: "safe", source: "fallback" },
    { text: "女生别不好意思，这件事很正常", risk: "emotional", source: "fallback" },
    { text: "同居后才知道的小习惯", risk: "safe", source: "fallback" },
  ],
  contentPatterns: ["痛点共鸣", "生活场景", "自然带出产品", "使用感受", "合规提醒"],
  tags: ["#女生护理", "#约会前准备", "#亲密关系", "#好物分享", "#两性健康"],
  commentStyles: ["这个会不会刺激？", "蹲一个真实反馈", "适合旅行带吗？", "可以日常用吗？"],
  sampleNotes: ["CLI 暂不可用时使用的本地降级样本"],
  riskTerms: ["治疗", "根治", "增强", "未成年人", "露骨动作", "低俗暗示", "夸大效果"],
  source: "offline-library",
  warnings: [],
};

const unsafeTrendTerms = ["贱", "犯贱", "约炮", "小雨伞", "不给亲", "撩骚", "下头", "擦边"];
const slangTrendTerms = ["上头", "下头", "拿捏", "暧昧", "恋爱脑", "对象", "男朋友", "女朋友", "约会"];
const emotionalTrendTerms = ["委屈", "焦虑", "尴尬", "喜欢", "亲密", "关系", "安全感", "心动", "分手"];

const angles = [
  { type: "痛点共鸣", hook: "不好意思说，但真的很多女生都遇到过" },
  { type: "场景种草", hook: "约会前我会把这一步放进准备清单" },
  { type: "测评体验", hook: "这类私密护理产品，我更看重温和和方便" },
  { type: "对比避坑", hook: "别把护理做复杂，越日常越容易坚持" },
  { type: "品牌卖点", hook: "如果想要体面一点地聊私密护理，可以从这个小习惯开始" },
];

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(COVER_DIR, { recursive: true });
  fs.mkdirSync(ASSET_DIR, { recursive: true });
}

function readState() {
  ensureDirs();
  if (!fs.existsSync(STATE_FILE)) {
    writeState(defaults);
    return normalizeState(structuredClone(defaults));
  }
  try {
    return normalizeState({ ...structuredClone(defaults), ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) });
  } catch {
    return normalizeState(structuredClone(defaults));
  }
}

function writeState(nextState) {
  ensureDirs();
  fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 2));
}

function readSecrets() {
  ensureDirs();
  try {
    return JSON.parse(fs.readFileSync(SECRET_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeSecrets(nextSecrets) {
  ensureDirs();
  fs.writeFileSync(SECRET_FILE, JSON.stringify(nextSecrets, null, 2));
}

function maskSecret(value) {
  if (!value) return "";
  const text = String(value);
  return text.length <= 10 ? "已设置" : `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function execFileJson(command, args = [], timeout = 20000) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || error.message || "命令执行失败").trim()));
      const text = String(stdout || "").trim();
      if (!text) return resolve(null);
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(text);
      }
    });
  });
}

function commandExists(command, timeout = 5000) {
  return new Promise((resolve) => {
    const args = process.platform === "win32" ? ["/c", "where", command] : ["-lc", `command -v ${command}`];
    const shellCommand = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
    execFile(shellCommand, args, { timeout, maxBuffer: 1024 * 128 }, (error, stdout) => {
      resolve(error ? "" : String(stdout || "").trim().split(/\r?\n/)[0]);
    });
  });
}

async function fetchModelsFromApi({ type, apiBaseUrl, apiKey }) {
  const base = String(apiBaseUrl || "").trim().replace(/\/$/, "");
  if (!base) throw new Error("请先填写 API 地址");
  const secrets = readSecrets();
  const key = apiKey || (type === "cover" ? secrets.coverApiKey : secrets.textApiKey);
  if (!key) throw new Error(type === "cover" ? "缺少封面 API Key" : "缺少文案 API Key");
  const response = await fetch(`${base.replace(/\/v1$/, "")}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || `模型接口 HTTP ${response.status}`);
  const models = (data.data || data.models || [])
    .map((model) => ({ id: model.id || model.name, name: model.name || model.id }))
    .filter((model) => model.id)
    .slice(0, 120);
  return { models };
}

async function postModelJson({ apiBaseUrl, apiKey, model, temperature = 0.2, messages }) {
  const base = String(apiBaseUrl || "").trim().replace(/\/$/, "");
  if (!base) throw new Error("缺少文案 API 地址");
  if (!apiKey) throw new Error("缺少文案 API Key");
  const response = await fetch(`${base.replace(/\/v1$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature,
      messages,
      response_format: { type: "json_object" },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || `文案 API HTTP ${response.status}`);
  return safeJson(data.choices?.[0]?.message?.content || "");
}

async function analyzeKnowledgeWithAi({ rawText, product, modelConfig }) {
  const secrets = readSecrets();
  const apiKey = modelConfig?.textApiKey || secrets.textApiKey;
  if (!apiKey) throw new Error("缺少文案 API Key，无法使用 AI 分类");
  const parsed = await postModelJson({
    apiBaseUrl: modelConfig?.textApiBaseUrl || "https://api.openai.com/v1",
    apiKey,
    model: modelConfig?.textModel || "gpt-5",
    temperature: 0.15,
    messages: [
      {
        role: "system",
        content:
          "你是小红书知识库整理助手。只输出 JSON，把用户资料分类到指定字段。不要编造资料，没有明确内容就留空字符串。成人/两性健康内容只保留合规、非露骨、非医疗承诺的表达。",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            product,
            rawText,
            schema: {
              terms: {
                人群需求词: "逗号分隔",
                痛点词: "逗号分隔",
                场景词: "逗号分隔",
                卖点词: "逗号分隔",
                禁用词: "逗号分隔",
                补充知识: "无法归类但有价值的资料",
              },
              templates: {
                标题模板: "每条一行或用｜分隔",
                正文模板: "结构模板",
                评论模板: "评论模板",
                封面模板: "封面设计模板",
              },
              analysisRules: {
                summary: "资料摘要",
                keyPoints: ["关键规则"],
                titleRules: "标题规则",
                bodyRules: "正文规则",
                copyRules: "评论/口吻/转化规则",
                coverRules: "封面规则",
                styleKeywords: ["风格词"],
                forbiddenPatterns: ["禁用表达"],
              },
              ruleName: "不超过 28 字",
            },
          },
          null,
          2,
        ),
      },
    ],
  });
  if (!parsed || typeof parsed !== "object") throw new Error("AI 未返回可解析 JSON");
  const draft = {
    terms: parsed.terms || {},
    templates: parsed.templates || {},
    analysisRules: parsed.analysisRules || {},
    usedAi: true,
  };
  draft.ruleProfile = buildRuleProfileFromPaste(rawText, draft, parsed.ruleName);
  return draft;
}

function buildRuleProfileFromPaste(rawText, draft, preferredName = "") {
  const lines = String(rawText || "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4);
  const fallbackPoints = lines.filter((line) => line.length <= 120).slice(0, 8);
  const analysisRules = draft.analysisRules || {};
  const keyPoints = Array.isArray(analysisRules.keyPoints) && analysisRules.keyPoints.length ? analysisRules.keyPoints : fallbackPoints;
  const keywords = splitWords(
    [
      draft.terms?.人群需求词,
      draft.terms?.痛点词,
      draft.terms?.场景词,
      draft.terms?.卖点词,
      Array.isArray(analysisRules.styleKeywords) ? analysisRules.styleKeywords.join("、") : "",
    ]
      .filter(Boolean)
      .join("\n"),
  ).slice(0, 24);
  return {
    id: `rule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: String(preferredName || keyPoints[0] || "AI 导入规则").slice(0, 28),
    rawText,
    terms: {
      ...(draft.terms || {}),
      规则用词: keywords.join("、"),
      分析要点: keyPoints.join("\n"),
    },
    templates: draft.templates || {},
    analysisRules: {
      summary: analysisRules.summary || keyPoints.join("\n"),
      keyPoints,
      titleRules: analysisRules.titleRules || "",
      bodyRules: analysisRules.bodyRules || "",
      copyRules: analysisRules.copyRules || "",
      coverRules: analysisRules.coverRules || "",
      styleKeywords: Array.isArray(analysisRules.styleKeywords) ? analysisRules.styleKeywords : keywords,
      forbiddenPatterns: Array.isArray(analysisRules.forbiddenPatterns) ? analysisRules.forbiddenPatterns : splitWords(draft.terms?.禁用词 || ""),
      source: "ai-knowledge-import",
      importedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
  };
}

function normalizeState(state) {
  const next = { ...state };
  next.terms = { ...defaults.terms, ...(next.terms || {}) };
  next.templates = { ...defaults.templates, ...(next.templates || {}) };
  next.topicLibrary = normalizeTopicLibrary(next.topicLibrary || next.hotspots || fallbackHotspots);
  next.hotspots = normalizeTopicLibrary(next.hotspots || next.topicLibrary || fallbackHotspots);
  next.analysisRules = { ...defaults.analysisRules, ...(next.analysisRules || {}) };
  next.ruleProfiles = Array.isArray(next.ruleProfiles) ? next.ruleProfiles : [];
  next.activeRuleId = next.activeRuleId || next.ruleProfiles[0]?.id || "";
  next.coverAssets = Array.isArray(next.coverAssets) ? next.coverAssets : [];
  next.modelConfig = {
    ...defaults.modelConfig,
    ...(next.modelConfig || {}),
    textMode: next.modelConfig?.textMode || "cloud-api",
    textProvider: next.modelConfig?.textProvider || "OpenAI",
    textApiBaseUrl: next.modelConfig?.textApiBaseUrl || "https://api.openai.com/v1",
    textModel: next.modelConfig?.textModel || "gpt-5",
    coverMode: next.modelConfig?.coverMode || "cloud-api",
    coverProvider: next.modelConfig?.coverProvider || "OpenAI",
    coverApiBaseUrl: next.modelConfig?.coverApiBaseUrl || "https://api.openai.com/v1",
    imageModel: next.modelConfig?.imageModel || "gpt-image-1",
    imageCliPath: next.modelConfig?.imageCliPath || defaults.modelConfig.imageCliPath,
    pythonPath: next.modelConfig?.pythonPath || defaults.modelConfig.pythonPath,
    productImageFolder: next.modelConfig?.productImageFolder || "",
    xhsCliPath: next.modelConfig?.xhsCliPath || process.env.XHS_BIN || "/Users/libucuo/.local/bin/xhs",
  };
  next.productProfiles = Array.isArray(next.productProfiles) ? next.productProfiles : [];
  next.history = Array.isArray(next.history) ? next.history : [];
  next.notes = Array.isArray(next.notes)
    ? next.notes.map((note) => ({ ...note, publishStatus: note.publishStatus || "draft" }))
    : [];
  return next;
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function splitWords(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(items, limit = 12) {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}

function normalizeTopicLibrary(library = {}) {
  const source = library.source || "offline-library";
  return {
    ...fallbackHotspots,
    ...library,
    keywords: unique(library.keywords || fallbackHotspots.keywords, 24),
    titlePatterns: normalizePatternItems(library.titlePatterns || fallbackHotspots.titlePatterns, source),
    contentPatterns: unique(library.contentPatterns || fallbackHotspots.contentPatterns, 24),
    tags: unique(library.tags || fallbackHotspots.tags, 24),
    commentStyles: unique(library.commentStyles || fallbackHotspots.commentStyles, 24),
    riskTerms: unique(library.riskTerms || fallbackHotspots.riskTerms, 24),
    source,
    warnings: Array.isArray(library.warnings) ? library.warnings : [],
  };
}

function classifyHotspotText(text) {
  const value = String(text || "");
  if (unsafeTrendTerms.some((term) => value.includes(term))) return "risky";
  if (slangTrendTerms.some((term) => value.includes(term))) return "slang";
  if (emotionalTrendTerms.some((term) => value.includes(term))) return "emotional";
  return "safe";
}

function hotspotItem(text, source = "offline-library") {
  return { text, risk: classifyHotspotText(text), source };
}

function normalizePatternItems(items = [], source = "offline-library") {
  return items
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") return hotspotItem(item, source);
      if (item.text) return { text: item.text, risk: item.risk || classifyHotspotText(item.text), source: item.source || source };
      return null;
    })
    .filter(Boolean);
}

function uniqueHotspotItems(items, limit = 12) {
  const seen = new Set();
  return items
    .filter((item) => item && item.text && !seen.has(item.text) && seen.add(item.text))
    .slice(0, limit);
}

function collectStrings(value, bucket = []) {
  if (Array.isArray(value)) value.forEach((item) => collectStrings(item, bucket));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, bucket));
  else if (typeof value === "string") bucket.push(value);
  return bucket;
}

function structureHotspots(rawPieces, keywords, warnings) {
  const text = collectStrings(rawPieces).join("\n");
  const hashTags = unique(
    (text.match(/#[\p{Script=Han}\w-]+/gu) || [])
      .filter((item) => /\p{Script=Han}/u.test(item))
      .concat(keywords.filter((item) => /\p{Script=Han}/u.test(item)).map((k) => `#${k}`)),
    10,
  );
  const sentenceBits = unique(
    text
      .split(/[\n。！？!?]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 8 && item.length <= 42)
      .filter((item) => /\p{Script=Han}/u.test(item))
      .filter((item) => !/^[\d.Ee+-]+$/.test(item))
      .filter((item) => !/^[a-z0-9_-]{8,}$/i.test(item))
      .filter((item) => !/(WEBP|JPEG|PNG|FD_|nc_)/i.test(item)),
    10,
  );

  return {
    keywords: unique([...keywords, ...fallbackHotspots.keywords], 12),
    titlePatterns: uniqueHotspotItems(
      [...sentenceBits.map((item) => hotspotItem(item, "manual-import")), ...normalizePatternItems(fallbackHotspots.titlePatterns, "offline-library")],
      8,
    ),
    contentPatterns: fallbackHotspots.contentPatterns,
    tags: unique([...hashTags, ...fallbackHotspots.tags], 12),
    commentStyles: fallbackHotspots.commentStyles,
    sampleNotes: sentenceBits.slice(0, 6),
    source: rawPieces.length ? "manual-import" : "offline-library",
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}

function parseAnalysisRules(rawText, source = "pasted-analysis") {
  const lines = String(rawText || "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4);
  const text = lines.join("\n");
  const pickLines = (pattern, limit = 8) => lines.filter((line) => pattern.test(line)).slice(0, limit).join("\n");
  const summaryLines = lines
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => line.length >= 12 && line.length <= 120)
    .slice(0, 8);
  const hashtags = text.match(/#[\p{Script=Han}\w-]+/gu) || [];
  const styleKeywords = unique(
    [
      ...hashtags,
      ...splitWords(pickLines(/关键词|标签|话题|人群|场景|痛点|需求|风格|情绪/)),
    ].filter((item) => item.length <= 18),
    24,
  );
  const forbiddenPatterns = unique(splitWords(pickLines(/禁用|避免|不要|风险|违规|不能|慎用/)), 24);
  return {
    summary: summaryLines.join("\n"),
    keyPoints: summaryLines.slice(0, 6),
    titleRules: pickLines(/标题|题目|钩子|开头|爆款|吸引|点击/),
    bodyRules: pickLines(/正文|结构|内容|段落|展开|逻辑|种草|测评|铺垫/),
    copyRules: pickLines(/文案|表达|语气|评论|转化|口吻|CTA|行动/),
    coverRules: pickLines(/封面|图片|视觉|大字|构图|配色|素材/),
    styleKeywords,
    forbiddenPatterns,
    source,
    importedAt: new Date().toISOString(),
  };
}

function mergeAnalysisIntoState(state, rawText, source) {
  const rules = parseAnalysisRules(rawText, source);
  const append = (current, incoming) => mergeText(current, incoming);
  state.analysisRules = rules;
  state.terms = {
    ...state.terms,
    分析要点: append(state.terms?.分析要点, rules.keyPoints.join("\n")),
    禁用词: append(state.terms?.禁用词, rules.forbiddenPatterns.join("、")),
    场景词: append(state.terms?.场景词, rules.styleKeywords.join("、")),
  };
  state.templates = {
    ...state.templates,
    标题模板: append(state.templates?.标题模板, rules.titleRules),
    正文模板: append(state.templates?.正文模板, rules.bodyRules),
    评论模板: append(state.templates?.评论模板, rules.copyRules),
    封面模板: append(state.templates?.封面模板, rules.coverRules),
  };
  const topic = normalizeTopicLibrary(state.topicLibrary || state.hotspots || fallbackHotspots);
  state.topicLibrary = normalizeTopicLibrary({
    ...topic,
    keywords: unique([...rules.styleKeywords, ...topic.keywords], 24),
    titlePatterns: uniqueHotspotItems([
      ...rules.keyPoints.map((point) => hotspotItem(point, "analysis-rules")),
      ...normalizePatternItems(topic.titlePatterns, topic.source),
    ], 16),
    tags: unique([...rules.styleKeywords.filter((item) => item.startsWith("#")), ...topic.tags], 24),
    riskTerms: unique([...rules.forbiddenPatterns, ...topic.riskTerms], 24),
    source: "analysis-rules",
    warnings: ["当前选题库已接入导入分析"],
  });
  state.hotspots = state.topicLibrary;
  return rules;
}

function mergeText(current, incoming) {
  const next = String(incoming || "").trim();
  if (!next) return current || "";
  const existing = String(current || "").trim();
  if (!existing) return next;
  if (existing.includes(next)) return existing;
  return `${existing}\n${next}`;
}

async function fetchHotspots(product) {
  const state = readState();
  const cliPath = state.modelConfig?.xhsCliPath || "";
  const keywords = unique([
    ...splitWords(product.hotKeywords),
    product.name,
    ...splitWords(product.category).slice(0, 2),
  ], 6);
  if (cliPath) {
    const category = product.xhsCategory || state.modelConfig?.xhsCategory || "love";
    const raw = await execFileJson(cliPath, ["hot", "-c", category, "--json"], 30000);
    const result = normalizeTopicLibrary({
      ...structureHotspots([raw], keywords, ["本地 xhs CLI 拉取"]),
      source: "xhs-cli",
    });
    state.product = product;
    state.topicLibrary = result;
    state.hotspots = result;
    writeState(state);
    return result;
  }
  const result = normalizeTopicLibrary({
    ...(state.topicLibrary || state.hotspots || fallbackHotspots),
    keywords: unique([...keywords, ...((state.topicLibrary || state.hotspots || fallbackHotspots).keywords || [])], 24),
    source: "offline-library",
    warnings: ["线上版不自动采集小红书，请粘贴本地 CLI 导出的热点素材"],
    fetchedAt: new Date().toISOString(),
  });
  state.product = product;
  state.topicLibrary = result;
  state.hotspots = result;
  writeState(state);
  return result;
}

async function installOrDetectXhsCli(payload = {}) {
  const state = readState();
  const xhsCandidates = () =>
    unique(
      [
        payload.xhsCliPath,
        state.modelConfig?.xhsCliPath,
        process.env.XHS_BIN,
        process.platform === "win32" ? path.join(process.env.USERPROFILE || "", ".local", "bin", "xhs.exe") : "",
        path.join(process.env.HOME || "", ".local", "bin", "xhs"),
        "/Users/libucuo/.local/bin/xhs",
        "/opt/homebrew/bin/xhs",
        "/usr/local/bin/xhs",
        "xhs",
      ].filter(Boolean),
      12,
    );
  const detectXhs = async () => {
    for (const candidate of xhsCandidates()) {
      try {
        await execFileJson(candidate, ["--help"], 8000);
        state.modelConfig = { ...state.modelConfig, xhsCliPath: candidate };
        writeState(state);
        return {
          available: true,
          xhsCliPath: candidate,
          message: `已检测到小红书 CLI：${candidate}。如果未登录，请在终端运行登录命令后扫码/输入账号。`,
        };
      } catch {
        // Try the next known location.
      }
    }
    return null;
  };

  const detected = await detectXhs();
  if (detected) return detected;

  const uvCommand = (await commandExists("uv")) || (await commandExists(path.join(process.env.HOME || "", ".local", "bin", "uv")));
  if (uvCommand) {
    try {
      await execFileJson(uvCommand, ["tool", "install", "xiaohongshu-cli", "--force"], 120000);
      const installed = await detectXhs();
      if (installed) return { ...installed, message: `已自动安装并检测到小红书 CLI：${installed.xhsCliPath}。如果未登录，请在终端运行登录命令后扫码/输入账号。` };
    } catch (error) {
      throw new Error(`已找到 uv，但自动安装 xiaohongshu-cli 失败：${error.message}`);
    }
  }

  throw new Error("没有检测到 xhs CLI，也没有检测到 uv。请先运行本地安装助手安装 uv 和 xiaohongshu-cli。");
}

async function resetTopicLibrary(product) {
  const state = readState();
  const keywords = unique(
    [...splitWords(product.hotKeywords), product.name, ...splitWords(product.category).slice(0, 2), ...fallbackHotspots.keywords],
    24,
  );
  const result = normalizeTopicLibrary({
    ...fallbackHotspots,
    keywords,
    source: "offline-library",
    warnings: ["已恢复默认本地选题素材"],
    fetchedAt: new Date().toISOString(),
  });
  state.product = product;
  state.topicLibrary = result;
  state.hotspots = result;
  writeState(state);
  return result;
}

function listImagesInFolder(folderPath) {
  const resolved = path.resolve(String(folderPath || "").trim());
  if (!resolved || !fs.existsSync(resolved)) throw new Error("产品图文件夹不存在");
  if (!fs.statSync(resolved).isDirectory()) throw new Error("产品图路径不是文件夹");
  const allowed = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  return fs
    .readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && allowed.has(path.extname(entry.name).toLowerCase()))
    .slice(0, 80)
    .map((entry, index) => ({
      id: `folder-asset-${index}-${Date.now()}`,
      name: entry.name,
      path: path.join(resolved, entry.name),
      folderPath: resolved,
      source: "product-image-folder",
    }));
}

function chooseProductImage({ note, product, assets }) {
  if (!assets?.length) return null;
  const words = splitWords(
    [product?.name, product?.category, product?.hotKeywords, note?.angle, note?.title, note?.tags, note?.coverBrief]
      .filter(Boolean)
      .join("、"),
  ).map((item) => item.toLowerCase());
  const scored = assets.map((asset, index) => {
    const name = asset.name.toLowerCase();
    const score = words.reduce((sum, word) => sum + (word && name.includes(word) ? 3 : 0), 0) + (assets.length - index) / 100;
    return { asset, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].asset;
}

function shortError(error) {
  return String(error || "未知错误").split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 180);
}

function activeKnowledge(state, scope) {
  const activeRule = (state.ruleProfiles || []).find((rule) => rule.id === state.activeRuleId) || null;
  const baseTerms = scope === "all" || scope === "terms" ? state.terms : {};
  const baseTemplates = scope === "all" || scope === "templates" ? state.templates : {};
  return {
    terms: activeRule ? mergeKnowledgeGroup(baseTerms, activeRule.terms) : baseTerms,
    templates: activeRule ? mergeKnowledgeGroup(baseTemplates, activeRule.templates) : baseTemplates,
    analysisRules: activeRule?.analysisRules || state.analysisRules || defaults.analysisRules,
    activeRule,
  };
}

function mergeKnowledgeGroup(base = {}, extra = {}) {
  const result = { ...(base || {}) };
  Object.entries(extra || {}).forEach(([key, value]) => {
    result[key] = mergeText(result[key], value);
  });
  return result;
}

function buildStats(state) {
  const notes = state.notes || [];
  const history = state.history || [];
  const draftCount = notes.filter((note) => note.publishStatus !== "published").length;
  const publishedCount = notes.filter((note) => note.publishStatus === "published").length;
  const knowledgeCount =
    Object.keys(state.terms || {}).length +
    Object.keys(state.templates || {}).length +
    (state.productProfiles || []).length +
    (state.ruleProfiles || []).length;
  return {
    draftCount,
    publishedCount,
    knowledgeCount,
    latestGeneratedAt: history[0]?.createdAt || null,
  };
}

function pickDifferent(items, index, fallback, avoid = []) {
  const avoidSet = new Set(avoid.filter(Boolean));
  const pool = unique(items.filter((item) => !avoidSet.has(item)));
  return pool[index % Math.max(1, pool.length)] || fallback;
}

function pickRotated(items, index, fallback) {
  const pool = unique((items || []).filter(Boolean));
  return pool.length ? pool[Math.abs(index) % pool.length] : fallback;
}

function titleTemplateParts(knowledge) {
  return splitWords(knowledge.templates?.标题模板 || defaults.templates.标题模板)
    .flatMap((item) => String(item).split(/[|｜]/))
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

function buildTopicTitle({ product, knowledge, titlePatterns, angle, index, variantSeed }) {
  const pains = splitWords(knowledge.terms.痛点词 || defaults.terms.痛点词);
  const scenes = splitWords(knowledge.terms.场景词 || defaults.terms.场景词);
  const sells = splitWords(knowledge.terms.卖点词 || defaults.terms.卖点词);
  const templates = titleTemplateParts(knowledge);
  const pattern = pickRotated(titlePatterns.map((item) => item.text), variantSeed + index, "这个细节真的很加分");
  const pain = pickRotated(pains, variantSeed + index * 2, "不好意思开口");
  const scene = pickRotated(scenes, variantSeed + index * 3, "约会前");
  const sell = pickRotated(sells, variantSeed + index * 5, "安心");
  const template = pickRotated(templates, variantSeed + index, "");

  const variants = {
    痛点共鸣: [
      `女生别不好意思，${product.name}这类小习惯真的很正常`,
      `${pain}不是矫情，亲密关系里这个准备很重要`,
      `关于${publicCategory(product.category)}，很多女生其实都想问这件事`,
      template || `同居后才懂，${sell}比夸张卖点更重要`,
    ],
    场景种草: [
      `${pattern}：${scene}我会多做这一步`,
      `${scene}前的小准备，真的会让人松弛很多`,
      `包里多放一支${product.name}，尴尬场景少一点`,
      template || `女生${scene}前的小准备，别说太满但很有用`,
    ],
    测评体验: [
      `用了几次才发现，${product.name}最重要的是${sell}`,
      `${product.name}真实感受：我更在意这 3 个细节`,
      `不吹效果，只聊${product.name}用起来顺不顺手`,
      template || `${sell}、便携、低调，这类护理我只看这些`,
    ],
    对比避坑: [
      `亲密护理别乱买，先看这 3 个细节`,
      `买${publicCategory(product.category)}前，先避开这些硬广话术`,
      `${pain}的时候，别被夸张卖点带偏`,
      template || `不是越猛越好，这类小物我更看重日常感`,
    ],
    品牌卖点: [
      `同居后才懂：舒服自然的关系，需要一点准备`,
      `${product.name}适合怎么讲，才不像硬广？`,
      `把${sell}讲清楚，比制造焦虑更容易被接受`,
      template || `关系里的体面感，有时候来自一个小准备`,
    ],
  };

  return pickRotated(variants[angle.type] || variants.痛点共鸣, variantSeed + index, `${product.name}的一个真实选题`);
}

function publicCategory(category) {
  return String(category || "").includes("成人") ? "这类亲密护理好物" : category;
}

function buildBody(product, hotspot, knowledge, angle, index, tone, variantSeed = Date.now()) {
  const pains = splitWords(knowledge.terms.痛点词 || defaults.terms.痛点词);
  const scenes = splitWords(knowledge.terms.场景词 || defaults.terms.场景词);
  const sells = splitWords(knowledge.terms.卖点词 || defaults.terms.卖点词);
  const seed = variantSeed + index * 11;
  const keyword = pickRotated(hotspot.keywords, seed, "亲密关系");
  const scene = pickRotated(scenes, seed + 1, "约会前");
  const secondScene = pickDifferent(scenes, seed + 2, "旅行途中", [scene]);
  const sell = pickRotated(sells, seed + 3, "温和");
  const secondSell = pickDifferent(sells, seed + 4, "便携", [sell]);
  const pain = pickRotated(pains, seed + 5, "不好意思开口");
  const toneLine =
    tone === "ugc"
      ? "我会尽量把它当成自己的日常小习惯来讲，不把话说满，也不制造焦虑。"
      : tone === "brand"
        ? "如果从品牌表达看，重点应该放在安心、体面和使用场景，不要把卖点说成效果承诺。"
        : "这篇会保留一点真实体验感，同时把产品卖点放得更自然。";
  const analysisPoint = pickRotated(splitWords(knowledge.terms.分析要点 || knowledge.analysisRules?.keyPoints?.join("\n") || ""), seed + 6, "");
  const ruleLine = analysisPoint ? `\n\n这篇会按这条本地规则收住：${analysisPoint}。` : "";
  const structures = [
    [
      `${angle.hook}。以前一聊到${publicCategory(product.category)}，很多人第一反应就是尴尬，尤其是${pain}的时候，更容易把需求藏起来。`,
      `但放到真实生活里，它其实就是一个很日常的护理场景。比如${scene}、${secondScene}，准备得更细一点，整个人会更放松。`,
      `${product.name}适合放在这个位置：不强调医疗功效，也不讲夸张结果，只把${sell}、${secondSell}和舒服这几个点讲清楚。${toneLine}${ruleLine}`,
    ],
    [
      `这次想从“${keyword}”这个角度聊聊${product.name}。我不太喜欢把这类东西说得很夸张，反而更在意它在真实场景里有没有减少负担。`,
      `我的判断标准很简单：第一是${sell}，第二是${secondSell}，第三是不要让${scene}变成一件需要反复解释的事。`,
      `所以这篇会更像一篇使用前的小清单，而不是硬广。该提醒的边界会讲清楚，该弱化的功效话术也会避开。${ruleLine || toneLine}`,
    ],
    [
      `有些准备不是为了制造仪式感，而是为了避免临场尴尬。尤其是${scene}，越自然越不容易让人有压力。`,
      `${pain}这件事，很多人都经历过。与其事后补救，不如提前把选择做得更体面一点。`,
      `${product.name}在这篇里只承担一个角色：把${sell}、${secondSell}这些真实感受讲得具体一点，不用夸张词，也不把需求说成焦虑。${ruleLine || toneLine}`,
    ],
    [
      `如果买${publicCategory(product.category)}前只能看三个点，我会先看：是不是日常、是不是低负担、表达会不会太冒犯。`,
      `${product.name}可以放进“${keyword}”这个选题里讲，因为它更适合从${scene}切入，而不是直接堆卖点。`,
      `这篇正文会刻意避开“马上见效”这类话，把重点放在成年人关系里的尊重、准备和舒服。${toneLine}${ruleLine}`,
    ],
    [
      `我想把这篇写得像一次真实对话：不是劝你必须买什么，而是把${pain}背后的需求说清楚。`,
      `${scene}、${secondScene}这些场景里，真正影响体验的往往不是大话术，而是有没有提前考虑到彼此的感受。`,
      `所以${product.name}的出现会很轻，只讲${sell}和${secondSell}，最后用温和提醒收尾。${ruleLine || toneLine}`,
    ],
  ];
  return pickRotated(structures, variantSeed + index * 7, structures[0]).join("\n\n");
}

function buildBaseNotes({ product, hotspot, knowledge, modelConfig, tone, noteCount, copyMode = "full", variantSeed = Date.now() }) {
  const rawTitlePatterns = normalizePatternItems(
    hotspot.titlePatterns?.length ? hotspot.titlePatterns : fallbackHotspots.titlePatterns,
    hotspot.source || "xhs-cli",
  );
  const safeTitlePatterns = rawTitlePatterns.filter((item) => item.risk !== "risky");
  const titlePatternItems =
    modelConfig.hotspotUsageMode === "raw"
      ? rawTitlePatterns
      : modelConfig.hotspotUsageMode === "strict"
        ? rawTitlePatterns.filter((item) => item.risk === "safe")
        : safeTitlePatterns;
  const titlePatterns = titlePatternItems.length ? titlePatternItems : normalizePatternItems(fallbackHotspots.titlePatterns, "fallback");
  const tags = hotspot.tags.length ? hotspot.tags : fallbackHotspots.tags;
  const now = Date.now();

  return angles.slice(0, noteCount).map((angle, index) => {
    const title = buildTopicTitle({ product, knowledge, titlePatterns, angle, index, variantSeed });
    const body = copyMode === "topic" ? "" : buildBody(product, hotspot, knowledge, angle, index, tone, variantSeed);
    const noteTags =
      copyMode === "topic"
        ? ""
        : unique([tags[index], tags[index + 1], "#女生护理", "#亲密关系", "#约会前准备", "#好物分享"], 6).join(" ");
    const comments =
      copyMode === "topic"
        ? []
        : ["这个会不会刺激？想看真实使用感", "这种小支装出差带方便吗？", "感觉这个角度比直接营销舒服多了"];
    const coverText = title.length > 24 ? title.slice(0, 24) + "\n" + title.slice(24, 42) : title;
    return {
      id: `note-${now}-${index}`,
      angle: angle.type,
      title,
      body,
      tags: noteTags,
      comments,
      coverText,
      coverPrompt: buildCoverPrompt(product, title, angle.type, knowledge),
      coverImage: "",
      coverStatus: "pending",
      publishStatus: "draft",
      stage: copyMode === "topic" ? "topic" : "copy",
      metrics: { likes: 120 + index * 17, favorites: 36 + index * 9, comments: 18 + index * 5 },
      quality: qualityCheck({ title, body, comments, product, blockedTerms: product.blockedTerms }),
    };
  });
}

async function generateNotesWithTextApi({ modelConfig, product, hotspot, knowledge, notes, copyMode = "full", tone = "mixed" }) {
  const secrets = readSecrets();
  const apiKey = modelConfig?.textApiKey || secrets.textApiKey;
  if (!apiKey || !["cloud", "cloud-api"].includes(modelConfig.textMode)) return notes;
  const task =
    copyMode === "topic"
      ? "只生成选题草稿：每篇必须有 angle、title、coverText；body、tags、comments 可以为空。"
      : "生成完整小红书笔记：每篇必须有 angle、title、body、tags、comments、coverText。";
  const parsed = await postModelJson({
    apiBaseUrl: modelConfig.textApiBaseUrl || "https://api.openai.com/v1",
    apiKey,
    model: modelConfig.textModel || "gpt-5",
    temperature: Number(modelConfig.temperature ?? 0.75),
    messages: [
      {
        role: "system",
        content:
          "你是小红书成人/两性健康品类的合规内容策划。必须结合用户商品资料、本地知识库、AI 分类规则和热点素材生成。只输出 JSON，避免医疗承诺、低俗露骨、未成年人相关内容，不照抄高风险热点。",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            task,
            outputSchema: { notes: [{ angle: "", title: "", body: "", tags: "", comments: [""], coverText: "" }] },
            hardRequirements: [
              "固定生成不同角度，优先覆盖痛点共鸣、场景种草、测评体验、对比避坑、品牌卖点",
              "标题必须吸收热点素材里的表达方式或选题方向，但不能直接照抄 risky 低俗表达",
              "正文必须使用知识库词库和模板，不要只套默认模板",
              "成人/两性健康场景必须合规，弱化露骨表达、医疗功效承诺和夸大效果",
              "每篇标题结构、开头方式、卖点植入方式必须不同",
            ],
            product,
            hotspot,
            knowledge,
            tone,
            draftNotes: notes.map(({ id, angle, title, body, tags, comments, coverText }) => ({
              id,
              angle,
              title,
              body,
              tags,
              comments,
              coverText,
            })),
            seed: `${Date.now()}-${Math.random()}`,
          },
          null,
          2,
        ),
      },
    ],
  });
  if (!parsed?.notes?.length) throw new Error("文案 API 未返回 notes JSON");
  return parsed.notes.slice(0, notes.length).map((item, index) => {
    const fallback = notes[index];
    const title = String(item.title || fallback.title).trim();
    const body = copyMode === "topic" ? "" : String(item.body || fallback.body).trim();
    const comments = copyMode === "topic" ? [] : Array.isArray(item.comments) ? item.comments.slice(0, 3).map(String) : fallback.comments;
    const tags = copyMode === "topic" ? "" : String(item.tags || fallback.tags).trim();
    const note = {
      ...fallback,
      angle: item.angle || fallback.angle,
      title,
      body,
      tags,
      comments,
      coverText: item.coverText || title,
      coverPrompt: buildCoverPrompt(product, item.coverText || title, item.angle || fallback.angle, knowledge),
      modelSource: "cloud-text-api",
      stage: copyMode === "topic" ? "topic" : "copy",
    };
    note.quality = qualityCheck({ title: note.title, body: note.body, comments: note.comments, product, blockedTerms: product.blockedTerms });
    return note;
  });
}

async function makeNotes(payload) {
  const state = readState();
  if (payload.activeRuleId !== undefined) state.activeRuleId = payload.activeRuleId;
  const product = payload.product || state.product;
  const hotspot = normalizeTopicLibrary(payload.hotspots || state.topicLibrary || state.hotspots || fallbackHotspots);
  const modelConfig = { ...state.modelConfig, ...(payload.modelConfig || {}) };
  const scope = payload.knowledgeScope || modelConfig.knowledgeScope || "all";
  const tone = payload.tone || modelConfig.tone || "mixed";
  const knowledge = activeKnowledge(state, scope);
  const now = Date.now();
  const noteCount = Math.max(1, Math.min(5, Number(modelConfig.noteCount || 5)));

  const variantSeed = now + Math.floor(Math.random() * 10000);
  let notes = buildBaseNotes({ product, hotspot, knowledge, modelConfig, tone, noteCount, copyMode: "full", variantSeed });

  try {
    notes = await generateNotesWithTextApi({ modelConfig, product, hotspot, knowledge, notes, copyMode: "full", tone });
  } catch (error) {
    notes = notes.map((note) => ({ ...note, modelSource: "offline-rules", generationWarning: `AI 文案生成失败，已回退本地规则：${shortError(error.message)}` }));
  }

  const nextState = readState();
  nextState.product = product;
  nextState.modelConfig = modelConfig;
  nextState.activeRuleId = state.activeRuleId;
  nextState.topicLibrary = hotspot;
  nextState.hotspots = hotspot;
  nextState.notes = notes;
  const batch = {
    id: `batch-${now}`,
    createdAt: new Date(now).toISOString(),
    productName: product.name || "未命名商品",
    noteIds: notes.map((note) => note.id),
    notes,
    count: notes.length,
  };
  nextState.history = [batch, ...(nextState.history || [])].slice(0, 50);
  writeState(nextState);
  return { notes, history: nextState.history, stats: buildStats(nextState), qualitySummary: summarizeQuality(notes) };
}

async function makeTopicDrafts(payload) {
  const state = readState();
  if (payload.activeRuleId !== undefined) state.activeRuleId = payload.activeRuleId;
  const product = payload.product || state.product;
  const hotspot = normalizeTopicLibrary(payload.hotspots || state.topicLibrary || state.hotspots || fallbackHotspots);
  const modelConfig = { ...state.modelConfig, ...(payload.modelConfig || {}) };
  const scope = payload.knowledgeScope || modelConfig.knowledgeScope || "all";
  const tone = payload.tone || modelConfig.tone || "mixed";
  const knowledge = activeKnowledge(state, scope);
  const now = Date.now();
  const noteCount = Math.max(1, Math.min(5, Number(modelConfig.noteCount || 5)));
  const variantSeed = now + Math.floor(Math.random() * 10000);
  let notes = buildBaseNotes({ product, hotspot, knowledge, modelConfig, tone, noteCount, copyMode: "topic", variantSeed });
  try {
    notes = await generateNotesWithTextApi({ modelConfig, product, hotspot, knowledge, notes, copyMode: "topic", tone });
  } catch (error) {
    notes = notes.map((note) => ({ ...note, modelSource: "offline-rules", generationWarning: `AI 选题生成失败，已回退本地规则：${shortError(error.message)}` }));
  }
  const nextState = readState();
  nextState.product = product;
  nextState.modelConfig = modelConfig;
  nextState.activeRuleId = state.activeRuleId;
  nextState.topicLibrary = hotspot;
  nextState.hotspots = hotspot;
  nextState.notes = notes;
  const batch = {
    id: `batch-${now}`,
    createdAt: new Date(now).toISOString(),
    productName: product.name || "未命名商品",
    noteIds: notes.map((note) => note.id),
    notes,
    count: notes.length,
    stage: "topic",
  };
  nextState.history = [batch, ...(nextState.history || [])].slice(0, 50);
  writeState(nextState);
  return { notes, history: nextState.history, stats: buildStats(nextState), qualitySummary: summarizeQuality(notes) };
}

async function makeCopyForNote(payload) {
  const state = readState();
  if (payload.activeRuleId !== undefined) state.activeRuleId = payload.activeRuleId;
  const product = payload.product || state.product;
  const hotspot = normalizeTopicLibrary(payload.hotspots || state.topicLibrary || state.hotspots || fallbackHotspots);
  const modelConfig = { ...state.modelConfig, ...(payload.modelConfig || {}) };
  const scope = payload.knowledgeScope || modelConfig.knowledgeScope || "all";
  const tone = payload.tone || modelConfig.tone || "mixed";
  const knowledge = activeKnowledge(state, scope);
  const clientNotes = Array.isArray(payload.notes) ? payload.notes : [];
  const sourceNotes = state.notes.length ? state.notes : clientNotes;
  const noteIndex = Math.max(0, sourceNotes.findIndex((note) => note.id === payload.noteId));
  const current = sourceNotes[noteIndex] || payload.note;
  if (!current) throw new Error("请先生成或选择一个选题");
  const angle = angles.find((item) => item.type === current.angle) || angles[noteIndex % angles.length] || angles[0];
  const tags = hotspot.tags.length ? hotspot.tags : fallbackHotspots.tags;
  let nextNote = {
    ...current,
    body: buildBody(product, hotspot, knowledge, angle, noteIndex, tone, Date.now() + Math.floor(Math.random() * 10000)),
    tags: unique([tags[noteIndex], tags[noteIndex + 1], "#女生护理", "#亲密关系", "#约会前准备", "#好物分享"], 6).join(" "),
    comments: ["这个会不会刺激？想看真实使用感", "这种小支装出差带方便吗？", "感觉这个角度比直接营销舒服多了"],
    coverText: current.coverText || current.title,
    coverPrompt: buildCoverPrompt(product, current.title, current.angle, knowledge),
    stage: "copy",
  };

  try {
    const generated = await generateNotesWithTextApi({ modelConfig, product, hotspot, knowledge, notes: [nextNote], copyMode: "full", tone });
    nextNote = { ...nextNote, ...generated[0], id: current.id, publishStatus: current.publishStatus || "draft", stage: "copy" };
  } catch (error) {
    nextNote.modelSource = "offline-rules";
    nextNote.generationWarning = `AI 文案生成失败，已回退本地规则：${shortError(error.message)}`;
  }

  nextNote.quality = qualityCheck({
    title: nextNote.title,
    body: nextNote.body,
    comments: nextNote.comments,
    product,
    blockedTerms: product.blockedTerms,
  });
  state.product = product;
  state.modelConfig = modelConfig;
  state.topicLibrary = hotspot;
  state.hotspots = hotspot;
  state.notes = sourceNotes.length ? sourceNotes.map((note) => (note.id === current.id ? nextNote : note)) : [nextNote];
  state.history = (state.history || []).map((batch) =>
    (batch.noteIds || []).includes(current.id)
      ? { ...batch, notes: (batch.notes || []).map((note) => (note.id === current.id ? nextNote : note)) }
      : batch,
  );
  writeState(state);
  return { note: nextNote, notes: state.notes, history: state.history, stats: buildStats(state), qualitySummary: summarizeQuality(state.notes) };
}

function buildCoverPrompt(product, title, angle, knowledge = null) {
  const rules = knowledge || activeKnowledge(readState(), "all");
  const coverRules = rules.analysisRules?.coverRules ? `\n知识库封面规则：${rules.analysisRules.coverRules}` : "";
  return [
    "小红书封面生成任务",
    `产品：${product.name}`,
    `角度：${angle}`,
    `封面大字：${title}`,
    "使用 skill：cover-design（小红书首图/封面点击率优化规则）",
    "封面设计规则：大标题 3-5 个核心词、产品主体清晰、强对比、清晰焦点、画面不拥挤",
    "字体风格：小红书网感标题字，粗圆体/手写感/轻微倾斜，带白色描边、阴影、贴纸强调，不要商务 PPT 字体",
    "标题表达：有梗但不低俗，像真实博主首图；可用问号、引号、闪电感点缀，但不要堆满",
    "版式：竖版 2:3，标题放上方或中上区域，产品图在中下方，适合小红书信息流点击",
    "视觉：真实产品摄影感，干净高级，明亮柔和，避免廉价硬广",
    "约束：无露骨画面、无医疗功效承诺、无平台 UI 仿冒、无水印、不要虚构夸张效果",
  ].join("\n") + coverRules;
}

function qualityCheck({ title, body, comments, blockedTerms }) {
  const text = [title, body, ...(comments || [])].join("\n");
  const blocked = splitWords(blockedTerms).filter((term) => term && text.includes(term));
  const risky = ["保证", "私处变", "秒变", "强效"].filter((term) => text.includes(term));
  const issues = [
    ...blocked.map((term) => `包含禁用词：${term}`),
    ...risky.map((term) => `建议弱化表达：${term}`),
  ];
  return { score: Math.max(68, 96 - issues.length * 8), issues };
}

function summarizeQuality(notes) {
  const issues = notes.flatMap((note) => note.quality.issues);
  const avg = Math.round(notes.reduce((sum, note) => sum + note.quality.score, 0) / notes.length);
  return { score: avg, issues: unique(issues, 8) };
}

async function generateCover(payload) {
  const state = readState();
  const note = payload.note || state.notes.find((item) => item.id === payload.noteId);
  if (!note) throw new Error("没有找到要生成封面的笔记");
  const index = Math.max(0, state.notes.findIndex((item) => item.id === note.id));
  const outFile = path.join(COVER_DIR, `note-${Date.now()}-${index + 1}.svg`);
  let coverAssets = state.coverAssets || [];
  const productImageFolder = payload.productImageFolder || state.modelConfig?.productImageFolder || "";
  if (productImageFolder) {
    coverAssets = listImagesInFolder(productImageFolder);
    state.coverAssets = coverAssets;
    state.modelConfig = { ...state.modelConfig, productImageFolder };
  }
  const pickedAsset = chooseProductImage({ note, product: state.product, assets: coverAssets });
  const coverAssetPath = payload.coverAssetPath || note.coverAssetPath || pickedAsset?.path || state.coverAssets?.[0]?.path || "";
  const coverBrief = payload.coverBrief || note.coverBrief || "";
  const nextCoverFields = { coverAssetPath, coverBrief };
  fs.writeFileSync(outFile, buildCoverSvg({ ...note, ...nextCoverFields }, state.product, index), "utf8");

  const publicPath = `/output/covers/${path.basename(outFile)}`;
  state.notes = state.notes.map((item) =>
    item.id === note.id ? { ...item, ...nextCoverFields, coverImage: publicPath, coverStatus: "done" } : item,
  );
  state.history = (state.history || []).map((batch) =>
    (batch.noteIds || []).includes(note.id)
      ? {
          ...batch,
          notes: (batch.notes || []).map((item) =>
            item.id === note.id ? { ...item, ...nextCoverFields, coverImage: publicPath, coverStatus: "done" } : item,
          ),
        }
      : batch,
  );
  writeState(state);
  return { coverImage: publicPath, coverAssetPath, pickedAsset: pickedAsset || null };
}

function buildCoverSvg(note, product, index) {
  const palettes = [
    ["#f8d7dc", "#fff7f1", "#63323c", "#e85d75"],
    ["#d9ece8", "#fffaf2", "#23443f", "#4f9f8d"],
    ["#f4e2c4", "#fdf8ef", "#51381f", "#d78b37"],
    ["#d9e7f7", "#fff7ef", "#243955", "#5e8ec7"],
  ];
  const [bg, paper, ink, accent] = palettes[index % palettes.length];
  const titleLines = splitCoverLines(note.coverText || note.title || "封面草稿");
  const assetData = imageDataUriFromPublicPath(note.coverAssetPath);
  const imageBlock = assetData
    ? `<image href="${assetData}" x="118" y="820" width="788" height="360" preserveAspectRatio="xMidYMid slice" opacity="0.92"/>
  <rect x="118" y="820" width="788" height="360" fill="none" stroke="${accent}" stroke-width="4" opacity="0.5"/>`
    : `<rect x="142" y="860" width="740" height="250" rx="28" fill="${accent}" opacity="0.14"/>
  <text x="512" y="998" text-anchor="middle" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="34" font-weight="700" fill="${ink}" opacity="0.66">上传图片后会组合在这里</text>`;
  const brief = note.coverBrief
    ? `<text x="142" y="1434" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="26" fill="${ink}" opacity="0.72">${escapeXml(String(note.coverBrief).slice(0, 34))}</text>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">
  <rect width="1024" height="1536" fill="${bg}"/>
  <rect x="72" y="78" width="880" height="1380" rx="36" fill="${paper}"/>
  <circle cx="820" cy="280" r="96" fill="${accent}" opacity="0.18"/>
  <circle cx="206" cy="1180" r="150" fill="${accent}" opacity="0.12"/>
  <rect x="142" y="180" width="148" height="44" rx="22" fill="${accent}"/>
  <text x="216" y="211" text-anchor="middle" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="24" font-weight="700" fill="#fff">在线草稿</text>
  <text x="142" y="330" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="42" font-weight="700" fill="${ink}">${escapeXml(product.name || "未命名商品")}</text>
  ${titleLines
    .map((line, lineIndex) => `<text x="142" y="${560 + lineIndex * 92}" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="68" font-weight="800" fill="${ink}">${escapeXml(line)}</text>`)
    .join("\n  ")}
  ${imageBlock}
  <rect x="142" y="1248" width="740" height="2" fill="${accent}" opacity="0.55"/>
  <text x="142" y="1316" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="32" fill="${ink}" opacity="0.82">${escapeXml(note.angle || "内容选题")}</text>
  <text x="142" y="1376" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="28" fill="${ink}" opacity="0.62">在线工作台 · 分析驱动封面草稿</text>
  ${brief}
</svg>`;
}

function imageDataUriFromPublicPath(publicPath) {
  if (!publicPath) return "";
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(publicPath)) return publicPath;
  const assetPath = path.isAbsolute(publicPath)
    ? publicPath
    : publicPath.startsWith("/output/assets/")
      ? path.join(ASSET_DIR, path.basename(publicPath))
      : "";
  if (!assetPath) return "";
  if (!fs.existsSync(assetPath)) return "";
  const ext = path.extname(assetPath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(assetPath).toString("base64")}`;
}

function splitCoverLines(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const lines = [];
  for (let i = 0; i < clean.length && lines.length < 4; i += 9) lines.push(clean.slice(i, i + 9));
  return lines.length ? lines : ["封面草稿"];
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getStatus() {
  const state = readState();
  const secrets = readSecrets();
  const cliPath = state.modelConfig?.xhsCliPath || "";
  let xhs = {
    available: false,
    loggedIn: false,
    message: "线上版请粘贴 xhs CLI 导出的热点内容",
  };
  if (cliPath) {
    try {
      await execFileJson(cliPath, ["status", "--json"], 10000);
      xhs = { available: true, loggedIn: true, message: "小红书 CLI 已连接" };
    } catch (error) {
      xhs = { available: false, loggedIn: false, message: `小红书 CLI 不可用：${error.message}` };
    }
  }
  return {
    xhs,
    textgen: {
      available: Boolean(secrets.textApiKey),
      hasKey: Boolean(secrets.textApiKey),
      message: secrets.textApiKey ? "文案 API Key 已配置" : "本地预览中；线上使用 TEXT_API_KEY",
    },
    imagegen: {
      available: Boolean(secrets.coverApiKey),
      hasKey: Boolean(secrets.coverApiKey),
      message: secrets.coverApiKey ? "封面 API Key 已配置" : "本地预览中；线上使用 COVER_API_KEY",
    },
  };
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function sendOptions(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function serveFile(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (requestPath === "/data" || requestPath.startsWith("/data/")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  const filePath =
    requestPath === "/"
      ? path.join(ROOT, "index.html")
      : requestPath.startsWith("/output/")
        ? path.join(OUTPUT_DIR, requestPath.replace(/^\/output\/?/, ""))
        : path.join(ROOT, requestPath);
  const allowedRoot = requestPath.startsWith("/output/") ? OUTPUT_DIR : ROOT;
  if (!filePath.startsWith(allowedRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml; charset=utf-8",
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function createAppServer() {
  return http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") return sendOptions(res);
    if (req.method === "GET" && url.pathname === "/api/status") return send(res, 200, await getStatus());
    if (req.method === "GET" && url.pathname === "/api/settings") {
      const state = readState();
      const secrets = readSecrets();
      return send(res, 200, {
        apiBaseUrl: `http://127.0.0.1:${PORT}`,
        modelConfig: state.modelConfig,
        textApiKeySet: Boolean(secrets.textApiKey),
        textApiKeyMasked: maskSecret(secrets.textApiKey),
        coverApiKeySet: Boolean(secrets.coverApiKey),
        coverApiKeyMasked: maskSecret(secrets.coverApiKey),
        keySource: "local-preview",
        dataDir: DATA_DIR,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/settings") {
      const body = await readBody(req);
      const state = readState();
      if (body.modelConfig) {
        state.modelConfig = { ...state.modelConfig, ...body.modelConfig };
        writeState(state);
      }
      const secrets = readSecrets();
      if (body.textApiKey) secrets.textApiKey = body.textApiKey;
      if (body.coverApiKey) secrets.coverApiKey = body.coverApiKey;
      writeSecrets(secrets);
      return send(res, 200, {
        textApiKeySet: Boolean(secrets.textApiKey),
        textApiKeyMasked: maskSecret(secrets.textApiKey),
        coverApiKeySet: Boolean(secrets.coverApiKey),
        coverApiKeyMasked: maskSecret(secrets.coverApiKey),
        keySource: "local-preview",
      });
    }
    if (req.method === "POST" && url.pathname === "/api/models/list") {
      const body = await readBody(req);
      return send(res, 200, await fetchModelsFromApi(body));
    }
    if (req.method === "GET" && url.pathname === "/api/knowledge") {
      const state = readState();
      return send(res, 200, { ...state, stats: buildStats(state) });
    }
    if (req.method === "POST" && url.pathname === "/api/knowledge") {
      const body = await readBody(req);
      const state = readState();
  const next = {
        ...state,
        terms: body.terms || state.terms,
        templates: body.templates || state.templates,
        product: body.product || state.product,
        productProfiles: body.productProfiles || state.productProfiles || [],
        topicLibrary: normalizeTopicLibrary(body.topicLibrary || body.hotspots || state.topicLibrary || state.hotspots),
        hotspots: normalizeTopicLibrary(body.topicLibrary || body.hotspots || state.topicLibrary || state.hotspots),
        ruleProfiles: Array.isArray(body.ruleProfiles) ? body.ruleProfiles : state.ruleProfiles || [],
        activeRuleId: Object.prototype.hasOwnProperty.call(body, "activeRuleId") ? body.activeRuleId || "" : state.activeRuleId || "",
        analysisRules: Object.prototype.hasOwnProperty.call(body, "analysisRules")
          ? body.analysisRules || defaults.analysisRules
          : state.analysisRules || defaults.analysisRules,
        modelConfig: body.modelConfig || state.modelConfig,
      };
      writeState(next);
      return send(res, 200, { ...next, stats: buildStats(next) });
    }
    if (req.method === "POST" && url.pathname === "/api/xhs/hotspots") {
      const body = await readBody(req);
      return send(res, 200, await fetchHotspots(body.product || defaults.product));
    }
    if (req.method === "POST" && url.pathname === "/api/xhs/install") {
      const body = await readBody(req);
      return send(res, 200, await installOrDetectXhsCli(body));
    }
    if (req.method === "POST" && url.pathname === "/api/topic-library/reset") {
      const body = await readBody(req);
      return send(res, 200, await resetTopicLibrary(body.product || defaults.product));
    }
    if (req.method === "POST" && url.pathname === "/api/hotspots/import") {
      const body = await readBody(req);
      const rawText = String(body.rawText || body.text || "").trim();
      if (!rawText) return send(res, 400, { error: "请先粘贴选题素材或 JSON" });
      const state = readState();
      const product = body.product || state.product || defaults.product;
      const keywords = unique(
        [...splitWords(product.hotKeywords), product.name, ...splitWords(product.category).slice(0, 2)],
        6,
      );
      const parsed = safeJson(rawText);
      const result = {
        ...structureHotspots([parsed || rawText], keywords, ["手动粘贴导入"]),
        source: "manual-import",
      };
      state.product = product;
      state.topicLibrary = normalizeTopicLibrary(result);
      state.hotspots = state.topicLibrary;
      writeState(state);
      return send(res, 200, state.topicLibrary);
    }
    if (req.method === "POST" && url.pathname === "/api/analysis/import") {
      const body = await readBody(req);
      const rawText = String(body.rawText || "").trim();
      if (!rawText) return send(res, 400, { error: "请先粘贴分析正文" });
      const state = readState();
      const rules = mergeAnalysisIntoState(state, rawText, body.source || "pasted-analysis");
      writeState(state);
      return send(res, 200, { analysisRules: rules, state: { ...state, stats: buildStats(state) } });
    }
    if (req.method === "POST" && url.pathname === "/api/knowledge/analyze") {
      const body = await readBody(req);
      const rawText = String(body.rawText || "").trim();
      if (!rawText) return send(res, 400, { error: "请先粘贴资料或规则" });
      return send(res, 200, await analyzeKnowledgeWithAi(body));
    }
    if (req.method === "POST" && url.pathname === "/api/assets/scan-folder") {
      const body = await readBody(req);
      const folderPath = String(body.folderPath || "").trim();
      if (!folderPath) return send(res, 400, { error: "请先填写产品图文件夹路径" });
      const state = readState();
      const coverAssets = listImagesInFolder(folderPath);
      const asset = chooseProductImage({ note: state.notes?.[0] || {}, product: state.product, assets: coverAssets });
      state.coverAssets = coverAssets;
      state.coverAssetPath = asset?.path || "";
      state.modelConfig = { ...state.modelConfig, productImageFolder: path.resolve(folderPath) };
      writeState(state);
      return send(res, 200, { asset, coverAssets, productImageFolder: state.modelConfig.productImageFolder });
    }
    if (req.method === "POST" && url.pathname === "/api/assets/upload") {
      const body = await readBody(req);
      const raw = String(body.dataUrl || "");
      const match = raw.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/);
      if (!match) return send(res, 400, { error: "只支持 png、jpg、webp 图片" });
      const ext = match[1].includes("png") ? ".png" : match[1].includes("webp") ? ".webp" : ".jpg";
      const fileName = `asset-${Date.now()}${ext}`;
      const outFile = path.join(ASSET_DIR, fileName);
      fs.mkdirSync(ASSET_DIR, { recursive: true });
      fs.writeFileSync(outFile, Buffer.from(match[2], "base64"));
      const publicPath = `/output/assets/${fileName}`;
      const state = readState();
      const asset = { id: `asset-${Date.now()}`, name: body.name || fileName, path: publicPath, createdAt: new Date().toISOString() };
      state.coverAssets = [asset, ...(state.coverAssets || [])].slice(0, 20);
      writeState(state);
      return send(res, 200, { asset, coverAssets: state.coverAssets });
    }
    if (req.method === "GET" && url.pathname === "/api/backup/export") {
      return send(res, 200, { exportedAt: new Date().toISOString(), version: "offline-desktop-v1", state: readState() });
    }
    if (req.method === "POST" && url.pathname === "/api/backup/import") {
      const body = await readBody(req);
      const imported = body.state || body;
      const next = normalizeState({ ...structuredClone(defaults), ...imported });
      writeState(next);
      return send(res, 200, { ...next, stats: buildStats(next) });
    }
    if (req.method === "POST" && url.pathname === "/api/notes/generate") {
      const body = await readBody(req);
      return send(res, 200, await makeNotes(body));
    }
    if (req.method === "POST" && url.pathname === "/api/notes/generate-topics") {
      const body = await readBody(req);
      return send(res, 200, await makeTopicDrafts(body));
    }
    if (req.method === "POST" && url.pathname === "/api/notes/generate-copy") {
      const body = await readBody(req);
      return send(res, 200, await makeCopyForNote(body));
    }
    if (req.method === "POST" && url.pathname === "/api/history/delete") {
      const body = await readBody(req);
      const state = readState();
      state.history = (state.history || []).filter((batch) => batch.id !== body.batchId);
      writeState(state);
      return send(res, 200, { history: state.history, stats: buildStats(state) });
    }
    if (req.method === "POST" && url.pathname === "/api/notes/status") {
      const body = await readBody(req);
      if (!["draft", "published"].includes(body.publishStatus)) {
        return send(res, 400, { error: "publishStatus 只支持 draft 或 published" });
      }
      const state = readState();
      state.notes = (state.notes || []).map((note) =>
        note.id === body.noteId ? { ...note, publishStatus: body.publishStatus } : note,
      );
      writeState(state);
      return send(res, 200, { notes: state.notes, stats: buildStats(state), history: state.history || [] });
    }
    if (req.method === "POST" && url.pathname === "/api/notes/update") {
      const body = await readBody(req);
      const state = readState();
      const note = body.note;
      if (!note?.id) return send(res, 400, { error: "缺少 note.id" });
      state.notes = (state.notes || []).map((item) => (item.id === note.id ? { ...item, ...note } : item));
      state.history = (state.history || []).map((batch) =>
        (batch.noteIds || []).includes(note.id)
          ? { ...batch, notes: (batch.notes || []).map((item) => (item.id === note.id ? { ...item, ...note } : item)) }
          : batch,
      );
      writeState(state);
      return send(res, 200, { notes: state.notes, history: state.history, stats: buildStats(state) });
    }
    if (req.method === "POST" && url.pathname === "/api/covers/generate") {
      const body = await readBody(req);
      return send(res, 200, await generateCover(body));
    }
    serveFile(req, res);
  } catch (error) {
    send(res, 500, { error: error.message || String(error) });
  }
});
}

function startServer(port = PORT, host = "127.0.0.1") {
  const server = createAppServer();
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      console.log(`小红书在线工作台本地预览已启动：http://${host}:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, createAppServer };
