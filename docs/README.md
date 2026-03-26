# Coupang 广告数据智能分析工具 - GitHub Pages 版

> 上传 Coupang 广告后台导出的 xlsx 文件，在浏览器本地完成数据解析、分类、图表可视化，支持 AI 优化建议。

## 功能说明

| 功能 | 说明 |
|------|------|
| 本地解析 xlsx | 文件在浏览器内解析，完全不上传服务器，数据安全 |
| 数据分析 / 图表 | 关键词分类（高效/低效/无效）、可视化图表 |
| 非强相关词 | 自动筛查与广告商品不相关的关键词 |
| 否词清单 | 规则判定 + AI 建议 + 非强相关词 三类合并 |
| 导出 Excel | 本地生成含分析结果的 xlsx |
| AI 优化建议 | 支持 DeepSeek / 豆包，API Key 填入设置页即可使用 |

## 上传到 GitHub Pages 的文件结构

```
docs/
  index.html
  .nojekyll
  css/
    style.css
  js/
    xlsx.full.min.js   ← SheetJS（本地解析核心）
    engine.js          ← 分析引擎（parser + calculator + classifier）
    ai-frontend.js     ← 前端直调 DeepSeek / 豆包 AI API
    settings.js
    charts.js
    table.js
    exporter.js
    app.js
```

## GitHub Pages 部署步骤

1. 将仓库推送到 GitHub
2. 进入 Settings → Pages
3. Source 选择 `Deploy from a branch`，Branch 选 `main`，目录选 `/docs`
4. 保存后等 1-2 分钟，访问分配的 URL 即可

## AI 功能说明

API Key 存储在用户浏览器的 `localStorage` 中，不会发送到任何第三方服务器（仅直接发送到 DeepSeek / 豆包官方 API）。

---

> 本地运行版（含 Node.js 服务器）请使用 `start.bat` 启动，访问 http://localhost:8088
