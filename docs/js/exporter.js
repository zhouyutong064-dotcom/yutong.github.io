/**
 * exporter.js - Excel 导出模块
 * 使用 SheetJS 生成多 Sheet 分析报告
 */
(function() {
  'use strict';

  const LABEL_MAP = {
    efficient:   '高效词',
    inefficient: '低效词',
    invalid:     '无效词',
    meaningless: '无意义'
  };

  const ACTION_MAP = {
    increase: '↑ 加价',
    decrease: '↓ 降价',
    delete:   '× 删除',
    maintain: '– 保持'
  };

  /**
   * 导出完整分析结果
   */
  function exportAll(data, aiSuggestions = {}, fileName = 'report') {
    try {
      window.showToast('正在生成 Excel...', 'info');

      const wb = XLSX.utils.book_new();

      // Sheet 1：完整分析数据
      const sheet1 = buildFullSheet(data.rows, aiSuggestions);
      XLSX.utils.book_append_sheet(wb, sheet1, '完整分析');

      // Sheet 2：高效词清单
      const efficientRows = data.rows.filter(r => r.label === 'efficient');
      const sheet2 = buildSummarySheet(efficientRows, '高效词');
      XLSX.utils.book_append_sheet(wb, sheet2, '高效词清单');

      // Sheet 3：否词清单
      const sheet3 = buildNegativeSheet(data.negativeList || []);
      XLSX.utils.book_append_sheet(wb, sheet3, '否词清单');

      // Sheet 4：广告类型汇总
      const sheet4 = buildAdTypeSheet(data.adTypeStats || []);
      XLSX.utils.book_append_sheet(wb, sheet4, '广告类型汇总');

      // Sheet 5：整体数据概览
      const sheet5 = buildSummaryOverview(data.summary);
      XLSX.utils.book_append_sheet(wb, sheet5, '数据概览');

      // 生成文件名
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const outName = `Coupang广告分析_${date}.xlsx`;

      XLSX.writeFile(wb, outName);
      window.showToast(`导出成功：${outName}`, 'success');

    } catch (err) {
      console.error('Export error:', err);
      window.showToast('导出失败：' + err.message, 'error');
    }
  }

  function buildFullSheet(rows, aiSuggestions) {
    const headers = [
      '关键词', '广告活动', '广告组', '广告类型',
      '曝光次数', '点击次数', '广告花费(₩)', 'CTR(%)', 'CVR(%)', 'CPC(₩)',
      '订单数(14天)', '销售额(14天,₩)', 'ROAS(%)', 'ACoS(%)',
      '分类', 'AI建议', 'AI建议原因', '分类原因'
    ];

    const dataRows = rows.map(r => {
      const ai = aiSuggestions[r.keyword] || null;
      return [
        r.keyword || '',
        r.campaignName || '',
        r.adGroup || '',
        r.adType || '',
        r.impressions || 0,
        r.clicks || 0,
        r.spend || 0,
        fmt(r.ctrCalc, 4),
        fmt(r.cvr, 4),
        fmt(r.cpc, 0),
        r.orders14d || 0,
        r.salesAmt14d || 0,
        fmt(r.roas, 2),
        r.acos !== null ? fmt(r.acos, 2) : '',
        LABEL_MAP[r.label] || r.label || '',
        ai ? ACTION_MAP[ai.actionCode] || ai.action : '',
        ai ? ai.reason || '' : '',
        (r.reasons || []).join('; ')
      ];
    });

    return XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  }

  function buildSummarySheet(rows, title) {
    const headers = [
      '关键词', '花费(₩)', '点击', '订单(14天)', 'CTR(%)', 'CVR(%)', 'ROAS(%)', 'ACoS(%)'
    ];
    const dataRows = rows.map(r => [
      r.keyword || '',
      r.spend || 0,
      r.clicks || 0,
      r.orders14d || 0,
      fmt(r.ctrCalc, 4),
      fmt(r.cvr, 4),
      fmt(r.roas, 2),
      r.acos !== null ? fmt(r.acos, 2) : ''
    ]);
    return XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  }

  function buildNegativeSheet(negList) {
    const headers = ['否词（关键词）', '花费(₩)', '点击次数', '14天订单', '原因'];
    const dataRows = negList.map(item => [
      item.keyword || '',
      item.spend || 0,
      item.clicks || 0,
      item.orders14d || 0,
      (item.reasons || []).join('; ')
    ]);
    return XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  }

  function buildAdTypeSheet(stats) {
    const headers = ['广告类型', '条目数', '花费(₩)', '订单数', '点击数', '曝光数'];
    const dataRows = stats.map(s => [
      s.type || '',
      s.count || 0,
      s.spend || 0,
      s.orders || 0,
      s.clicks || 0,
      s.impressions || 0
    ]);
    return XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  }

  function buildSummaryOverview(summary) {
    if (!summary) return XLSX.utils.aoa_to_sheet([['暂无数据']]);
    const data = [
      ['指标', '数值'],
      ['总条目数',   summary.total],
      ['高效词数',   summary.efficient],
      ['低效词数',   summary.inefficient],
      ['无效词数',   summary.invalid],
      ['无意义词数',  summary.meaningless],
      ['总花费(₩)',  summary.totalSpend],
      ['总点击数',   summary.totalClicks],
      ['总订单数',   summary.totalOrders],
      ['总销售额(₩)',summary.totalSalesAmt],
      ['整体ROAS(%)',summary.overallRoas],
      ['整体ACoS(%)',summary.overallAcos]
    ];
    return XLSX.utils.aoa_to_sheet(data);
  }

  function fmt(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '';
    return parseFloat(v.toFixed(dec));
  }

  window.Exporter = { export: exportAll };

})();
