const USER_ID = process.env.APP_USER_ID || "default";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "covers";

const defaults = {
  product: {
    name: "私密护理凝胶",
    category: "成人用品 / 两性健康",
    hotKeywords: "约会前准备, 亲密关系, 女生护理",
    sellingPoints: "温和配方，便携小支装，适合亲密关系前后的清洁护理；不主打医疗功效，强调舒适、安心、场景化。",
    targetAudience: "25-38 岁女性，重视亲密关系质量，想要更体面自然地处理私密护理问题。",
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
    标题模板: "不是害羞，是这个细节真的会影响亲密关系｜女生约会前的小准备｜同居后才懂的护理小习惯",
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
    productImageFolder: "",
    xhsCliPath: "xhs",
    xhsCategory: "love",
    hotspotUsageMode: "balanced",
    temperature: 0.75,
    noteCount: 5,
    strictCompliance: true,
    knowledgeScope: "all",
    tone: "mixed",
  },
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
  sampleNotes: ["线上未导入热点时使用的安全降级样本"],
  source: "fallback",
  warnings: [],
};

const unsafeTrendTerms = ["贱", "犯贱", "约炮", "不给亲", "撩骚", "擦边"];
const slangTrendTerms = ["上头", "下头", "拿捏", "暧昧", "恋爱脑", "对象", "男朋友", "女朋友", "约会"];
const emotionalTrendTerms = ["委屈", "焦虑", "尴尬", "喜欢", "亲密", "关系", "安全感", "心动", "分手"];
const angles = [
  { type: "痛点共鸣", hook: "不好意思说，但真的很多女生都遇到过" },
  { type: "场景种草", hook: "约会前我会把这一步放进准备清单" },
  { type: "测评体验", hook: "这类私密护理产品，我更看重温和和方便" },
  { type: "对比避坑", hook: "别把护理做复杂，越日常越容易坚持" },
  { type: "品牌卖点", hook: "如果想要体面一点地聊私密护理，可以从这个小习惯开始" },
];

function splitWords(value) {
  return String(value || "").split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
}

function unique(items, limit = 12) {
  return [...new Set((items || []).filter(Boolean))].slice(0, limit);
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const text = String(raw || "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function collectStrings(value, bucket = []) {
  if (Array.isArray(value)) value.forEach((item) => collectStrings(item, bucket));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, bucket));
  else if (typeof value === "string") bucket.push(value);
  return bucket;
}

function classifyHotspotText(text) {
  const value = String(text || "");
  if (unsafeTrendTerms.some((term) => value.includes(term))) return "risky";
  if (slangTrendTerms.some((term) => value.includes(term))) return "slang";
  if (emotionalTrendTerms.some((term) => value.includes(term))) return "emotional";
  return "safe";
}

function hotspotItem(text, source = "manual-import") {
  return { text, risk: classifyHotspotText(text), source };
}

function normalizePatternItems(items = [], source = "manual-import") {
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
  return items.filter((item) => item?.text && !seen.has(item.text) && seen.add(item.text)).slice(0, limit);
}

