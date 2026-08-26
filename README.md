# 小红书在线工作台

这是一个用于生成小红书草稿的在线 Web App。前端部署到 Vercel，文案/封面生成走云端 API，商品档案、知识库、草稿箱和生成历史可保存到 Supabase。

## 使用方式

本地预览：

```bash
npm install
npm run dev:web
```

打开：

```text
http://127.0.0.1:4173
```

线上部署：

```bash
vercel deploy --prod
```

## 环境变量

线上建议在 Vercel 配置：

```text
TEXT_API_KEY
COVER_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

## 热点素材

线上版不在服务器运行小红书 CLI。先在本地运行 xhs CLI 获取热点，再把 JSON/TXT 粘贴到第 2 步“选题素材库”导入。

## 安全边界

- 不自动发布小红书笔记
- 不执行点赞、收藏、评论等账号写入操作
- API Key 优先放在 Vercel 环境变量
- 成人/两性健康内容默认只生成可人工审核的草稿
