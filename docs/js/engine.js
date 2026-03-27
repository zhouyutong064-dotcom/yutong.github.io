/**
 * engine.js - 前端本地解析引擎
 * 将 parser.js / calculator.js / classifier.js 的全部逻辑移植到浏览器端
 * 依赖：xlsx.full.min.js（SheetJS）
 */
(function(global) {
  'use strict';

  // =====================================================================
  //  PARSER - xlsx 解析
  // =====================================================================
  const FIELD_MAP = {
    bidType:       ['投标类型', '竞价类型', 'bid'],
    sellType:      ['销售方式', '销售'],
    adType:        ['广告类型', '优化'],
    campaignId:    ['广告活动ID', '活动ID'],
    campaignName:  ['广告活动名称', '活动名称', '活动名'],
    adGroup:       ['广告组'],
    productName:   ['广告商品名称', '商品名称', '商品名'],
    attributeId:   ['广告投放属性ID', '投放属性'],
    convProduct:   ['有广告转化销售的商品'],
    convAttrId:    ['广告转化销售的属性ID'],
    placement:     ['广告展示版面', '展示版面', '版面'],
    keyword:       ['关键词'],
    impressions:   ['曝光次数', '展示次数', '曝光'],
    clicks:        ['点击次数', '点击'],
    spend:         ['广告费', '花费', '费用'],
    ctr:           ['点击率', 'ctr'],
    orders1d:      ['总下单次数（1', '1天）总下单', '下单次数（1'],
    directOrders1d:['直接下单次数（1', '直接下单（1'],
    indirectOrders1d:['间接下单次数（1', '间接下单（1'],
    sales1d:       ['总销量（1', '销量（1'],
    salesAmt1d:    ['总转化销售额（1', '转化销售额（1'],
    orders14d:     ['总下单次数（14', '14天）总下单', '下单次数（14'],
    directOrders14d:['直接下单次数（14', '直接下单（14'],
    indirectOrders14d:['间接下单次数（14', '间接下单（14'],
    sales14d:      ['总销量（14', '销量（14'],
    salesAmt14d:   ['总转化销售额（14', '转化销售额（14'],
    roas1d:        ['总广告支出回报率（1', 'ROAS（1', 'roas（1'],
    directRoas1d:  ['直接广告收支回报率（1', '直接广告支出回报率（1'],
    roas14d:       ['总广告支出回报率（14', 'ROAS（14', 'roas（14'],
    directRoas14d: ['直接广告收支回报率（14', '直接广告支出回报率（14'],
    startDate:     ['广告活动开始日', '开始日'],
    endDate:       ['广告活动结束', '结束'],
  };

  function buildKeyMapping(rawKeys) {
    const mapping = {};
    for (const [sysField, patterns] of Object.entries(FIELD_MAP)) {
      for (const pattern of patterns) {
        const matched = rawKeys.find(k => k.includes(pattern));
        if (matched && !mapping[matched]) {
          mapping[matched] = sysField;
          break;
        }
      }
    }
    const reverse = {};
    for (const [raw, sys] of Object.entries(mapping)) {
      reverse[sys] = raw;
    }
    return { rawToSys: mapping, sysToRaw: reverse };
  }

  function normalizeRow(raw, keyMapping, idx) {
    const row = { _rowIndex: idx };
    for (const [rawKey, sysField] of Object.entries(keyMapping.rawToSys)) {
      let val = raw[rawKey];
      if (['impressions','clicks','spend','orders1d','orders14d',
           'sales1d','sales14d','salesAmt1d','salesAmt14d',
           'directOrders1d','directOrders14d'].includes(sysField)) {
        val = parseFloat(val) || 0;
      } else if (['ctr','roas1d','roas14d','directRoas1d','directRoas14d'].includes(sysField)) {
        val = parseFloat(val) || 0;
      }
      row[sysField] = val;
    }
    // 关键词空格清理
    if (row.keyword && typeof row.keyword === 'string') {
      row.keyword = row.keyword.replace(/[\s\u3000\u200B\u200C\u200D\uFEFF]/g, '');
    }
    // 默认值
    const defaults = {
      keyword: null, impressions: 0, clicks: 0, spend: 0,
      ctr: 0, orders1d: 0, orders14d: 0, salesAmt1d: 0, salesAmt14d: 0,
      roas1d: 0, roas14d: 0, adType: '', campaignName: '', adGroup: ''
    };
    for (const [k, v] of Object.entries(defaults)) {
      if (row[k] === undefined || row[k] === null) row[k] = v;
    }
    return row;
  }

  /**
   * 解析 ArrayBuffer（浏览器 FileReader 读出来的）
   */
  function parseXlsxBuffer(arrayBuffer) {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS 未加载');
    let workbook;
    try {
      const data = new Uint8Array(arrayBuffer);
      workbook = XLSX.read(data, { type: 'array' });
    } catch(e) {
      throw new Error('无法读取文件，请确认是有效的 xlsx/xls 文件（' + e.message + '）');
    }
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('文件中未找到任何工作表');
    }
    // 选数据最多的 Sheet
    let bestData = [], bestName = '';
    for (const sn of workbook.SheetNames) {
      try {
        const ws = workbook.Sheets[sn];
        if (!ws) continue;
        const data = XLSX.utils.sheet_to_json(ws, { defval: null });
        if (data && data.length > bestData.length) {
          bestData = data;
          bestName = sn;
        }
      } catch(e) { /* 跳过解析失败的 sheet */ }
    }
    if (!bestData || bestData.length === 0) {
      throw new Error('文件所有工作表均为空，无法解析');
    }
    // 过滤全空行
    const rawData = bestData.filter(row =>
      Object.values(row).some(v => v !== null && v !== undefined && v !== '')
    );
    if (rawData.length === 0) {
      throw new Error('文件内容全部为空行，请检查导出是否正确');
    }
    const rawKeys = Object.keys(rawData[0]);
    // 关键列校验
    const hasCampaign = rawKeys.some(k => k.includes('广告活动') || k.includes('活动名'));
    const hasSpend    = rawKeys.some(k => k.includes('广告费') || k.includes('花费') || k.includes('费用'));
    if (!hasCampaign && !hasSpend) {
      throw new Error(`文件列名不匹配（识别到 ${rawKeys.length} 列），请确认是 Coupang 广告报告导出文件。列名示例：${rawKeys.slice(0,5).join('、')}`);
    }
    const keyMapping = buildKeyMapping(rawKeys);
    const rows = rawData.map((raw, idx) => normalizeRow(raw, keyMapping, idx));
    return { rows, totalRows: rows.length, sheetName: bestName, rawKeys };
  }

  // =====================================================================
  //  关键词去重合并：去空格后相同词（同活动+广告组维度）数据累加
  //  数值字段求和，文本字段保留第一条，_rowIndex 保留最小值
  // =====================================================================
  const NUMERIC_FIELDS = [
    'impressions','clicks','spend',
    'orders1d','orders14d','salesAmt1d','salesAmt14d',
    'sales1d','sales14d',
    'directOrders1d','directOrders14d',
    'ctr','roas1d','roas14d','directRoas1d','directRoas14d'
  ];

  function mergeByKeyword(rows) {
    // 合并键：广告活动 + 广告组 + 关键词（去空格后已一致）
    const map = new Map();
    const order = []; // 保持原始行顺序

    rows.forEach(row => {
      const key = [
        row.campaignId   || row.campaignName || '',
        row.adGroup      || '',
        row.keyword      || ''
      ].join('\x00'); // 用不可见字符分隔，避免拼接歧义

      if (!map.has(key)) {
        // 第一次见到这个词：深拷贝整行作为基础
        map.set(key, { ...row });
        order.push(key);
      } else {
        // 已存在：只累加数值字段，文本字段保持不变
        const existing = map.get(key);
        NUMERIC_FIELDS.forEach(f => {
          if (typeof row[f] === 'number') {
            existing[f] = (existing[f] || 0) + row[f];
          }
        });
        // _rowIndex 取最小，方便调试溯源
        if (row._rowIndex < existing._rowIndex) existing._rowIndex = row._rowIndex;
      }
    });

    return order.map(key => map.get(key));
  }

  function groupByCampaign(rows) {
    const campaigns = {};
    rows.forEach(row => {
      const id   = row.campaignId   || 'unknown';
      const name = row.campaignName || id;
      if (!campaigns[id]) campaigns[id] = { id, name, rows: [] };
      campaigns[id].rows.push(row);
    });
    return Object.values(campaigns);
  }

  // =====================================================================
  //  CALCULATOR - 衍生指标计算
  // =====================================================================
  function calcMetrics(row) {
    const { clicks, spend, orders14d, salesAmt14d, roas14d, roas1d, impressions } = row;
    const ctrCalc = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc     = clicks > 0 ? spend / clicks : 0;
    const cvr     = clicks > 0 ? (orders14d / clicks) * 100 : 0;
    const acos    = salesAmt14d > 0 ? (spend / salesAmt14d) * 100 : null;
    const roasValue = roas14d > 0 ? roas14d : roas1d;
    const profitEst = salesAmt14d - spend;
    return {
      ...row,
      ctrCalc:   round(ctrCalc, 4),
      cpc:       round(cpc, 1),
      cvr:       round(cvr, 4),
      acos:      acos !== null ? round(acos, 2) : null,
      roas:      round(roasValue, 2),
      profitEst: round(profitEst, 0),
    };
  }

  function calcAll(rows) { return rows.map(calcMetrics); }

  function round(val, decimals) {
    if (val === null || val === undefined || isNaN(val)) return null;
    return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  // =====================================================================
  //  CLASSIFIER - 分类规则引擎
  // =====================================================================
  const DEFAULT_THRESHOLDS = {
    invalidCpcNoConv:     500,
    invalidSpendNoClick2: 500,
    invalidSpendNoOrder:  1000,
    invalidClickNoConv:   10,
    anomalyMinImpressions: 100,
    efficientRoas:        500,
    efficientCtr:         0.3,
    efficientCvr:         3,
    efficientMinOrders:   1,
    pendingMinImpressions: 50,
    pendingMinClicks:      3,
    losingSpendRatio:     1.0,
  };

  function classify(row, thresholds = {}) {
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const { clicks, spend, orders14d, cvr, roas, ctrCalc, cpc, impressions, salesAmt14d, salesAmt1d } = row;
    const reasons = [];

    // 无意义词
    if (clicks === 0 && spend === 0 && (impressions || 0) === 0 && orders14d === 0) {
      return { label:'meaningless', reasons:['完全无数据'], suggestion:'observe', pendingReason:null, pendingScore:null, specialMark:'meaningless' };
    }

    let specialMark = null;
    if ((impressions || 0) >= t.anomalyMinImpressions && clicks === 0 && orders14d === 0) {
      specialMark = 'anomaly';
    }

    // 无效词规则
    if (clicks > 0 && cpc != null && cpc >= t.invalidCpcNoConv && (orders14d === 0 || cvr === 0)) {
      reasons.push(`单次点击花费 ${Math.round(cpc)}₩（≥${t.invalidCpcNoConv}₩）且转化率为 0`);
      return { label:'invalid', reasons, suggestion:'delete', pendingReason:null, specialMark };
    }
    if (spend >= t.invalidSpendNoClick2 && clicks <= 1) {
      reasons.push(`花费 ${spend}₩（≥${t.invalidSpendNoClick2}₩）但仅 ${clicks} 次点击`);
      return { label:'invalid', reasons, suggestion:'delete', pendingReason:null, specialMark };
    }
    if (spend >= t.invalidSpendNoOrder && (orders14d === 0 || cvr === 0)) {
      reasons.push(`花费 ${spend}₩（≥${t.invalidSpendNoOrder}₩）且转化率为 0`);
      return { label:'invalid', reasons, suggestion:'delete', pendingReason:null, specialMark };
    }
    if (clicks >= t.invalidClickNoConv && orders14d === 0) {
      reasons.push(`${clicks} 次点击无任何转化`);
      return { label:'invalid', reasons, suggestion:'delete', pendingReason:null, specialMark };
    }

    // 转化率100%异常
    if (clicks > 0 && orders14d >= clicks) {
      specialMark = 'perfect';
    }

    // 高效词
    let efficientScore = 0;
    const efficientReasons = [];
    if (roas > t.efficientRoas)            { efficientScore += 2; efficientReasons.push(`广告回报率 ${roas?.toFixed(0)}% 超阈值`); }
    if (cvr > t.efficientCvr)             { efficientScore += 2; efficientReasons.push(`转化率 ${cvr?.toFixed(2)}% 高`); }
    if (ctrCalc > t.efficientCtr)         { efficientScore += 1; efficientReasons.push(`点击率 ${ctrCalc?.toFixed(3)}% 优`); }
    if (orders14d >= t.efficientMinOrders) { efficientScore += 1; efficientReasons.push(`14天 ${orders14d} 单`); }
    if (efficientScore >= 3) {
      const suggestion = roas > 800 ? 'increase' : 'maintain';
      return { label:'efficient', reasons:efficientReasons, suggestion, pendingReason:null, specialMark };
    }

    // 低效词
    if (clicks > 0 && orders14d === 0) {
      const suggestion = ctrCalc > t.efficientCtr ? 'decrease' : 'delete';
      return { label:'inefficient', reasons:[`${clicks} 次点击、0 转化`], suggestion, pendingReason:null, specialMark };
    }
    if (orders14d > 0 && roas < 200) {
      return { label:'inefficient', reasons:[`广告回报率仅 ${roas?.toFixed(0)}%，广告效率低`], suggestion:'decrease', pendingReason:null, specialMark };
    }

    return { label:'meaningless', reasons:['数据量不足，无法评估'], suggestion:'observe', pendingReason:null, pendingScore:null, specialMark };
  }

  function classifyAll(rows, thresholds = {}) {
    return rows.map(row => ({ ...row, ...classify(row, thresholds) }));
  }

  function isSearchArea(row) {
    return !!(row.keyword && String(row.keyword).trim().length > 0);
  }

  function generateNegativeList(rows, aiSuggestions = {}) {
    const negSet = new Set();
    const result = [];
    rows.forEach(r => {
      if (!r.keyword) return;
      const aiSug = aiSuggestions[r.keyword];
      const isInvalid  = r.label === 'invalid';
      const isAiDelete = aiSug && (aiSug.actionCode === 'delete' || aiSug.actionCode === 'pause');
      if (isInvalid || isAiDelete) {
        if (!negSet.has(r.keyword)) {
          negSet.add(r.keyword);
          result.push({
            keyword:      r.keyword,
            spend:        r.spend,
            clicks:       r.clicks,
            orders14d:    r.orders14d,
            reasons:      r.reasons,
            campaignId:   r.campaignId || '',
            campaignName: r.campaignName || '',
            source:       isInvalid ? 'rule' : 'ai',
            aiReason:     aiSug?.reason || null
          });
        }
      }
    });
    return result;
  }

  function detectLosingProducts(rows, thresholds = {}) {
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const productMap = {};
    rows.forEach(row => {
      const name = row.productName || '未知商品';
      if (!productMap[name]) {
        productMap[name] = { productName:name, rows:[], totalSpend:0, totalSalesAmt:0, totalOrders:0, totalClicks:0, totalImpressions:0 };
      }
      const p = productMap[name];
      p.rows.push(row);
      p.totalSpend       += row.spend       || 0;
      p.totalSalesAmt    += (row.salesAmt14d || row.salesAmt1d || 0);
      p.totalOrders      += row.orders14d   || 0;
      p.totalClicks      += row.clicks      || 0;
      p.totalImpressions += row.impressions || 0;
    });
    return Object.values(productMap).map(p => {
      const roas    = p.totalSpend > 0 && p.totalSalesAmt > 0 ? (p.totalSalesAmt / p.totalSpend) * 100 : 0;
      const acos    = p.totalSalesAmt > 0 ? (p.totalSpend / p.totalSalesAmt) * 100 : null;
      const isLosing = p.totalSpend > 0 && (p.totalSalesAmt === 0 || (p.totalSalesAmt > 0 && p.totalSpend >= p.totalSalesAmt * t.losingSpendRatio));
      const ctr = p.totalImpressions > 0 ? (p.totalClicks / p.totalImpressions) * 100 : 0;
      const cvr = p.totalClicks > 0 ? (p.totalOrders / p.totalClicks) * 100 : 0;
      const cpc = p.totalClicks > 0 ? p.totalSpend / p.totalClicks : 0;
      return {
        productName:      p.productName,
        totalSpend:       Math.round(p.totalSpend),
        totalSalesAmt:    Math.round(p.totalSalesAmt),
        totalOrders:      p.totalOrders,
        totalClicks:      p.totalClicks,
        totalImpressions: p.totalImpressions,
        roas:             Math.round(roas * 10) / 10,
        acos:             acos !== null ? Math.round(acos * 10) / 10 : null,
        ctr:              Math.round(ctr * 1000) / 1000,
        cvr:              Math.round(cvr * 100) / 100,
        cpc:              Math.round(cpc),
        isLosing,
        lossAmount:       Math.round(p.totalSpend - p.totalSalesAmt),
        keywordCount:     p.rows.length
      };
    }).sort((a, b) => b.totalSpend - a.totalSpend);
  }

  function extractProductTokens(productName) {
    if (!productName) return [];
    const name = productName.toLowerCase();
    const stopWords = new Set(['the','and','for','with','from','that','this','not','are','was','has']);
    const enWords = (name.match(/[a-z0-9][a-z0-9\-]{1,}/g) || []).filter(w => !stopWords.has(w));
    const zhChars = name.replace(/[^\u4e00-\u9fa5]/g, '');
    const zhFrags = [];
    for (let len = 4; len >= 2; len--) {
      for (let i = 0; i <= zhChars.length - len; i++) zhFrags.push(zhChars.slice(i, i + len));
    }
    const koChars = name.replace(/[^\uAC00-\uD7AF\u1100-\u11FF]/g, '');
    const koFrags = [];
    for (let len = Math.min(4, koChars.length); len >= 2; len--) {
      for (let i = 0; i <= koChars.length - len; i++) koFrags.push(koChars.slice(i, i + len));
    }
    return [...new Set([...enWords, ...zhFrags, ...koFrags])].filter(t => t.length >= 2);
  }

  function detectIrrelevantKeywords(rows) {
    const campaigns = {};
    rows.forEach(row => {
      const cid = row.campaignId || 'default';
      if (!campaigns[cid]) campaigns[cid] = { name: row.campaignName, rows: [] };
      campaigns[cid].rows.push(row);
    });
    const result = [];
    Object.entries(campaigns).forEach(([cid, camp]) => {
      const productNames = [...new Set(camp.rows.map(r => r.productName).filter(Boolean))];
      if (productNames.length === 0) return;
      const productTokens = new Set();
      productNames.forEach(pn => extractProductTokens(pn).forEach(t => productTokens.add(t)));
      if (productTokens.size < 2) return;
      camp.rows.forEach(row => {
        if (!row.keyword) return;
        const kw = row.keyword.toLowerCase();
        const isRelevant = [...productTokens].some(token => kw.includes(token));
        if (!isRelevant) {
          result.push({
            keyword:      row.keyword,
            campaignId:   cid,
            campaignName: camp.name || cid,
            productNames: productNames.slice(0, 3),
            spend:        row.spend       || 0,
            clicks:       row.clicks      || 0,
            impressions:  row.impressions || 0,
            orders14d:    row.orders14d   || 0
          });
        }
      });
    });
    return result;
  }

  function getAdTypeStats(rows) {
    const stats = {};
    rows.forEach(r => {
      const type = r.adType || '未知';
      if (!stats[type]) stats[type] = { type, count:0, spend:0, orders:0, clicks:0, impressions:0 };
      stats[type].count++;
      stats[type].spend       += r.spend       || 0;
      stats[type].orders      += r.orders14d   || 0;
      stats[type].clicks      += r.clicks      || 0;
      stats[type].impressions += r.impressions || 0;
    });
    return Object.values(stats);
  }

  function getSummary(rows) {
    const summary = { efficient:0, inefficient:0, invalid:0, meaningless:0, anomaly:0, perfect:0, total:rows.length };
    rows.forEach(r => {
      if (r.label === 'efficient')   summary.efficient++;
      if (r.label === 'inefficient') summary.inefficient++;
      if (r.label === 'invalid')     summary.invalid++;
      if (r.label === 'meaningless') summary.meaningless++;
      if (r.specialMark === 'anomaly') summary.anomaly++;
      if (r.specialMark === 'perfect') summary.perfect++;
    });
    summary.totalSpend       = rows.reduce((s, r) => s + (r.spend       || 0), 0);
    summary.totalOrders      = rows.reduce((s, r) => s + (r.orders14d   || 0), 0);
    summary.totalClicks      = rows.reduce((s, r) => s + (r.clicks      || 0), 0);
    summary.totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
    summary.totalSalesAmt    = rows.reduce((s, r) => s + (r.salesAmt14d || 0), 0);

    const totalRoas = summary.totalSalesAmt > 0 ? (summary.totalSalesAmt / summary.totalSpend) * 100 : 0;
    summary.overallRoas = Math.round(totalRoas * 100) / 100;
    summary.overallAcos = summary.totalSalesAmt > 0 ? Math.round((summary.totalSpend / summary.totalSalesAmt) * 10000) / 100 : null;
    summary.overallCtr  = summary.totalImpressions > 0 ? Math.round((summary.totalClicks / summary.totalImpressions) * 10000) / 100 : 0;
    summary.overallCvr  = summary.totalClicks > 0 ? Math.round((summary.totalOrders / summary.totalClicks) * 10000) / 100 : 0;
    summary.overallCpc  = summary.totalClicks > 0 ? Math.round(summary.totalSpend / summary.totalClicks) : 0;

    const searchRows  = rows.filter(r => isSearchArea(r));
    const searchOrders = searchRows.reduce((s, r) => s + (r.orders14d || 0), 0);
    summary.searchAreaCount    = searchRows.length;
    summary.nonSearchAreaCount = rows.length - searchRows.length;
    summary.searchOrderRate    = summary.totalOrders > 0 ? Math.round((searchOrders / summary.totalOrders) * 10000) / 100 : 0;
    return summary;
  }

  // =====================================================================
  //  主入口：processFile(file, thresholds) → Promise<result>
  //  result 结构与服务端 /api/upload 完全一致
  // =====================================================================
  function processFile(file, thresholds = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const arrayBuffer = e.target.result;

          // 1. 解析 xlsx
          const parsed = parseXlsxBuffer(arrayBuffer);

          // 1.5 去空格后同词合并（避免去空格引入重复词）
          const mergedRows = mergeByKeyword(parsed.rows);
          const mergedParsed = { ...parsed, rows: mergedRows, totalRows: mergedRows.length };

          // 2. 计算衍生指标
          const withMetrics = calcAll(mergedParsed.rows);

          // 3. 注入搜索区域标记
          const withArea = withMetrics.map(row => ({
            ...row,
            isSearchArea: isSearchArea(row),
            keywordDisplay: isSearchArea(row) ? (row.keyword || '') : '非搜索区域'
          }));

          // 4. 分类标注
          const classified = classifyAll(withArea, thresholds);

          // 5. 亏损商品检测
          const losingProducts = detectLosingProducts(classified, thresholds);

          // 6. 非强相关词筛查
          const irrelevantKeywords = detectIrrelevantKeywords(classified);

          // 7. 按广告活动分组
          const rawCampaigns = groupByCampaign(classified);
          const campaigns = rawCampaigns.map(c => {
            const negList    = generateNegativeList(c.rows);
            const summary    = getSummary(c.rows);
            const campLosing = detectLosingProducts(c.rows, thresholds);
            const campIrrel  = detectIrrelevantKeywords(c.rows);
            const topKws     = c.rows.filter(r => r.isSearchArea).sort((a, b) => b.spend - a.spend).slice(0, 50);
            return {
              id:                 c.id,
              name:               c.name,
              totalRows:          c.rows.length,
              summary,
              rows:               c.rows,
              negativeList:       negList,
              topKeywords:        topKws,
              adTypeStats:        getAdTypeStats(c.rows),
              losingProducts:     campLosing,
              irrelevantKeywords: campIrrel
            };
          });

          // 8. 全局汇总
          const globalNegative = generateNegativeList(classified);
          const globalSummary  = getSummary(classified);
          const globalTopKws   = classified.filter(r => r.isSearchArea).sort((a, b) => b.spend - a.spend).slice(0, 80);

          resolve({
            success:            true,
            fileName:           file.name,
            totalRows:          mergedParsed.totalRows,
            summary:            globalSummary,
            rows:               classified,
            negativeList:       globalNegative,
            adTypeStats:        getAdTypeStats(classified),
            topKeywords:        globalTopKws,
            campaigns,
            losingProducts,
            irrelevantKeywords,
            thresholds:         { ...DEFAULT_THRESHOLDS, ...thresholds }
          });

        } catch(err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsArrayBuffer(file);
    });
  }

  // 暴露到全局
  global.AdEngine = { processFile, DEFAULT_THRESHOLDS };

})(window);