function structureHotspots(rawPieces, keywords, warnings = []) {
  const text = collectStrings(rawPieces).join("\n");
  const hashTags = unique(
    (text.match(/#[\p{Script=Han}\w-]+/gu) || [])
      .filter((item) => /\p{Script=Han}/u.test(item))
      .concat(keywords.filter((item) => /\p{Script=Han}/u.test(item)).map((item) => `#${item}`)),
    12,
  );
  const sentenceBits = unique(
    text
      .split(/[\n。！？!?]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 8 && item.length <= 42)
      .filter((item) => /\p{Script=Han}/u.test(item))
      .filter((item) => !/^[a-z0-9_-]{8,}$/i.test(item))
      .filter((item) => !/(WEBP|JPEG|PNG|FD_|nc_)/i.test(item)),
    12,
  );
  return {
    keywords: unique([...keywords, ...fallbackHotspots.keywords], 12),
    titlePatterns: uniqueHotspotItems(
      [...sentenceBits.map((item) => hotspotItem(item)), ...normalizePatternItems(fallbackHotspots.titlePatterns, "fallback")],
      10,
    ),
    contentPatterns: fallbackHotspots.contentPatterns,
    tags: unique([...hashTags, ...fallbackHotspots.tags], 12),
    commentStyles: fallbackHotspots.commentStyles,
    sampleNotes: sentenceBits.slice(0, 6),
    source: rawPieces.length ? "manual-import" : "fallback",
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}

function shortError(error) {
  return String(error || "未知错误").split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 180);
}

function envTextKey() {
  return process.env.TEXT_API_KEY || process.env.OPENAI_API_KEY || "";
}

function envCoverKey() {
  return process.env.COVER_API_KEY || process.env.OPENAI_API_KEY || "";
}

function maskSecret(value) {
  if (!value) return "";
  return value.length <= 10 ? "已配置" : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

async function supabase(path, options = {}) {
  if (!hasSupabase()) throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? safeJson(text) || text : null;
  if (!response.ok) throw new Error(typeof data === "string" ? data : data?.message || `Supabase HTTP ${response.status}`);
  return data;
}

function userFilter(select = "*") {
  return `user_id=eq.${encodeURIComponent(USER_ID)}&select=${encodeURIComponent(select)}`;
}

async function loadCloudState() {
  const state = {
    product: defaults.product,
    terms: defaults.terms,
    templates: defaults.templates,
    modelConfig: {
      ...defaults.modelConfig,
      textApiBaseUrl: process.env.TEXT_API_BASE_URL || defaults.modelConfig.textApiBaseUrl,
      textModel: process.env.TEXT_MODEL || defaults.modelConfig.textModel,
      coverApiBaseUrl: process.env.COVER_API_BASE_URL || defaults.modelConfig.coverApiBaseUrl,
      imageModel: process.env.COVER_MODEL || defaults.modelConfig.imageModel,
    },
    hotspots: null,
    notes: [],
    history: [],
    productProfiles: [],
  };
  if (!hasSupabase()) return { ...state, stats: buildStats(state), supabaseConfigured: false };

  const [termRows, templateRows, profileRows, importRows, noteRows, batchRows] = await Promise.all([
    supabase(`knowledge_terms?${userFilter("terms,product,model_config,updated_at")}&limit=1`).catch(() => []),
    supabase(`knowledge_templates?${userFilter("templates,updated_at")}&limit=1`).catch(() => []),
    supabase(`product_profiles?${userFilter("id,data,updated_at")}&order=updated_at.desc`).catch(() => []),
    supabase(`hotspot_imports?${userFilter("hotspots,created_at")}&order=created_at.desc&limit=1`).catch(() => []),
    supabase(`notes?${userFilter("id,data,publish_status,batch_id,updated_at")}&order=updated_at.desc&limit=80`).catch(() => []),
    supabase(`generation_batches?${userFilter("id,product_name,note_ids,notes_snapshot,count,stage,created_at")}&order=created_at.desc&limit=50`).catch(() => []),
  ]);

  const knowledge = termRows?.[0] || {};
  state.product = { ...state.product, ...(knowledge.product || {}) };
  state.terms = { ...state.terms, ...(knowledge.terms || {}) };
  state.modelConfig = { ...state.modelConfig, ...(knowledge.model_config || {}) };
  state.templates = { ...state.templates, ...(templateRows?.[0]?.templates || {}) };
  state.productProfiles = (profileRows || []).map((row) => ({ id: row.id, ...(row.data || {}), updatedAt: row.updated_at }));
  state.hotspots = importRows?.[0]?.hotspots || null;
  state.notes = (noteRows || []).map((row) => ({ ...(row.data || {}), id: row.id, publishStatus: row.publish_status || row.data?.publishStatus || "draft" }));
  state.history = (batchRows || []).map((row) => ({
    id: row.id,
    productName: row.product_name,
    noteIds: row.note_ids || [],
    notes: row.notes_snapshot || [],
    count: row.count,
    stage: row.stage,
    createdAt: row.created_at,
  }));
  return { ...state, stats: buildStats(state), supabaseConfigured: true };
}

async function saveKnowledge(body) {
  if (!hasSupabase()) {
    const state = {
      product: body.product || defaults.product,
      terms: { ...defaults.terms, ...(body.terms || {}) },
      templates: { ...defaults.templates, ...(body.templates || {}) },
      modelConfig: { ...defaults.modelConfig, ...(body.modelConfig || {}) },
      productProfiles: Array.isArray(body.productProfiles) ? body.productProfiles : [],
      hotspots: null,
      notes: [],
      history: [],
    };
    return { ...state, stats: buildStats(state), supabaseConfigured: false, persistenceWarning: "未配置 Supabase，本次保存仅用于当前请求，不会跨刷新持久保存" };
  }
  await Promise.all([
    supabase("knowledge_terms", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: {
        user_id: USER_ID,
        terms: body.terms || defaults.terms,
        product: body.product || defaults.product,
        model_config: body.modelConfig || defaults.modelConfig,
        updated_at: new Date().toISOString(),
      },
    }),
    supabase("knowledge_templates", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: {
        user_id: USER_ID,
        templates: body.templates || defaults.templates,
        updated_at: new Date().toISOString(),
      },
    }),
  ]);

  const profiles = Array.isArray(body.productProfiles) ? body.productProfiles : [];
  const existingProfiles = await supabase(`product_profiles?${userFilter("id")}`).catch(() => []);
  const nextProfileIds = new Set(profiles.map((profile) => profile.id).filter(Boolean));
  for (const profile of existingProfiles || []) {
    if (!nextProfileIds.has(profile.id)) {
      await supabase(`product_profiles?id=eq.${encodeURIComponent(profile.id)}&user_id=eq.${encodeURIComponent(USER_ID)}`, {
        method: "DELETE",
      });
    }
  }
  for (const profile of profiles) {
    await supabase("product_profiles", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: { id: profile.id, user_id: USER_ID, data: profile, updated_at: profile.updatedAt || new Date().toISOString() },
    });
  }
  return loadCloudState();
}

