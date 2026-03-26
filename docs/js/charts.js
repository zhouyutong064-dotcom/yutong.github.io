/**
 * charts.js v3 - ECharts 图表模块（明亮主题）
 * 新增：商品亏损分析柱状图、CPC 图表
 */
(function() {
  'use strict';

  // 明亮主题（升级版）
  const THEME = {
    bg:       'transparent',
    text:     '#64748B',
    textDark: '#1E293B',
    border:   '#E2E8F0',
    colors:   ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#14B8A6'],
    green:    '#10B981',
    yellow:   '#F59E0B',
    red:      '#EF4444',
    blue:     '#3B82F6',
    purple:   '#8B5CF6',
    gray:     '#94A3B8',
    // 渐变色生成
    barGradient: (color) => ({
      type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [
        { offset: 0, color },
        { offset: 1, color: color + '88' }
      ]
    })
  };

  let charts = {};

  function getOrInit(domId) {
    if (charts[domId]) {
      charts[domId].clear();
    } else {
      const dom = document.getElementById(domId);
      if (!dom) return null;
      charts[domId] = echarts.init(dom, null, { renderer: 'canvas' });
    }
    return charts[domId];
  }

  function baseOption() {
    return {
      backgroundColor: THEME.bg,
      textStyle: { color: THEME.text, fontFamily: 'Inter, PingFang SC, sans-serif', fontSize: 12 },
      tooltip: {
        backgroundColor: '#fff',
        borderColor: '#E2E8F0',
        borderWidth: 1,
        textStyle: { color: THEME.textDark, fontSize: 12 },
        shadowBlur: 8,
        shadowColor: 'rgba(0,0,0,0.1)'
      },
      legend: {
        textStyle: { color: THEME.text },
        inactiveColor: '#CBD5E1'
      }
    };
  }

  /**
   * Top 关键词性能柱状图
   */
  function renderLineChart(rows, metric = 'spend') {
    const chart = getOrInit('chart-line');
    if (!chart) return;

    const metricMap = {
      spend:  { label: '花费(₩)',   fmt: v => Math.round(v).toLocaleString('ko-KR') },
      clicks: { label: '点击数',    fmt: v => Math.round(v) },
      roas:   { label: 'ROAS(%)',  fmt: v => v?.toFixed(1) + '%' },
      cvr:    { label: '转化率(%)', fmt: v => v?.toFixed(2) + '%' },
      cpc:    { label: 'CPC(₩)',   fmt: v => Math.round(v).toLocaleString('ko-KR') }
    };

    const mCfg = metricMap[metric] || metricMap.spend;

    const topRows = rows
      .filter(r => r.keyword && (r[metric] || 0) > 0)
      .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
      .slice(0, 20);

    if (topRows.length === 0) {
      chart.setOption({ ...baseOption(), title: { text: '暂无数据', textStyle: { color: THEME.text, fontSize: 13 } } });
      return;
    }

    const categories = topRows.map(r => truncate(r.keyword, 12));
    const values     = topRows.map(r => r[metric] || 0);
    const colors     = topRows.map(r => {
      if (r.label === 'efficient')   return THEME.green;
      if (r.label === 'invalid')     return THEME.red;
      if (r.label === 'inefficient') return THEME.yellow;
      return THEME.blue;
    });

    chart.setOption({
      ...baseOption(),
      tooltip: {
        ...baseOption().tooltip,
        trigger: 'axis',
        formatter: params => {
          const p = params[0];
          const row = topRows[p.dataIndex];
          return `<b>${row.keyword}</b><br/>
            ${mCfg.label}: <b>${mCfg.fmt(p.value)}</b><br/>
            分类: ${labelCN(row.label)}<br/>
            花费: ${Math.round(row.spend).toLocaleString('ko-KR')}₩`;
        }
      },
      grid: { top: 30, right: 20, bottom: 80, left: 70 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: THEME.border } },
        axisLabel: { color: THEME.text, rotate: 35, fontSize: 11, interval: 0 }
      },
      yAxis: {
        type: 'value',
        name: mCfg.label,
        nameTextStyle: { color: THEME.text, fontSize: 11 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: THEME.border, type: 'dashed' } },
        axisLabel: {
          color: THEME.text, fontSize: 11,
          formatter: v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v
        }
      },
      series: [{
        type: 'bar',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: THEME.barGradient(colors[i]),
            borderRadius: [6, 6, 0, 0]
          }
        })),
        emphasis: {
          itemStyle: { shadowBlur: 14, shadowColor: 'rgba(59,130,246,0.35)', shadowOffsetY: -3 }
        },
        barMaxWidth: 44,
        showBackground: true,
        backgroundStyle: { color: 'rgba(0,0,0,0.03)', borderRadius: [6,6,0,0] }
      }]
    });
  }

  /**
   * 饼图：关键词分类占比
   */
  function renderLabelPie(summary) {
    const chart = getOrInit('chart-pie-label');
    if (!chart) return;

    const data = [
      { value: summary.efficient,   name: '高效词', itemStyle: { color: THEME.green } },
      { value: summary.inefficient, name: '低效词', itemStyle: { color: THEME.yellow } },
      { value: summary.invalid,     name: '无效词', itemStyle: { color: THEME.red } },
      { value: summary.meaningless, name: '无意义', itemStyle: { color: THEME.gray } },
    ].filter(d => (d.value || 0) > 0);

    if (data.length === 0) {
      chart.setOption({ ...baseOption(), title: { text: '暂无数据', textStyle: { color: THEME.text } } });
      return;
    }

    chart.setOption({
      ...baseOption(),
      tooltip: {
        ...baseOption().tooltip,
        trigger: 'item',
        formatter: '{b}: {c} 个 ({d}%)'
      },
      legend: {
        ...baseOption().legend,
        orient: 'vertical',
        right: '5%',
        top: 'center',
        itemWidth: 10,
        itemHeight: 10,
        borderRadius: 5
      },
      series: [{
        type: 'pie',
        radius: ['44%', '70%'],
        center: ['40%', '50%'],
        data,
        label: {
          color: THEME.textDark,
          fontSize: 12,
          formatter: '{b}\n{d}%'
        },
        labelLine: { length: 12, length2: 8, smooth: true },
        emphasis: {
          scaleSize: 6,
          itemStyle: { shadowBlur: 18, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.18)' }
        },
        animationType: 'scale',
        animationEasing: 'elasticOut',
        animationDelay: i => i * 80
      }]
    });
  }

  /**
   * 饼图：广告花费 vs 销售额
   */
  function renderOrderPie(summary) {
    const chart = getOrInit('chart-pie-order');
    if (!chart) return;

    const adSpend  = summary.totalSpend  || 0;
    const salesAmt = summary.totalSalesAmt || 0;
    const netProfit = Math.max(0, salesAmt - adSpend);

    const data = [
      { value: adSpend,   name: '广告花费',   itemStyle: { color: THEME.red } },
      { value: netProfit, name: '广告销售净收益', itemStyle: { color: THEME.green } }
    ].filter(d => d.value > 0);

    if (data.length === 0) {
      chart.setOption({ ...baseOption(), title: { text: '暂无数据', textStyle: { color: THEME.text } } });
      return;
    }

    chart.setOption({
      ...baseOption(),
      tooltip: {
        ...baseOption().tooltip,
        trigger: 'item',
        formatter: p => `${p.name}: ${p.value.toLocaleString('ko-KR')}₩ (${p.percent}%)`
      },
      legend: {
        ...baseOption().legend,
        orient: 'vertical',
        right: '5%',
        top: 'center',
        itemWidth: 10,
        itemHeight: 10
      },
      series: [{
        type: 'pie',
        radius: ['44%', '70%'],
        center: ['40%', '50%'],
        data,
        label: { color: THEME.textDark, fontSize: 12 },
        emphasis: { itemStyle: { shadowBlur: 14, shadowColor: 'rgba(0,0,0,0.15)' } }
      }]
    });
  }

  /**
   * 广告类型对比柱状图
   */
  function renderAdTypeBar(adTypeStats) {
    const chart = getOrInit('chart-bar-adtype');
    if (!chart) return;

    if (!adTypeStats || adTypeStats.length === 0) {
      chart.setOption({ ...baseOption(), title: { text: '暂无广告类型数据', textStyle: { color: THEME.text } } });
      return;
    }

    const types  = adTypeStats.map(d => truncate(d.type, 14));
    const spends = adTypeStats.map(d => d.spend || 0);
    const orders = adTypeStats.map(d => d.orders || 0);
    const clicks = adTypeStats.map(d => d.clicks || 0);

    chart.setOption({
      ...baseOption(),
      tooltip: {
        ...baseOption().tooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' }
      },
      legend: { ...baseOption().legend, top: 0, data: ['花费(₩)', '订单数', '点击数'] },
      grid: { top: 50, right: 20, bottom: 60, left: 80 },
      xAxis: {
        type: 'category',
        data: types,
        axisLine: { lineStyle: { color: THEME.border } },
        axisLabel: { color: THEME.text, rotate: 15, fontSize: 11, interval: 0 }
      },
      yAxis: [
        {
          type: 'value', name: '花费(₩)',
          nameTextStyle: { color: THEME.text, fontSize: 11 },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: THEME.border, type: 'dashed' } },
          axisLabel: {
            color: THEME.text, fontSize: 11,
            formatter: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v
          }
        },
        {
          type: 'value', name: '数量',
          nameTextStyle: { color: THEME.text, fontSize: 11 },
          axisLine: { show: false },
          splitLine: { show: false },
          axisLabel: { color: THEME.text, fontSize: 11 }
        }
      ],
      series: [
        { name: '花费(₩)', type: 'bar', yAxisIndex: 0, data: spends, itemStyle: { color: THEME.barGradient(THEME.blue), borderRadius: [6,6,0,0] }, barMaxWidth: 50 },
        { name: '订单数',  type: 'bar', yAxisIndex: 1, data: orders, itemStyle: { color: THEME.barGradient(THEME.green), borderRadius: [6,6,0,0] }, barMaxWidth: 50 },
        { name: '点击数',  type: 'line', yAxisIndex: 1, data: clicks, smooth: true, lineStyle: { color: THEME.yellow, width: 2.5 }, itemStyle: { color: THEME.yellow }, symbol: 'circle', symbolSize: 7, areaStyle: { color: { type: 'linear', x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'rgba(245,158,11,0.18)'},{offset:1,color:'rgba(245,158,11,0)'}] } } }
      ]
    });
  }

  /**
   * 商品亏损分析柱状图（新增）
   */
  function renderLosingBar(losingProducts) {
    const chart = getOrInit('chart-bar-losing');
    if (!chart) return;

    if (!losingProducts || losingProducts.length === 0) {
      chart.setOption({ ...baseOption(), title: { text: '无商品广告数据', textStyle: { color: THEME.text } } });
      return;
    }

    // 取 Top 15 按花费排序
    const top = [...losingProducts].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 15);
    const names  = top.map(p => truncate(p.productName, 10));
    const spends = top.map(p => p.totalSpend);
    const sales  = top.map(p => p.totalSalesAmt);

    chart.setOption({
      ...baseOption(),
      tooltip: {
        ...baseOption().tooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          const p = top[params[0].dataIndex];
          const acos = p.acos != null ? p.acos.toFixed(1) + '%' : 'N/A';
          const isLosing = p.isLosing ? ' ⚠️ 亏损' : ' ✅ 盈利';
          return `<b>${p.productName}</b>${isLosing}<br/>
            花费: <b>${p.totalSpend.toLocaleString('ko-KR')}₩</b><br/>
            销售额: <b>${p.totalSalesAmt.toLocaleString('ko-KR')}₩</b><br/>
            ROAS: <b>${p.roas}%</b><br/>
            ACoS: <b>${acos}</b><br/>
            CTR: <b>${p.ctr != null ? p.ctr.toFixed(3) : '–'}%</b><br/>
            CVR: <b>${p.cvr != null ? p.cvr.toFixed(2) : '–'}%</b>`;
        }
      },
      legend: { ...baseOption().legend, top: 0, data: ['广告花费', '广告销售额'] },
      grid: { top: 50, right: 20, bottom: 90, left: 80 },
      xAxis: {
        type: 'category',
        data: names,
        axisLine: { lineStyle: { color: THEME.border } },
        axisLabel: { color: THEME.text, rotate: 35, fontSize: 11, interval: 0 }
      },
      yAxis: {
        type: 'value',
        name: '金额(₩)',
        nameTextStyle: { color: THEME.text, fontSize: 11 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: THEME.border, type: 'dashed' } },
        axisLabel: {
          color: THEME.text, fontSize: 11,
          formatter: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v
        }
      },
      series: [
        {
          name: '广告花费',
          type: 'bar',
          data: spends.map((v, i) => ({
            value: v,
            itemStyle: { color: top[i].isLosing ? THEME.red : THEME.blue, borderRadius: [4,4,0,0] }
          })),
          barMaxWidth: 40
        },
        {
          name: '广告销售额',
          type: 'bar',
          data: sales.map(v => ({
            value: v,
            itemStyle: { color: THEME.green, borderRadius: [4,4,0,0] }
          })),
          barMaxWidth: 40
        }
      ]
    });
  }

  // ---- 统一渲染所有图表 ----
  function renderAll(data) {
    if (!data) return;
    const currentMetric = document.querySelector('.chart-btn.active')?.dataset.metric || 'spend';
    renderLineChart(data.rows || [], currentMetric);
    renderLabelPie(data.summary || {});
    renderOrderPie(data.summary || {});
    renderAdTypeBar(data.adTypeStats || []);
    renderLosingBar(data.losingProducts || []);
  }

  function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
  }

  function labelCN(label) {
    const m = { efficient: '高效词', inefficient: '低效词', invalid: '无效词', meaningless: '无意义' };
    return m[label] || label;
  }

  window.addEventListener('resize', () => {
    Object.values(charts).forEach(c => c.resize());
  });

  window.Charts = { renderAll, renderLineChart, renderLabelPie, renderOrderPie, renderAdTypeBar, renderLosingBar };

})();
