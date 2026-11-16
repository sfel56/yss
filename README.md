# 影视搜 · 高清在线影视

聚合多源影视资源的搜索与在线播放网站，支持 m3u8 高清播放并自动去插播广告。界面采用深色影院风格，完整适配手机端与电脑端，可一键部署至 Cloudflare Pages。

## 功能

- 关键词搜索电影 / 电视剧 / 动漫 / 综艺
- 海报卡片网格展示，懒加载图片
- 影片详情：海报、年份、分类、简介、来源、选集
- HLS 在线播放（基于 [hls.js](https://github.com/video-dev/hls.js/)），自动去广告
- 选集切换、上一集/下一集
- 全响应式布局（手机 / 平板 / 桌面）

## 接口说明

数据来自第三方公开接口（仅供学习交流）：

| 用途 | 接口 |
|------|------|
| 影视搜索 | `https://apiv1.yrain.top/tv.php?q=关键词` |
| m3u8 去广告 | `https://apiv1.yrain.top/m3u8.php?url=m3u8链接` |

由于上述接口未开启 CORS，浏览器无法直连。本项目通过 Cloudflare Pages Functions 做同源代理：

- `/api/search?q=xxx` → 代理搜索接口
- `/api/play?url=xxx` → 调用去广告接口，取回清洗后的 m3u8，并将分片 URL 重写为 `/api/seg?url=...`
- `/api/seg?url=xxx` → 代理 TS 分片并附加 CORS 头

## 本地开发

```bash
npm install   # 无第三方依赖，仅用于脚本
npm run dev
# 打开 http://localhost:3000
```

`dev-server.js` 是零依赖的 Node 服务器，复刻了 Cloudflare Functions 的代理逻辑，可在本地完整运行搜索与播放。

## 部署到 Cloudflare Pages

1. 将本项目推送到 GitHub 仓库
2. 进入 Cloudflare Dashboard → Pages → 创建项目 → 连接仓库
3. 构建配置：
   - **构建命令**：留空（无需构建）
   - **输出目录**：`.`（项目根目录）
4. Cloudflare 会自动识别 `functions/` 目录并部署 Pages Functions
5. 部署完成后访问分配的 `*.pages.dev` 域名即可

> 也可使用 `npx wrangler pages deploy .` 命令行直接部署。

## 目录结构

```
.
├── index.html          # SPA 入口
├── css/style.css       # 主题样式（响应式）
├── js/app.js           # 路由 / 搜索 / 详情 / 播放器
├── functions/api/      # Cloudflare Pages Functions（生产代理）
│   ├── search.js
│   ├── play.js
│   └── seg.js
├── dev-server.js       # 本地开发服务器（代理 + 静态服务）
├── _headers            # Cloudflare 缓存/安全头
├── _redirects          # SPA 回退
└── package.json
```

## 声明

本项目仅用于学习与技术研究，不存储任何音视频内容，所有播放资源均来自第三方接口。使用前请确保符合当地法律法规，因使用本项目造成的任何后果与开发者无关。