async function saveModelConfig(modelConfig) {
  const current = await loadCloudState();
  return saveKnowledge({
    product: current.product,
    terms: current.terms,
    templates: current.templates,
    productProfiles: current.productProfiles,
    modelConfig: { ...current.modelConfig, ...(modelConfig || {}) },
  });
}

async function importHotspots(body) {
  const rawText = String(body.rawText || body.text || "").trim();
  if (!rawText) throw new Error("请先粘贴 xhs JSON 或热点文本");
  const product = body.product || defaults.product;
  const keywords = unique([...splitWords(product.hotKeywords), product.name, ...splitWords(product.category).slice(0, 2)], 6);
  const hotspots = structureHotspots([safeJson(rawText) || rawText], keywords, ["线上手动导入"]);
  if (hasSupabase()) {
    await supabase("hotspot_imports", {
      method: "POST",
      body: { user_id: USER_ID, raw_text: rawText, hotspots, created_at: new Date().toISOString() },
    });
  }
  return hotspots;
}

function activeKnowledge(state, scope) {
  return {
    terms: scope === "all" || scope === "terms" ? state.terms : {},
    templates: scope === "all" || scope === "templates" ? state.templates : {},
  };
}

function publicCategory(category) {
  return String(category || "").includes("成人") ? "这类亲密护理好物" : category;
}

function pickRotated(items, index, fallback) {
  const pool = unique(items || []);
  return pool.length ? pool[Math.abs(index) % pool.length] : fallback;
}

function titleTemplateParts(knowledge) {
  return splitWords(knowledge.templates?.标题模板 || defaults.templates.标题模板).flatMap((item) => item.split(/[|｜]/)).filter(Boolean);
}

function buildTopicTitle({ product, knowledge, titlePatterns, angle, index, variantSeed }) {
  const pains = splitWords(knowledge.terms.痛点词 || defaults.terms.痛点词);
  const scenes = splitWords(knowledge.terms.场景词 || defaults.terms.场景词);
  const sells = splitWords(knowledge.terms.卖点词 || defaults.terms.卖点词);
  const templates = titleTemplateParts(knowledge);
  const pattern = pickRotated(titlePatterns.map((item) => item.text), variantSeed + index * 11, "这个细节真的很加分");
  const pain = pickRotated(pains, variantSeed + index * 17, "不好意思开口");
  const scene = pickRotated(scenes, variantSeed + index * 19, "约会前");
  const sell = pickRotated(sells, variantSeed + index * 23, "安心");
  const template = pickRotated(templates, variantSeed + index * 29, "");
  const variants = [
    `${pain}不是矫情，亲密关系里这个准备很重要`,
    `${pattern}：${scene}我会多做这一步`,
    `${product.name}真实感受：我更在意${sell}和顺手`,
    `买${publicCategory(product.category)}前，先避开这些硬广话术`,
    template || `同居后才懂：舒服自然的关系，需要一点准备`,
  ];
  return variants[index % variants.length] || `${product.name}的一个真实选题`;
}

function buildBody(product, hotspot, knowledge, angle, index, tone) {
  const pains = splitWords(knowledge.terms.痛点词 || defaults.terms.痛点词);
  const scenes = splitWords(knowledge.terms.场景词 || defaults.terms.场景词);
  const sells = splitWords(knowledge.terms.卖点词 || defaults.terms.卖点词);
  const keyword = hotspot.keywords?.[index % hotspot.keywords.length] || "亲密关系";
  const scene = scenes[index % scenes.length] || "约会前";
  const sell = sells[index % sells.length] || "温和";
  const pain = pains[index % pains.length] || "不好意思开口";
  const toneLine =
    tone === "brand"
      ? "从品牌表达看，重点放在安心、体面和使用场景，不把卖点说成效果承诺。"
      : tone === "ugc"
        ? "我会把它当成日常小习惯来讲，不把话说满，也不制造焦虑。"
        : "这篇保留真实体验感，同时把产品卖点放得更自然。";
  return `${angle.hook}。以前一聊到${publicCategory(product.category)}，很多人第一反应就是尴尬，尤其是${pain}的时候，更容易把需求藏起来。\n\n但放到真实生活里，它就是一个日常护理场景。比如${scene}，或者两个人相处久了之后，准备得更细一点，整个人会更放松。${product.name}适合放在这个位置：不强调医疗功效，也不讲夸张结果，只把${sell}和舒服这几个点讲清楚。\n\n我更喜欢用“${keyword}”这个角度去说它，因为它不会太硬广，也不会显得低俗。${toneLine}`;
}

