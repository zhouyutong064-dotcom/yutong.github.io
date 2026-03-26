/**
 * ai-frontend.js - GitHub Pages 版前端直调 AI API
 * 直接从浏览器调用 DeepSeek / 豆包 API，不经过服务器
 * 仅用于 GitHub Pages 静态版本，原版本（本地 server.js）不受影响
 */
(function(global) {
  'use strict';

  const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
  const DEEPSEEK_MODEL   = 'deepseek-chat';
  const DOUBAO_API_URL   = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  const DOUBAO_MODEL     = 'doubao-pro-32k-241215';

  function labelCN(label) {
    const map = { efficient:'高效词', inefficient:'低效词', invalid:'无效词', meaningless:'无意义' };
    return map[label] || label;
  }

  function buildPrompt(keywords, summary, thresholds, campaignName, productName, campaigns) {
    // 按广告活动分组
    const campaignGroups = {};
    keywords.forEach(k => {
      const cid   = k.campaignId || k.campaignName || '默认活动';
      const cname = k.campaignName || k.campaignId || '默认活动';
      if (!campaignGroups[cid]) campaignGroups[cid] = { name: cname, keywords: [] };
      campaignGroups[cid].keywords.push(k);
    });

    let kwListStr = '';
    let kwIndex = 1;
    Object.entries(campaignGroups).forEach(([cid, group]) => {
      kwListStr += `\n【广告活动：${group.name}】\n`;
      group.keywords.forEach(k => {
        kwListStr += [
          `  ${kwIndex++}. 词：${k.keyword || '(空)'}`,
          `曝光:${k.impressions || 0}`,
          `点击:${k.clicks || 0}`,
          `花费:${k.spend || 0}₩`,
          `CTR:${k.ctrCalc != null ? k.ctrCalc.toFixed(3) : 'N/A'}%`,
          `CVR:${k.cvr != null ? k.cvr.toFixed(2) : 'N/A'}%`,
          `CPC:${k.cpc != null ? Math.round(k.cpc) : 'N/A'}₩`,
          `14天订单:${k.orders14d || 0}`,
          `14天销售额:${k.salesAmt14d || 0}₩`,
          `ROAS:${k.roas != null ? k.roas.toFixed(0) : 'N/A'}%`,
          `ACoS:${k.acos != null ? k.acos.toFixed(1) : 'N/A'}%`,
          `系统分类:${labelCN(k.label)}`
        ].join(' | ') + '\n';
      });
    });

    const overallInfo = summary ? [
      `总花费 ${Math.round(summary.totalSpend || 0)}₩`,
      `总订单(14天) ${summary.totalOrders || 0} 单`,
      `总销售额 ${Math.round(summary.totalSalesAmt || 0)}₩`,
      `整体ROAS ${summary.overallRoas || 0}%`,
      `整体ACoS ${summary.overallAcos ?? 'N/A'}%`,
      `整体CTR ${summary.overallCtr || 0}%`,
      `整体CVR ${summary.overallCvr || 0}%`,
      `整体CPC ${summary.overallCpc || 0}₩`
    ].join('，') : '';

    const productInfo = productName ? `主要广告商品：${productName}` : '';

    return `你是一位拥有 8 年以上经验的 Coupang 电商广告优化专家（深度熟悉韩国电商市场、Coupang 广告竞价机制）。
请以专业广告经理视角，对以下广告数据进行深度分析并给出可执行的优化方案。

${productInfo}
账户整体数据：${overallInfo}

关键词数据（按广告活动分组，货币单位：韩币₩）：
${kwListStr}

━━━━ 分析要求 ━━━━
1. 【广告活动维度分析】针对每个广告活动，从以下角度给出专业诊断：
   - 整体健康状况（优/良/差）和核心问题（1-2句精准描述）
   - 预算效率评估（花费是否在高ROI词上）
   - 关键词组合建议（哪类词需要加强/削减）

2. 【关键词操作建议】对每个关键词给出：
   - 加价（bid up）：高转化、高ROAS、CTR优秀，建议加价幅度 10%~50%
   - 降价（bid down）：有转化但ROAS低/ACoS高，建议降价幅度 10%~30%
   - 否词（add negative）：完全无效，浪费预算，说明建议否词类型（精准/词组）
   - 暂停（pause）：数据极差且持续恶化
   - 观察（observe）：数据量不足，建议观察天数
   - 保持（maintain）：表现稳定

3. 【整体账户诊断】包含：
   - 当前账户最大3个问题（严重程度排序）
   - 立即可执行的3个优化动作（优先级最高）
   - ROAS/ACoS 改善路径（具体可操作）
   - 预算分配优化建议（哪些活动/词值得加大）

请严格按以下 JSON 格式回复，不要有其他内容：
{
  "suggestions": [
    {
      "index": 1,
      "keyword": "词名",
      "campaignName": "所属广告活动名称",
      "action": "加价|降价|否词|暂停|观察|保持",
      "actionDetail": "具体建议",
      "reason": "专业理由（20-50字，需包含具体数据）",
      "urgency": "高|中|低"
    }
  ],
  "campaignAnalysis": [
    {
      "campaignName": "广告活动名称",
      "healthStatus": "优|良|差",
      "coreIssue": "核心问题（1-2句）",
      "budgetEfficiency": "预算效率评估（1句）",
      "keyRecommendation": "关键建议（1-2句）"
    }
  ],
  "overall": {
    "topIssues": ["问题1", "问题2", "问题3"],
    "immediateActions": ["动作1", "动作2", "动作3"],
    "roasImprovement": "ROAS改善路径",
    "budgetAdvice": "预算分配建议",
    "summary": "整体诊断总结（100字以内）"
  },
  "topPriority": ["最优先处理的3个关键词名称"]
}`;
  }

  function mapAction(action) {
    if (!action) return 'maintain';
    if (action.includes('加价') || action.includes('提价') || action.includes('up'))   return 'increase';
    if (action.includes('降价') || action.includes('减价') || action.includes('down')) return 'decrease';
    if (action.includes('否词') || action.includes('删除') || action.includes('删词')
        || action.includes('negative') || action.includes('否定'))                     return 'delete';
    if (action.includes('暂停') || action.includes('停止') || action.includes('pause')
        || action.includes('stop'))                                                     return 'pause';
    if (action.includes('观察') || action.includes('observe'))                         return 'observe';
    return 'maintain';
  }

  function parseAISuggestions(rawText, keywords) {
    try {
      let parsed;
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);

      const suggestions = {};
      if (parsed && parsed.suggestions) {
        parsed.suggestions.forEach(s => {
          const kw = s.keyword || (keywords[s.index - 1] && keywords[s.index - 1].keyword);
          if (kw) {
            suggestions[kw] = {
              action:       s.action || '保持',
              actionDetail: s.actionDetail || '',
              reason:       s.reason || '',
              urgency:      s.urgency || '低',
              campaignName: s.campaignName || '',
              actionCode:   mapAction(s.action)
            };
          }
        });
      }

      let overallData = parsed?.overall || '';
      if (typeof overallData !== 'object') {
        overallData = { summary: overallData, topIssues: [], immediateActions: [], roasImprovement: '', budgetAdvice: parsed?.budgetAdvice || '' };
      }

      return {
        keywordSuggestions: suggestions,
        overall:            overallData,
        campaignAnalysis:   parsed?.campaignAnalysis || [],
        topPriority:        parsed?.topPriority || [],
        budgetAdvice:       typeof overallData === 'object' ? overallData.budgetAdvice : (parsed?.budgetAdvice || ''),
        parseSuccess:       true
      };
    } catch(e) {
      return {
        keywordSuggestions: {},
        overall:            { summary: rawText.slice(0, 500) },
        campaignAnalysis:   [],
        topPriority:        [],
        budgetAdvice:       '',
        parseSuccess:       false
      };
    }
  }

  /**
   * 前端直调 DeepSeek API（浏览器 fetch）
   */
  async function callDeepSeek(apiKey, prompt) {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `DeepSeek API 错误 ${response.status}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * 前端直调豆包 API（浏览器 fetch）
   */
  async function callDoubao(apiKey, prompt) {
    const response = await fetch(DOUBAO_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DOUBAO_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 8000
      })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `豆包 API 错误 ${response.status}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * 主入口：前端直调 AI 分析
   * 参数与服务端 /api/ai/analyze 的 req.body 完全相同
   */
  async function analyzeAI({ model, apiKey, keywords, summary, thresholds }) {
    if (!apiKey) throw new Error('请先在"系统设置"中配置 API Key');
    if (!keywords || keywords.length === 0) throw new Error('无关键词数据');

    // 取前 40 条有花费的词（非无意义词）
    const sample = keywords
      .filter(k => k.keyword && k.label !== 'meaningless' && k.spend > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 40);

    const prompt = buildPrompt(sample, summary, thresholds);

    let rawResult;
    if (model === 'deepseek') {
      rawResult = await callDeepSeek(apiKey, prompt);
    } else if (model === 'doubao') {
      rawResult = await callDoubao(apiKey, prompt);
    } else {
      throw new Error('不支持的模型: ' + model);
    }

    const suggestions = parseAISuggestions(rawResult, sample);
    return { success: true, suggestions };
  }

  // 暴露到全局
  global.AIFrontend = { analyzeAI };

})(window);
