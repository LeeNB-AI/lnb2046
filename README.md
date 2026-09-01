# 小红书在线工作台

这是一个用于生成小红书草稿的在线 Web App。这里说的“工作台”，就是用户打开后看到的网页操作面板。前端部署到 Vercel，文案/封面生成走云端 API，商品档案、知识库、草稿箱和生成历史可保存到 Supabase。

## 使用方式

本地预览：

```bash
npm install
npm run dev:web
```

也可以使用一键启动脚本：

```text
macOS：双击 start-workbench.command
Windows：双击 start-workbench-windows.bat

如果新电脑还没有小红书 CLI，可以先运行安装助手：

macOS：双击 install-xhs-cli.command
Windows：双击 install-xhs-cli-windows.bat

安装助手会安装 uv、安装 xiaohongshu-cli、自动测试 xhs 状态；如果检测到未登录或测试失败，会自动进入 `xhs login --qrcode`，让用户扫码登录，然后启动本地助手服务。建议使用不常用的小红书账号进行测试。

线上网页不能静默安装电脑程序，所以第一次需要用户运行这个本地助手。助手启动后保持终端/PowerShell 窗口打开，线上工作台会通过 `http://127.0.0.1:4789` 连接它，然后右侧面板就可以测试登录、拉取热点并导入到第 2 步。
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

线上版不在服务器运行小红书 CLI，也不能直接控制用户电脑。第一次运行本地助手后，网页会连接用户电脑上的 `xhs`，可以在右侧面板里测试登录和拉取热点。没有运行本地助手时，也可以把 JSON/TXT 粘贴到第 2 步“选题素材库”导入。

## 知识库 AI 分类

第 3 步支持粘贴资料或规则后用文案模型自动分类到人群需求词、痛点词、场景词、卖点词、禁用词、标题模板、正文模板、评论模板和封面模板。没有配置文案 API Key 时，会回退到本地关键词规则分类。

## 产品图文件夹

本地模式可以在第 6 步填写产品图文件夹路径，系统会扫描 png、jpg、jpeg、webp 图片，并根据当前文案挑选更匹配的产品图参与封面生成提示词。线上 Vercel 不能直接读取你电脑里的文件夹，后续可以改成 Supabase Storage 或网盘上传。

Windows 路径示例：

```text
D:\素材\产品图
```

macOS 路径示例：

```text
/Users/你的名字/Pictures/产品图
```

## 换电脑继续编辑

可以在另一台电脑上通过 GitHub 仓库继续编辑。流程是 clone 仓库、安装 Node.js、运行 `npm install` 和 `npm run dev:web`。如果要在新电脑继续真实拉热点，需要那台电脑也安装并登录 xhs CLI；如果要本地生成封面，需要重新配置 API Key 或本地 imagegen 环境。

## 安全边界

- 不自动发布小红书笔记
- 不执行点赞、收藏、评论等账号写入操作
- API Key 优先放在 Vercel 环境变量
- 成人/两性健康内容默认只生成可人工审核的草稿