function buildCoverPrompt(product, title, angle, knowledge = null) {
  const coverRules = knowledge?.templates?.封面模板 || defaults.templates.封面模板;
  return [
    "小红书封面生成任务",
    `产品：${product.name}`,
    `角度：${angle}`,
    `封面大字：${title}`,
    "封面设计规则：大标题 3-5 个核心词、产品主体清晰、强对比、清晰焦点、画面不拥挤",
    "版式：竖版 2:3，标题放上方或中上区域，产品图在中下方，适合小红书信息流点击",
    "视觉：真实产品摄影感，干净高级，明亮柔和，避免廉价硬广",
    `用户封面模板：${coverRules}`,
    "约束：无露骨画面、无医疗功效承诺、无平台 UI 仿冒、无水印、不要虚构夸张效果",
  ].join("\n");
}

function qualityCheck({ title, body, comments, blockedTerms }) {
  const text = [title, body, ...(comments || [])].join("\n");
  const blocked = splitWords(blockedTerms).filter((term) => term && text.includes(term));
  const risky = ["保证", "私处变", "秒变", "强效"].filter((term) => text.includes(term));
  const issues = [...blocked.map((term) => `包含禁用词：${term}`), ...risky.map((term) => `建议弱化表达：${term}`)];
  return { score: Math.max(68, 96 - issues.length * 8), issues };
}

function summarizeQuality(notes) {
  if (!notes.length) return { score: 0, issues: [] };
  const issues = notes.flatMap((note) => note.quality?.issues || []);
  const avg = Math.round(notes.reduce((sum, note) => sum + (note.quality?.score || 90), 0) / notes.length);
  return { score: avg, issues: unique(issues, 8) };
}

function buildStats(state) {
  const notes = state.notes || [];
  const history = state.history || [];
  return {
    draftCount: notes.filter((note) => note.publishStatus !== "published").length,
    publishedCount: notes.filter((note) => note.publishStatus === "published").length,
    knowledgeCount: Object.keys(state.terms || {}).length + Object.keys(state.templates || {}).length + (state.productProfiles || []).length,
    latestGeneratedAt: history[0]?.createdAt || null,
  };
}

function buildBaseNotes({ product, hotspot, knowledge, modelConfig, tone, noteCount, copyMode = "full" }) {
  const seed = Date.now() + Math.floor(Math.random() * 100000);
  const rawPatterns = normalizePatternItems(hotspot.titlePatterns?.length ? hotspot.titlePatterns : fallbackHotspots.titlePatterns, hotspot.source || "manual-import");
  const patterns = modelConfig.hotspotUsageMode === "raw" ? rawPatterns : rawPatterns.filter((item) => item.risk !== "risky");
  const tags = hotspot.tags?.length ? hotspot.tags : fallbackHotspots.tags;
  return angles.slice(0, noteCount).map((angle, index) => {
    const title = buildTopicTitle({ product, knowledge, titlePatterns: patterns.length ? patterns : fallbackHotspots.titlePatterns, angle, index, variantSeed: seed });
    const body = copyMode === "topic" ? "" : buildBody(product, hotspot, knowledge, angle, index, tone);
    const comments = copyMode === "topic" ? [] : ["这个会不会刺激？想看真实使用感", "这种小支装出差带方便吗？", "感觉这个角度比直接营销舒服多了"];
    const note = {
      id: `note-${seed}-${index}`,
      angle: angle.type,
      title,
      body,
      tags: copyMode === "topic" ? "" : unique([tags[index], tags[index + 1], "#女生护理", "#亲密关系", "#好物分享"], 6).join(" "),
      comments,
      coverText: title,
      coverPrompt: buildCoverPrompt(product, title, angle.type, knowledge),
      coverImage: "",
      coverStatus: "pending",
      publishStatus: "draft",
      stage: copyMode === "topic" ? "topic" : "copy",
      metrics: { likes: 120 + index * 17, favorites: 36 + index * 9, comments: 18 + index * 5 },
    };
    note.quality = qualityCheck({ title: note.title, body: note.body, comments: note.comments, blockedTerms: product.blockedTerms });
    return note;
  });
}

async function postJson(apiBaseUrl, apiKey, path, payload) {
  const response = await fetch(new URL(path, apiBaseUrl.replace(/\/v1\/?$/, "")).toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `模型 API HTTP ${response.status}`);
  return data;
}

async function postModelJson({ apiBaseUrl, apiKey, model, temperature = 0.2, messages }) {
  const data = await postJson(apiBaseUrl || "https://api.openai.com/v1", apiKey, "/v1/chat/completions", {
    model,
    temperature,
    messages,
    response_format: { type: "json_object" },
  });
  return safeJson(data.choices?.[0]?.message?.content || "");
}

function buildRuleProfileFromPaste(rawText, draft, preferredName = "") {
  const lines = String(rawText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    id: `rule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: preferredName || lines[0]?.slice(0, 18) || "AI 分类规则",
    rawText,
    terms: draft.terms || {},
    templates: draft.templates || {},
    analysisRules: draft.analysisRules || {
      keyPoints: lines.slice(0, 8),
      styleRules: [],
      avoidRules: [],
      matchingRules: [],
    },
    createdAt: new Date().toISOString(),
  };
}

async function analyzeKnowledgeWithAi(body = {}) {
  const rawText = String(body.rawText || "").trim();
  if (!rawText) throw new Error("请先粘贴资料或规则");
  const modelConfig = { ...defaults.modelConfig, ...(body.modelConfig || {}) };
  const apiKey = body.modelConfig?.textApiKey || envTextKey();
  if (!apiKey) throw new Error("缺少文案 API Key，无法使用 AI 分类");
  const parsed = await postModelJson({
    apiBaseUrl: modelConfig.textApiBaseUrl || process.env.TEXT_API_BASE_URL || "https://api.openai.com/v1",
    apiKey,
    model: modelConfig.textModel || process.env.TEXT_MODEL || "gpt-5",
    temperature: 0.15,
    messages: [
      {
        role: "system",
        content:
          "你是小红书知识库整理助手。只输出 JSON。把用户资料归类到固定词库和模板字段，不能编造不存在的重点；成人/两性健康内容要保留合规、温和、非露骨表达。",
      },
      {
        role: "user",
        content: `商品信息：${JSON.stringify(body.product || {})}\n\n待分析资料：\n${rawText}\n\n输出 JSON：{"ruleName":"","terms":{"人群需求词":"","痛点词":"","场景词":"","卖点词":"","禁用词":"","补充知识":""},"templates":{"标题模板":"","正文模板":"","评论模板":"","封面模板":""},"analysisRules":{"keyPoints":[],"styleRules":[],"avoidRules":[],"matchingRules":[]}}`,
      },
    ],
  });
  if (!parsed) throw new Error("文案模型没有返回可解析 JSON");
  const draft = {
    terms: {
      人群需求词: parsed.terms?.人群需求词 || "",
      痛点词: parsed.terms?.痛点词 || "",
      场景词: parsed.terms?.场景词 || "",
      卖点词: parsed.terms?.卖点词 || "",
      禁用词: parsed.terms?.禁用词 || "",
      补充知识: parsed.terms?.补充知识 || "",
    },
    templates: {
      标题模板: parsed.templates?.标题模板 || "",
      正文模板: parsed.templates?.正文模板 || "",
      评论模板: parsed.templates?.评论模板 || "",
      封面模板: parsed.templates?.封面模板 || "",
    },
    analysisRules: parsed.analysisRules || {},
    usedAi: true,
  };
  draft.ruleProfile = buildRuleProfileFromPaste(rawText, draft, parsed.ruleName);
  return draft;
}

async function listModels(body = {}) {
  const type = body.type === "cover" ? "cover" : "text";
  const apiBaseUrl = String(body.apiBaseUrl || "").trim().replace(/\/$/, "");
  if (!apiBaseUrl) throw new Error("请先填写 API 地址");
  const apiKey = body.apiKey || (type === "cover" ? envCoverKey() : envTextKey());
  if (!apiKey) throw new Error(type === "cover" ? "缺少 COVER_API_KEY" : "缺少 TEXT_API_KEY");
  const response = await fetch(`${apiBaseUrl.replace(/\/v1$/, "")}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || `模型接口 HTTP ${response.status}`);
  const models = (data.data || data.models || [])
    .map((model) => ({ id: model.id || model.name, name: model.name || model.id }))
    .filter((model) => model.id)
    .slice(0, 120);
  return { models };
}

async function generateNotesWithTextApi({ modelConfig, product, hotspot, knowledge, notes }) {
  const apiKey = envTextKey();
  if (!apiKey || !["cloud", "cloud-api"].includes(modelConfig.textMode)) return notes;
  const prompt = JSON.stringify({ product, hotspot, knowledge, requiredAngles: angles.map((item) => item.type), seed: Date.now() }, null, 2);
  const data = await postJson(modelConfig.textApiBaseUrl || process.env.TEXT_API_BASE_URL || "https://api.openai.com/v1", apiKey, "/v1/chat/completions", {
    model: modelConfig.textModel || process.env.TEXT_MODEL || "gpt-5",
    temperature: Number(modelConfig.temperature ?? 0.8),
    messages: [
      { role: "system", content: "你是小红书成人/两性健康品类的合规内容策划。只输出 JSON，避免医疗承诺、低俗露骨、未成年人相关内容。" },
      { role: "user", content: `生成 ${notes.length} 篇差异化笔记，JSON 格式为 {"notes":[{"angle":"","title":"","body":"","tags":"","comments":[""],"coverText":""}]}。\n${prompt}` },
    ],
    response_format: { type: "json_object" },
  });
  const parsed = safeJson(data.choices?.[0]?.message?.content || "");
  if (!parsed?.notes?.length) throw new Error("文案 API 未返回 notes JSON");
  return parsed.notes.slice(0, notes.length).map((item, index) => {
    const fallback = notes[index];
    const title = String(item.title || fallback.title).trim();
    const body = String(item.body || fallback.body).trim();
    const comments = Array.isArray(item.comments) ? item.comments.slice(0, 3).map(String) : fallback.comments;
    return {
      ...fallback,
      angle: item.angle || fallback.angle,
      title,
      body,
      tags: String(item.tags || fallback.tags).trim(),
      comments,
      coverText: item.coverText || title,
      coverPrompt: buildCoverPrompt(product, title, item.angle || fallback.angle, knowledge),
      modelSource: "cloud-text-api",
      quality: qualityCheck({ title, body, comments, blockedTerms: product.blockedTerms }),
    };
  });
}

async function persistNotes(product, notes, stage = "copy") {
  const now = new Date().toISOString();
  const batchId = `batch-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  if (hasSupabase()) {
    for (const note of notes) {
      await supabase("notes", {
        method: "POST",
        prefer: "resolution=merge-duplicates",
        body: { id: note.id, user_id: USER_ID, data: note, publish_status: note.publishStatus || "draft", batch_id: batchId, updated_at: now },
      });
    }
    await supabase("generation_batches", {
      method: "POST",
      body: {
        id: batchId,
        user_id: USER_ID,
        product_name: product.name || "未命名商品",
        note_ids: notes.map((note) => note.id),
        notes_snapshot: notes,
        count: notes.length,
        stage,
        created_at: now,
      },
    });
  }
  const batch = { id: batchId, productName: product.name || "未命名商品", noteIds: notes.map((note) => note.id), notes, count: notes.length, stage, createdAt: now };
  const state = await loadCloudState();
  return { notes, history: [batch, ...(state.history || [])].slice(0, 50), stats: buildStats({ ...state, notes, history: [batch, ...(state.history || [])] }), qualitySummary: summarizeQuality(notes) };
}

async function makeNotes(body, copyMode = "full") {
  const state = await loadCloudState();
  const product = body.product || state.product || defaults.product;
  const modelConfig = { ...defaults.modelConfig, ...state.modelConfig, ...(body.modelConfig || {}) };
  const hotspot = body.hotspots || state.hotspots || fallbackHotspots;
  const knowledge = activeKnowledge(state, body.knowledgeScope || modelConfig.knowledgeScope || "all");
  const noteCount = Math.max(1, Math.min(5, Number(modelConfig.noteCount || 5)));
  let notes = buildBaseNotes({ product, hotspot, knowledge, modelConfig, tone: body.tone || modelConfig.tone || "mixed", noteCount, copyMode });
  if (copyMode !== "topic") {
    try {
      notes = await generateNotesWithTextApi({ modelConfig, product, hotspot, knowledge, notes });
    } catch (error) {
      notes = notes.map((note) => ({ ...note, generationWarning: `云端文案生成失败，已回退本地模板：${shortError(error.message)}` }));
    }
  }
  return persistNotes(product, notes, copyMode === "topic" ? "topic" : "copy");
}

async function makeCopyForNote(body) {
  const state = await loadCloudState();
  const current = state.notes.find((note) => note.id === body.noteId) || body.note;
  if (!current) throw new Error("请先生成或选择一个选题");
  const product = body.product || state.product || defaults.product;
  const modelConfig = { ...defaults.modelConfig, ...state.modelConfig, ...(body.modelConfig || {}) };
  const hotspot = body.hotspots || state.hotspots || fallbackHotspots;
  const knowledge = activeKnowledge(state, body.knowledgeScope || modelConfig.knowledgeScope || "all");
  const noteIndex = Math.max(0, state.notes.findIndex((note) => note.id === current.id));
  const angle = angles.find((item) => item.type === current.angle) || angles[noteIndex % angles.length] || angles[0];
  let nextNote = {
    ...current,
    body: buildBody(product, hotspot, knowledge, angle, noteIndex, body.tone || modelConfig.tone || "mixed"),
    tags: unique([hotspot.tags?.[noteIndex], hotspot.tags?.[noteIndex + 1], "#女生护理", "#亲密关系", "#好物分享"], 6).join(" "),
    comments: ["这个会不会刺激？想看真实使用感", "这种小支装出差带方便吗？", "感觉这个角度比直接营销舒服多了"],
    stage: "copy",
  };
  try {
    const generated = await generateNotesWithTextApi({ modelConfig, product, hotspot, knowledge, notes: [nextNote] });
    nextNote = { ...nextNote, ...generated[0], id: current.id, publishStatus: current.publishStatus || "draft", stage: "copy" };
  } catch (error) {
    nextNote.generationWarning = `云端文案生成失败，已回退本地模板：${shortError(error.message)}`;
  }
  const notes = state.notes.map((note) => (note.id === nextNote.id ? nextNote : note));
  if (hasSupabase()) {
    await supabase(`notes?id=eq.${encodeURIComponent(nextNote.id)}&user_id=eq.${encodeURIComponent(USER_ID)}`, {
      method: "PATCH",
      body: { data: nextNote, publish_status: nextNote.publishStatus || "draft", updated_at: new Date().toISOString() },
    });
  }
  return { note: nextNote, notes, history: state.history, stats: buildStats({ ...state, notes }), qualitySummary: summarizeQuality(notes) };
}

async function updateNoteStatus(body) {
  if (!["draft", "published"].includes(body.publishStatus)) throw new Error("publishStatus 只支持 draft 或 published");
  const state = await loadCloudState();
  const notes = state.notes.map((note) => (note.id === body.noteId ? { ...note, publishStatus: body.publishStatus } : note));
  if (hasSupabase()) {
    const note = notes.find((item) => item.id === body.noteId);
    await supabase(`notes?id=eq.${encodeURIComponent(body.noteId)}&user_id=eq.${encodeURIComponent(USER_ID)}`, {
      method: "PATCH",
      body: { data: note, publish_status: body.publishStatus, updated_at: new Date().toISOString() },
    });
  }
  return { notes, history: state.history, stats: buildStats({ ...state, notes }) };
}

async function updateNote(body) {
  if (!body.note?.id) throw new Error("缺少 note.id");
  const state = await loadCloudState();
  const notes = state.notes.map((note) => (note.id === body.note.id ? { ...note, ...body.note } : note));
  if (hasSupabase()) {
    await supabase(`notes?id=eq.${encodeURIComponent(body.note.id)}&user_id=eq.${encodeURIComponent(USER_ID)}`, {
      method: "PATCH",
      body: { data: body.note, publish_status: body.note.publishStatus || "draft", updated_at: new Date().toISOString() },
    });
  }
  return { notes, history: state.history, stats: buildStats({ ...state, notes }) };
}

async function deleteHistory(body) {
  const state = await loadCloudState();
  if (hasSupabase()) await supabase(`generation_batches?id=eq.${encodeURIComponent(body.batchId)}&user_id=eq.${encodeURIComponent(USER_ID)}`, { method: "DELETE" });
  const history = state.history.filter((batch) => batch.id !== body.batchId);
  return { history, stats: buildStats({ ...state, history }) };
}

async function generateCover(body) {
  const state = await loadCloudState();
  const note = body.note || state.notes.find((item) => item.id === body.noteId);
  if (!note) throw new Error("没有找到要生成封面的笔记");
  const config = { ...defaults.modelConfig, ...state.modelConfig, ...(body.modelConfig || {}) };
  if (config.coverMode === "local-cli") throw new Error("线上版不能调用本地 Codex imagegen CLI，请切换云端 API；本机模式仍可使用 local-cli");
  const apiKey = envCoverKey();
  if (!apiKey) throw new Error("缺少 COVER_API_KEY 或 OPENAI_API_KEY 环境变量");
  const data = await postJson(config.coverApiBaseUrl || process.env.COVER_API_BASE_URL || "https://api.openai.com/v1", apiKey, "/v1/images/generations", {
    model: config.imageModel || process.env.COVER_MODEL || "gpt-image-1",
    prompt: note.coverPrompt || buildCoverPrompt(state.product || defaults.product, note.coverText || note.title, note.angle, activeKnowledge(state, config.knowledgeScope || "all")),
    size: "1024x1536",
    quality: "medium",
  });
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("封面 API 未返回 b64_json 图片数据");
  const imageBuffer = Buffer.from(b64, "base64");
  const fileName = `note-${Date.now()}-${Math.random().toString(16).slice(2)}.png`;
  let coverImage = `data:image/png;base64,${b64}`;
  if (hasSupabase()) {
    const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${fileName}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "image/png", "x-upsert": "true" },
      body: imageBuffer,
    });
    if (!upload.ok) throw new Error(`Supabase Storage 上传失败：HTTP ${upload.status}`);
    coverImage = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${fileName}`;
    const nextNote = { ...note, coverImage, coverStatus: "done" };
    await supabase(`notes?id=eq.${encodeURIComponent(note.id)}&user_id=eq.${encodeURIComponent(USER_ID)}`, {
      method: "PATCH",
      body: { data: nextNote, publish_status: nextNote.publishStatus || "draft", updated_at: new Date().toISOString() },
    });
  }
  return { coverImage };
}

async function route(pathname, method, body) {
  if (method === "GET" && pathname === "/api/status") {
    return {
      xhs: { available: false, loggedIn: false, message: "线上版不调用 xhs CLI，请用本地 CLI 后粘贴导入热点" },
      textgen: { available: Boolean(envTextKey()), hasKey: Boolean(envTextKey()), message: envTextKey() ? "云端文案 API 已由环境变量配置" : "缺少 TEXT_API_KEY" },
      imagegen: { available: Boolean(envCoverKey()), hasKey: Boolean(envCoverKey()), message: envCoverKey() ? "云端封面 API 已由环境变量配置" : "缺少 COVER_API_KEY" },
    };
  }
  if (method === "GET" && (pathname === "/api/settings" || pathname === "/api/settings/status")) {
    const state = await loadCloudState();
    return {
      modelConfig: state.modelConfig,
      textApiKeySet: Boolean(envTextKey()),
      textApiKeyMasked: maskSecret(envTextKey()),
      coverApiKeySet: Boolean(envCoverKey()),
      coverApiKeyMasked: maskSecret(envCoverKey()),
      keySource: "env",
    };
  }
  if (method === "POST" && pathname === "/api/settings") {
    const state = await saveModelConfig(body.modelConfig || {});
    return {
      modelConfig: state.modelConfig,
      textApiKeySet: Boolean(envTextKey()),
      textApiKeyMasked: maskSecret(envTextKey()),
      coverApiKeySet: Boolean(envCoverKey()),
      coverApiKeyMasked: maskSecret(envCoverKey()),
      keySource: "env",
    };
  }
  if (method === "GET" && pathname === "/api/knowledge") return loadCloudState();
  if (method === "POST" && pathname === "/api/knowledge") return saveKnowledge(body);
  if (method === "POST" && pathname === "/api/knowledge/analyze") return analyzeKnowledgeWithAi(body);
  if (method === "POST" && pathname === "/api/assets/scan-folder") {
    throw new Error("线上版不能读取你电脑里的产品图文件夹。请在本地工作台使用文件夹路径，或后续接 Supabase/网盘上传。");
  }
  if (method === "POST" && pathname === "/api/models/list") return listModels(body);
  if (method === "POST" && pathname === "/api/hotspots/import") return importHotspots(body);
  if (method === "POST" && pathname === "/api/xhs/hotspots") throw new Error("线上版不运行 xhs CLI。请在本地运行后，把 JSON 或文本粘贴到第 2 步导入。");
  if (method === "POST" && pathname === "/api/notes/generate") return makeNotes(body, "full");
  if (method === "POST" && pathname === "/api/notes/generate-topics") return makeNotes(body, "topic");
  if (method === "POST" && pathname === "/api/notes/generate-copy") return makeCopyForNote(body);
  if (method === "POST" && pathname === "/api/notes/status") return updateNoteStatus(body);
  if (method === "POST" && pathname === "/api/notes/update") return updateNote(body);
  if (method === "POST" && pathname === "/api/history/delete") return deleteHistory(body);
  if (method === "POST" && pathname === "/api/covers/generate") return generateCover(body);
  throw new Error(`未支持的接口：${method} ${pathname}`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(data));
}

function createHandler(pathname) {
  return async function handler(req, res) {
    if (req.method === "OPTIONS") return send(res, 204, {});
    try {
      const body = req.method === "GET" ? {} : await readBody(req);
      const data = await route(pathname, req.method, body);
      return send(res, 200, data);
    } catch (error) {
      return send(res, 500, { error: error.message || String(error) });
    }
  };
}

function createDynamicHandler() {
  return async function handler(req, res) {
    if (req.method === "OPTIONS") return send(res, 204, {});
    try {
      const url = new URL(req.url, "https://vercel.local");
      const body = req.method === "GET" ? {} : await readBody(req);
      const data = await route(url.pathname, req.method, body);
      return send(res, 200, data);
    } catch (error) {
      return send(res, 500, { error: error.message || String(error) });
    }
  };
}

module.exports = { createHandler, createDynamicHandler };
