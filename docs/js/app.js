/**
 * app.js v3 - 前端主逻辑
 * 新增：
 *  - 智能洞察视图（亏损商品 / 不相关词 / 待评估词评分）
 *  - 图表页按广告活动筛选
 *  - CTR/CVR/CPC 汇总卡片
 *  - 待评估词 pendingScore 显示
 *  - AI 建议优先级 / 预算建议展示
 */
(function() {
  'use strict';

  let G = {
    data: null,
    aiSuggestions: {},
    fileName: '',
    chartCampaignFilter: ''    // 图表页活动筛选
  };

  // ---- Toast ----
  window.showToast = function(msg, type = 'info', duration = 3200) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
  };

  // ---- 视图切换 ----
  function switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');

    const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navItem) navItem.classList.add('active');

    if (viewName === 'charts' && G.data) {
      setTimeout(() => renderChartsWithFilter(), 100);
    }
    if (viewName === 'insights' && G.data) {
      renderInsights(G.data);
    }
    if (viewName === 'ai-insight') {
      // 切换到AI视图时，如果还没分析过，显示引导
      const aiInsightResult = document.getElementById('aiInsightResult');
      const aiInsightEmpty  = document.getElementById('aiInsightEmpty');
      if (aiInsightResult && aiInsightResult.style.display === 'none') {
        if (aiInsightEmpty) aiInsightEmpty.style.display = 'block';
      }
    }
  }

  // ---- 状态 ----
  function setStatus(state, text) {
    const dot = document.getElementById('statusDot');
    const txt = document.getElementById('statusText');
    if (dot) dot.className = 'status-dot ' + state;
    if (txt) txt.textContent = text;
  }

  function setProgress(pct, text) {
    const bar = document.getElementById('progressBar');
    const txt = document.getElementById('progressText');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = text;
  }

  // ---- 数字格式化 ----
  function fmt(v, dec = 0) {
    if (v == null || isNaN(v)) return '–';
    return Number(v).toLocaleString('ko-KR', { maximumFractionDigits: dec });
  }

  function fmtK(v) {
    if (!v || isNaN(v)) return '0';
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return Math.round(v).toLocaleString('ko-KR');
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- 上传文件（前端本地解析，文件不经过网络） ----
  async function uploadFile(file) {
    if (!file) return;

    document.getElementById('dropZone').style.display = 'none';
    const prog = document.getElementById('uploadProgress');
    prog.style.display = 'block';
    document.getElementById('fileName').textContent = file.name;
    G.fileName = file.name;

    setStatus('loading', '解析中...');
    setProgress(10, '读取文件...');

    const thresholds = Settings.getThresholds();

    try {
      setProgress(30, '解析 xlsx 数据...');
      // 前端本地解析，不上传到服务器，速度极快
      const result = await AdEngine.processFile(file, thresholds);
      setProgress(90, '生成洞察报告...');
      G.data = result;

      // 渲染统计卡片
      renderStats(result.summary);
      document.getElementById('statsRow').style.display = 'grid';
      document.getElementById('actionRow').style.display = 'flex';
      document.body.classList.add('has-action-bar');

      // 显示上传成功条
      const successBar = document.getElementById('uploadSuccessBar');
      const usbFileName = document.getElementById('usbFileName');
      const usbMeta = document.getElementById('usbMeta');
      if (successBar) {
        if (usbFileName) usbFileName.textContent = file.name;
        const irrelCount2 = (result.irrelevantKeywords || []).length;
        const negCount2 = result.negativeList?.length || 0;
        if (usbMeta) usbMeta.textContent = `共 ${result.totalRows} 条数据 · ${irrelCount2} 个非强相关词 · ${negCount2} 个否词候选`;
        successBar.style.display = 'flex';
      }

      // 上传成功后隐藏 hero 和上传卡片，界面更简洁
      const uploadHero = document.getElementById('uploadHero');
      const uploadCard = document.getElementById('uploadCard');
      if (uploadHero) { uploadHero.style.transition = 'opacity 0.4s'; uploadHero.style.opacity = '0'; setTimeout(() => uploadHero.style.display = 'none', 420); }
      if (uploadCard) { uploadCard.style.transition = 'opacity 0.4s'; uploadCard.style.opacity = '0'; setTimeout(() => uploadCard.style.display = 'none', 420); }

      // 渲染广告活动分组
      renderCampaigns(result.campaigns || []);

      // 渲染表格
      Table.setData(result.rows, result.campaigns || []);

      // 填充图表/洞察筛选下拉
      fillCampaignDropdowns(result.campaigns || []);

      // 否词计数
      const negCount = result.negativeList?.length || 0;
      document.getElementById('negativeCount').textContent = negCount;
      document.getElementById('negativeCountTop').textContent = negCount;

      setProgress(100, '解析完成！');
      setStatus('ready', `已分析 ${result.totalRows} 条数据`);

      const losingCount = (result.losingProducts || []).filter(p => p.isLosing).length;
      const irrelCount = (result.irrelevantKeywords || []).length;

      let toastMsg = `✓ 成功解析 ${result.totalRows} 条数据`;
      if (losingCount > 0) toastMsg += `，发现 ${losingCount} 个亏损商品`;
      if (irrelCount > 0) toastMsg += `，${irrelCount} 个非强相关词`;
      showToast(toastMsg, 'success', 5000);

    } catch (err) {
      setProgress(0, '');
      setStatus('error', '解析失败');
      // 显示详细错误信息
      const errMsg = err.message || '未知错误';
      showToast('❌ 文件解析失败：' + errMsg, 'error', 8000);
      document.getElementById('dropZone').style.display = 'block';
      const prog2 = document.getElementById('uploadProgress');
      if (prog2) prog2.style.display = 'none';
    }
  }

  // ---- 填充广告活动下拉（图表 + 洞察）----
  function fillCampaignDropdowns(campaigns) {
    const selectors = ['#chartFilterCampaign', '#insightFilterCampaign', '#insightIrrelFilterCampaign'];
    selectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.innerHTML = '<option value="">全部活动</option>';
      campaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        el.appendChild(opt);
      });
    });
  }

  // ---- 渲染统计卡片 ----
  function renderStats(summary) {
    if (!summary) return;
    animateNumber('stat-total', summary.total, 0);
    animateNumber('stat-efficient', summary.efficient, 0);
    animateNumber('stat-invalid', summary.invalid, 0);
    animateNumber('stat-meaningless', summary.meaningless, 0);
    document.getElementById('stat-spend').textContent  = fmtK(summary.totalSpend) + '₩';
    document.getElementById('stat-roas').textContent   = fmt(summary.overallRoas, 1) + '%';
    document.getElementById('stat-orders').textContent = fmt(summary.totalOrders) + '单';
    document.getElementById('stat-ctr').textContent    = fmt(summary.overallCtr, 3) + '%';
    document.getElementById('stat-cvr').textContent    = fmt(summary.overallCvr, 2) + '%';
    document.getElementById('stat-cpc').textContent    = fmt(summary.overallCpc) + '₩';
    // 新增特殊标记统计
    const anomalyEl = document.getElementById('stat-anomaly');
    const searchEl  = document.getElementById('stat-search-rate');
    if (anomalyEl) anomalyEl.textContent = (summary.anomaly || 0) + ' 个';
    if (searchEl)  searchEl.textContent  = fmt(summary.searchOrderRate, 1) + '%';
  }

  function animateNumber(id, target, dec) {
    const el = document.getElementById(id);
    if (!el) return;
    const duration = 700, start = Date.now(), endVal = Number(target) || 0;
    function tick() {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(endVal * eased).toLocaleString('ko-KR');
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---- 渲染广告活动分组卡片 ----
  function renderCampaigns(campaigns) {
    const section = document.getElementById('campaignSection');
    const grid    = document.getElementById('campaignGrid');
    const badge   = document.getElementById('campaignCountBadge');

    if (!campaigns || campaigns.length <= 1) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    badge.textContent = `${campaigns.length} 个活动`;

    grid.innerHTML = campaigns.map((c, idx) => {
      const s = c.summary || {};
      const efficient    = s.efficient   || 0;
      const invalid      = s.invalid     || 0;
      const inefficient  = s.inefficient || 0;
      const meaningless  = s.meaningless || 0;
      const losingCount = (c.losingProducts || []).filter(p => p.isLosing).length;
      const irrelCount  = (c.irrelevantKeywords || []).length;

      return `
      <div class="campaign-card" data-campaign-idx="${idx}">
        <div class="campaign-card-header">
          <div class="campaign-name">${escHtml(c.name || c.id)}</div>
          <div class="campaign-row-count">${c.totalRows} 条</div>
        </div>
        <div class="campaign-mini-stats">
          <div class="campaign-mini-stat">
            <span class="mini-stat-label">总花费</span>
            <span class="mini-stat-value">${fmtK(s.totalSpend)}₩</span>
          </div>
          <div class="campaign-mini-stat">
            <span class="mini-stat-label">广告回报率</span>
            <span class="mini-stat-value">${fmt(s.overallRoas, 0)}%</span>
          </div>
          <div class="campaign-mini-stat">
            <span class="mini-stat-label">订单(14天)</span>
            <span class="mini-stat-value">${fmt(s.totalOrders)}</span>
          </div>
          <div class="campaign-mini-stat">
            <span class="mini-stat-label">点击率</span>
            <span class="mini-stat-value">${fmt(s.overallCtr, 3)}%</span>
          </div>
          <div class="campaign-mini-stat">
            <span class="mini-stat-label">转化率</span>
            <span class="mini-stat-value">${fmt(s.overallCvr, 2)}%</span>
          </div>
          <div class="campaign-mini-stat">
            <span class="mini-stat-label">搜索出单占比</span>
            <span class="mini-stat-value">${fmt(s.searchOrderRate, 1)}%</span>
          </div>
        </div>
        <div class="campaign-label-bars">
          ${efficient    > 0 ? `<span class="campaign-label-bar label-efficient">高效 ${efficient}</span>` : ''}
          ${invalid      > 0 ? `<span class="campaign-label-bar label-invalid">无效 ${invalid}</span>` : ''}
          ${inefficient  > 0 ? `<span class="campaign-label-bar label-inefficient">低效 ${inefficient}</span>` : ''}
          ${meaningless  > 0 ? `<span class="campaign-label-bar label-meaningless">无意义 ${meaningless}</span>` : ''}
          ${losingCount  > 0 ? `<span class="campaign-label-bar label-losing">亏损商品 ${losingCount}</span>` : ''}
          ${irrelCount   > 0 ? `<span class="campaign-label-bar label-irrelevant">非强相关词 ${irrelCount}</span>` : ''}
        </div>
        <div class="campaign-card-actions">
          <button class="campaign-view-btn" data-action="modal">查看明细</button>
          <button class="campaign-view-btn campaign-view-analysis-btn" data-action="analysis">数据分析 →</button>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.campaign-card').forEach(card => {
      // 点击"查看明细"
      card.querySelector('[data-action="modal"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(card.dataset.campaignIdx);
        openCampaignModal(campaigns[idx]);
      });
      // 点击"数据分析 →"：跳转到数据分析页并筛选该活动
      card.querySelector('[data-action="analysis"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(card.dataset.campaignIdx);
        const camp = campaigns[idx];
        switchView('analysis');
        // 延迟设置筛选，确保视图已渲染
        setTimeout(() => {
          const filterEl = document.getElementById('filterCampaign');
          if (filterEl) {
            filterEl.value = camp.id || camp.name || '';
            // 触发筛选
            filterEl.dispatchEvent(new Event('change'));
          }
        }, 80);
      });
    });
  }

  // ---- 广告活动详情弹窗 ----
  function openCampaignModal(campaign) {
    const modal = document.getElementById('campaignModal');
    const title = document.getElementById('campaignModalTitle');
    const stats = document.getElementById('campaignDetailStats');
    const tbody = document.getElementById('campaignDetailBody');

    title.textContent = campaign.name || campaign.id;

    const s = campaign.summary || {};
    stats.innerHTML = [
      { label: '总关键词',       value: campaign.totalRows || 0 },
      { label: '高效词',         value: s.efficient   || 0 },
      { label: '无效词',         value: s.invalid      || 0 },
      { label: '无意义',         value: s.meaningless  || 0 },
      { label: '总花费',         value: fmtK(s.totalSpend) + '₩' },
      { label: '广告回报率',     value: fmt(s.overallRoas, 1) + '%' },
      { label: '点击率',         value: fmt(s.overallCtr, 3) + '%' },
      { label: '转化率',         value: fmt(s.overallCvr, 2) + '%' },
      { label: '单次点击成本',   value: fmt(s.overallCpc) + '₩' },
      { label: '总订单(14天)',   value: fmt(s.totalOrders) + '单' },
      { label: '搜索出单占比',   value: fmt(s.searchOrderRate, 1) + '%' }
    ].map(item => `
      <div class="campaign-detail-stat">
        <span class="cds-label">${item.label}</span>
        <span class="cds-value">${item.value}</span>
      </div>
    `).join('');

    const rows = (campaign.rows || []).slice(0, 300);
    tbody.innerHTML = rows.length === 0
      ? '<tr><td colspan="11" class="empty-state">暂无数据</td></tr>'
      : rows.map(row => {
          const areaTag = row.isSearchArea
            ? '<span class="area-tag area-search">搜索</span>'
            : '<span class="area-tag area-nonsearch">非搜索</span>';
          const specialTag = renderSpecialMark(row.specialMark);
          return `<tr>
            <td class="keyword-cell">${escHtml(row.keyword || '非搜索区域')} ${areaTag}</td>
            <td class="num-cell">${fmt(row.impressions)}</td>
            <td class="num-cell">${fmt(row.clicks)}</td>
            <td class="num-cell ${row.spend > 0 ? 'highlight' : ''}">${fmt(row.spend)}</td>
            <td class="num-cell">${row.ctrCalc != null ? Number(row.ctrCalc).toFixed(3) + '%' : '–'}</td>
            <td class="num-cell">${row.cvr != null ? Number(row.cvr).toFixed(2) + '%' : '–'}</td>
            <td class="num-cell">${fmt(row.cpc)}</td>
            <td class="num-cell ${row.orders14d > 0 ? 'highlight' : ''}">${fmt(row.orders14d)}</td>
            <td class="num-cell">${row.roas != null ? Number(row.roas).toFixed(1) + '%' : '–'}</td>
            <td>${specialTag}</td>
            <td>${labelBadge(row.label)}</td>
          </tr>`;
        }).join('');

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeCampaignModal() {
    document.getElementById('campaignModal').style.display = 'none';
    document.body.style.overflow = '';
  }

  // ---- 统计卡片点击弹窗 ----
  function openStatDetail(filterLabel, title) {
    if (!G.data) return;
    const modal   = document.getElementById('statDetailModal');
    const titleEl = document.getElementById('statDetailTitle');
    const tbody   = document.getElementById('statDetailBody');

    titleEl.textContent = title;

    let rows = G.data.rows;
    if (filterLabel) rows = rows.filter(r => r.label === filterLabel);
    rows = rows.slice(0, 400);

    tbody.innerHTML = rows.length === 0
      ? '<tr><td colspan="10" class="empty-state">暂无数据</td></tr>'
      : rows.map(row => {
          const areaTag = row.isSearchArea
            ? '<span class="area-tag area-search">搜索</span>'
            : '<span class="area-tag area-nonsearch">非搜索</span>';
          const specialTag = renderSpecialMark(row.specialMark);
          return `<tr>
            <td class="keyword-cell">${escHtml(row.keyword || '非搜索区域')} ${areaTag}</td>
            <td class="campaign-cell">${escHtml(row.campaignName || '–')}</td>
            <td class="num-cell">${fmt(row.spend)}</td>
            <td class="num-cell">${fmt(row.clicks)}</td>
            <td class="num-cell">${row.ctrCalc != null ? Number(row.ctrCalc).toFixed(3) + '%' : '–'}</td>
            <td class="num-cell">${row.cvr != null ? Number(row.cvr).toFixed(2) + '%' : '–'}</td>
            <td class="num-cell ${row.orders14d > 0 ? 'highlight' : ''}">${fmt(row.orders14d)}</td>
            <td class="num-cell">${row.roas != null ? Number(row.roas).toFixed(1) + '%' : '–'}</td>
            <td>${specialTag}</td>
            <td>${labelBadge(row.label)}</td>
          </tr>`;
        }).join('');

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeStatDetail() {
    document.getElementById('statDetailModal').style.display = 'none';
    document.body.style.overflow = '';
  }

  // ---- 特殊标记渲染 ----
  function renderSpecialMark(mark) {
    if (!mark) return '–';
    const map = {
      anomaly:     '<span class="special-badge special-anomaly">⚠️ 异常</span>',
      perfect:     '<span class="special-badge special-perfect">🚨 转化异常</span>',
      meaningless: '<span class="special-badge special-meaningless">💤 无意义</span>'
    };
    return map[mark] || '–';
  }

  function labelBadge(label) {
    const map = {
      efficient:   ['高效词',  'efficient'],
      inefficient: ['低效词',  'inefficient'],
      invalid:     ['无效词',  'invalid'],
      meaningless: ['无意义',  'meaningless']
    };
    const [text, cls] = map[label] || ['无意义', 'meaningless'];
    return `<span class="label-badge label-${cls}">${text}</span>`;
  }

  // ============================================================
  //  非强相关词视图
  // ============================================================
  function renderInsights(data, campaignFilter) {
    if (!data) return;

    let irrelevantKeywords = data.irrelevantKeywords || [];

    // 广告活动筛选
    if (campaignFilter) {
      const camp = (data.campaigns || []).find(c => c.id === campaignFilter);
      if (camp) {
        irrelevantKeywords = camp.irrelevantKeywords || [];
      }
    }

    // 渲染非强相关词
    renderIrrelevantKeywords(irrelevantKeywords);
  }

  function renderLosingProducts(products) {
    const listEl   = document.getElementById('losingProductsList');
    const countEl  = document.getElementById('losingCount');
    const losing   = products.filter(p => p.isLosing);
    const breaking = products.filter(p => !p.isLosing);

    countEl.textContent = losing.length;

    if (products.length === 0) {
      listEl.innerHTML = '<p class="empty-state insight-empty">暂无商品广告数据</p>';
      return;
    }
    if (losing.length === 0) {
      listEl.innerHTML = '<p class="empty-state insight-empty good">✅ 恭喜！当前没有亏损的商品广告</p>';
      return;
    }

    listEl.innerHTML = losing.map(p => {
      const lossAmt = p.lossAmount || 0;
      return `
      <div class="insight-item losing-item">
        <div class="insight-item-header">
          <div class="insight-item-name">${escHtml(p.productName)}</div>
          <div class="insight-item-badges">
            <span class="kpi-badge kpi-loss">亏损 ${fmtK(lossAmt)}₩</span>
            <span class="kpi-badge kpi-roas">ROAS ${p.roas || 0}%</span>
          </div>
        </div>
        <div class="insight-item-metrics">
          <span>花费 <b>${fmtK(p.totalSpend)}₩</b></span>
          <span>销售额 <b>${fmtK(p.totalSalesAmt)}₩</b></span>
          <span>订单 <b>${p.totalOrders}</b></span>
          <span>点击 <b>${fmt(p.totalClicks)}</b></span>
          <span>点击率 <b>${p.ctr != null ? p.ctr.toFixed(3) : '–'}%</b></span>
          <span>转化率 <b>${p.cvr != null ? p.cvr.toFixed(2) : '–'}%</b></span>
          <span>点击成本 <b>${fmt(p.cpc)}₩</b></span>
          <span>广告费率 <b>${p.acos != null ? p.acos.toFixed(1) : '–'}%</b></span>
          <span class="kw-count">${p.keywordCount} 个关键词</span>
        </div>
        <div class="insight-suggestion">
          💡 建议：${generateLosingAdvice(p)}
        </div>
      </div>`;
    }).join('');
  }

  function generateLosingAdvice(p) {
    if (p.totalOrders === 0) {
      return `该商品广告 0 订单，建议立即暂停或大幅降低出价，排查商品定价/图片/详情页问题`;
    }
    if (p.acos > 200) {
      return `ACoS ${p.acos?.toFixed(0)}% 极高，建议降低出价 30-50%，或仅保留高 CVR 关键词`;
    }
    if (p.cpc > 500) {
      return `CPC ${Math.round(p.cpc)}₩ 偏高，竞争激烈，建议优先投放长尾词降低 CPC`;
    }
    if (p.cvr < 1) {
      return `CVR ${p.cvr?.toFixed(2)}% 偏低，可能是商品页面转化问题，建议优化主图/价格/评价`;
    }
    return `广告花费超过销售额，建议降价 20%，优化出价策略并否词无效流量`;
  }

  function renderIrrelevantKeywords(keywords) {
    const listEl  = document.getElementById('irrelevantKeywordsList');
    const countEl = document.getElementById('irrelevantCount');
    const copyBtn = document.getElementById('btnCopyIrrelevant');

    // 活动筛选
    const selectEl   = document.getElementById('insightIrrelFilterCampaign');
    const campFilter = selectEl?.value || '';
    let filtered = keywords;
    if (campFilter) {
      filtered = keywords.filter(k => k.campaignId === campFilter || k.campaignName === campFilter);
    }

    countEl.textContent = filtered.length;

    if (filtered.length === 0) {
      listEl.innerHTML = '<p class="empty-state insight-empty good">✅ 未发现明显不相关词</p>';
    if (copyBtn) copyBtn.style.display = 'none';
    const addNegBtn = document.getElementById('btnAddIrrelToNegative');
    if (addNegBtn) addNegBtn.style.display = 'none';
    return;
    }

    if (copyBtn) copyBtn.style.display = 'inline-flex';
    const addNegBtn2 = document.getElementById('btnAddIrrelToNegative');
    if (addNegBtn2) addNegBtn2.style.display = 'inline-flex';

    // 按花费排序
    const sorted = [...filtered].sort((a, b) => b.spend - a.spend);

    listEl.innerHTML = sorted.map(k => `
      <div class="insight-item irrelevant-item">
        <div class="insight-item-header">
          <div class="insight-item-name kw-text">${escHtml(k.keyword)}</div>
          <div class="insight-item-badges">
            ${k.spend > 0 ? `<span class="kpi-badge kpi-spend">花费 ${fmtK(k.spend)}₩</span>` : ''}
            <span class="kpi-badge kpi-campaign">${escHtml(k.campaignName || '–')}</span>
          </div>
        </div>
        <div class="insight-item-metrics">
          <span>曝光 <b>${fmt(k.impressions)}</b></span>
          <span>点击 <b>${fmt(k.clicks)}</b></span>
          <span>订单 <b>${k.orders14d}</b></span>
        </div>
        <div class="insight-irrelevant-products">
          关联商品：${(k.productNames || []).map(pn => `<span class="product-tag">${escHtml(pn)}</span>`).join('')}
        </div>
        <div class="insight-suggestion">
          💡 建议：此词与商品相关性低，建议添加为精准否词，避免无效曝光
        </div>
      </div>`).join('');
  }

  function suggestionText(suggestion) {
    const map = {
      increase: '📈 建议加价',
      decrease: '📉 建议降价',
      delete:   '🚫 建议否词',
      pause:    '⏸ 建议暂停',
      observe:  '👁 建议观察',
      maintain: '✅ 维持'
    };
    return map[suggestion] || '👁 建议观察';
  }

  // ---- AI 分析 ----
  async function runAIAnalysis() {
    if (!G.data) { showToast('请先上传报告文件', 'error'); return; }

    const model  = Settings.getSelectedModel();
    const apiKey = Settings.getApiKey(model);

    if (!apiKey) {
      showToast('请先在"系统设置"中配置 API Key', 'error');
      switchView('settings');
      return;
    }

    // 更新AI独立视图状态
    const aiInsightLoading = document.getElementById('aiInsightLoading');
    const aiInsightEmpty   = document.getElementById('aiInsightEmpty');
    const aiInsightResult  = document.getElementById('aiInsightResult');
    const aiBadgeLarge     = document.getElementById('aiInsightModelBadge');

    const modelLabel = model === 'deepseek' ? 'DeepSeek' : '豆包';

    if (aiInsightLoading) aiInsightLoading.style.display = 'flex';
    if (aiInsightEmpty)   aiInsightEmpty.style.display   = 'none';
    if (aiInsightResult)  aiInsightResult.style.display  = 'none';
    if (aiBadgeLarge)     aiBadgeLarge.textContent        = modelLabel;

    setStatus('loading', 'AI 分析中...');

    try {
      // GitHub Pages 版：前端直调 AI API（不经过服务器）
      const result = await AIFrontend.analyzeAI({
        model, apiKey,
        keywords:   G.data.topKeywords || G.data.rows,
        summary:    G.data.summary,
        thresholds: Settings.getThresholds()
      });
      if (!result.success) throw new Error(result.error);

      G.aiSuggestions = result.suggestions?.keywordSuggestions || {};
      const overall          = result.suggestions?.overall || {};
      const topPriority      = result.suggestions?.topPriority || [];
      const campaignAnalysis = result.suggestions?.campaignAnalysis || [];

      Table.setAISuggestions(G.aiSuggestions);

      // AI分析完成后，将AI建议否词真正写入 negativeList（source:'ai'）
      injectAINegatives(G.aiSuggestions);

      // 更新否词清单数量显示
      updateNegativeCountWithAI();

      // ─── 渲染AI独立视图 ───
      renderAIInsightView(overall, campaignAnalysis, topPriority, G.aiSuggestions);

      setStatus('ready', 'AI 分析完成');
      showToast('✓ AI 分析完成，请查看 AI 优化建议', 'success');

    } catch (err) {
      if (aiInsightLoading) aiInsightLoading.style.display = 'none';

      // 友好化错误信息
      let errMsg = err.message || 'AI 调用失败';
      if (errMsg.includes('ECONNRESET') || errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        errMsg = '网络连接中断（ECONNRESET），AI 服务响应超时，已自动重试仍失败，请检查网络后重试';
      } else if (errMsg.includes('timeout') || errMsg.includes('超时')) {
        errMsg = 'AI 响应超时，请稍后重试（网络繁忙或请求数据过多）';
      }

      if (aiInsightEmpty) {
        aiInsightEmpty.style.display = 'block';
        const emptyDesc = aiInsightEmpty.querySelector('p');
        if (emptyDesc) emptyDesc.textContent = '分析失败：' + errMsg;
      }
      setStatus('error', 'AI 分析失败');
      showToast('AI 分析失败：' + errMsg, 'error');
    }
  }

  // ---- 渲染 AI 独立视图 ----
  function renderAIInsightView(overall, campaignAnalysis, topPriority, kwSuggestions) {
    const aiInsightLoading = document.getElementById('aiInsightLoading');
    const aiInsightResult  = document.getElementById('aiInsightResult');
    if (aiInsightLoading) aiInsightLoading.style.display = 'none';
    if (!aiInsightResult) return;
    aiInsightResult.style.display = 'block';

    // 整体总结
    const summaryText = typeof overall === 'object' ? (overall.summary || '') : (overall || '');
    const summaryEl = document.getElementById('aiOverallSummary');
    if (summaryEl) summaryEl.textContent = summaryText;

    // 核心问题 + 立即执行 + ROAS改善
    const topIssues       = (typeof overall === 'object' && overall.topIssues) ? overall.topIssues : [];
    const immediateActs   = (typeof overall === 'object' && overall.immediateActions) ? overall.immediateActions : [];
    const roasImprovement = (typeof overall === 'object' && overall.roasImprovement) ? overall.roasImprovement : '';
    const budgetAdvice    = (typeof overall === 'object' && overall.budgetAdvice) ? overall.budgetAdvice : '';

    const topIssuesEl = document.getElementById('aiTopIssuesList');
    if (topIssuesEl) {
      topIssuesEl.innerHTML = topIssues.length > 0
        ? topIssues.map(i => `<li>${escHtml(i)}</li>`).join('')
        : '<li>暂无数据</li>';
    }

    const immediateEl = document.getElementById('aiImmediateActionsList');
    if (immediateEl) {
      immediateEl.innerHTML = immediateActs.length > 0
        ? immediateActs.map(a => `<li>${escHtml(a)}</li>`).join('')
        : '<li>暂无数据</li>';
    }

    const roasEl = document.getElementById('aiRoasImprovement');
    if (roasEl) roasEl.textContent = roasImprovement || '–';

    const budgetBlock = document.getElementById('aiBudgetBlock');
    const budgetText  = document.getElementById('aiBudgetAdviceText');
    if (budgetAdvice && budgetBlock && budgetText) {
      budgetBlock.style.display = 'block';
      budgetText.textContent = budgetAdvice;
    }

    // 广告活动维度分析
    const campSection = document.getElementById('aiCampaignAnalysisSection');
    const campList    = document.getElementById('aiCampaignAnalysisList');
    if (campSection && campList && campaignAnalysis.length > 0) {
      campSection.style.display = 'block';
      const healthIcon = { '优': '✅', '良': '🟡', '差': '🔴' };
      campList.innerHTML = campaignAnalysis.map(c => `
        <div class="ai-campaign-card">
          <div class="ai-campaign-card-header">
            <span class="ai-campaign-health ${c.healthStatus === '优' ? 'health-good' : c.healthStatus === '良' ? 'health-ok' : 'health-bad'}">
              ${healthIcon[c.healthStatus] || '❓'} ${escHtml(c.healthStatus || '–')}
            </span>
            <span class="ai-campaign-name">${escHtml(c.campaignName || '–')}</span>
          </div>
          <div class="ai-campaign-body">
            <div class="ai-campaign-row"><label>核心问题</label><p>${escHtml(c.coreIssue || '–')}</p></div>
            <div class="ai-campaign-row"><label>预算效率</label><p>${escHtml(c.budgetEfficiency || '–')}</p></div>
            <div class="ai-campaign-row ai-campaign-row-highlight"><label>关键建议</label><p>${escHtml(c.keyRecommendation || '–')}</p></div>
          </div>
        </div>`).join('');
    }

    // 优先处理关键词
    const priorSection = document.getElementById('aiTopPrioritySection');
    const priorList    = document.getElementById('aiTopPriorityList');
    if (priorSection && priorList && topPriority.length > 0) {
      priorSection.style.display = 'block';
      priorList.innerHTML = topPriority.map((kw, i) =>
        `<span class="ai-priority-item ai-priority-rank-${i + 1}">#${i + 1} ${escHtml(kw)}</span>`
      ).join('');
    }

    // 关键词操作建议（按广告活动分组，折叠展示）
    const kwSection = document.getElementById('aiKwSuggestionsSection');
    const kwList    = document.getElementById('aiKwSuggestionsList');
    const kwCount   = document.getElementById('aiKwCount');
    if (kwSection && kwList && kwSuggestions && Object.keys(kwSuggestions).length > 0) {
      kwSection.style.display = 'block';
      const kwArr = Object.entries(kwSuggestions);
      if (kwCount) kwCount.textContent = `共 ${kwArr.length} 条建议`;

      // 按广告活动分组
      const bycamp = {};
      kwArr.forEach(([kw, sug]) => {
        const cname = sug.campaignName || '其他';
        if (!bycamp[cname]) bycamp[cname] = [];
        bycamp[cname].push({ kw, sug });
      });

      const actionCls = {
        increase: 'ai-action-increase',
        decrease: 'ai-action-decrease',
        delete:   'ai-action-delete',
        pause:    'ai-action-pause',
        observe:  'ai-action-observe',
        maintain: 'ai-action-maintain'
      };
      const urgencyCls = { '高': 'urgency-high', '中': 'urgency-mid', '低': 'urgency-low' };

      kwList.innerHTML = Object.entries(bycamp).map(([cname, items]) => `
        <div class="ai-kw-group">
          <div class="ai-kw-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="ai-kw-group-icon">📁</span>
            <span class="ai-kw-group-name">${escHtml(cname)}</span>
            <span class="ai-kw-group-count">${items.length} 条</span>
            <span class="ai-kw-group-toggle">▲</span>
          </div>
          <div class="ai-kw-group-body">
            ${items.map(({ kw, sug }) => `
              <div class="ai-kw-item">
                <div class="ai-kw-item-top">
                  <span class="ai-kw-name">${escHtml(kw)}</span>
                  <span class="ai-kw-action ${actionCls[sug.actionCode] || ''}">${escHtml(sug.action || '保持')}</span>
                  ${sug.urgency ? `<span class="ai-kw-urgency ${urgencyCls[sug.urgency] || ''}">${escHtml(sug.urgency)}优先</span>` : ''}
                </div>
                ${sug.actionDetail ? `<div class="ai-kw-detail">${escHtml(sug.actionDetail)}</div>` : ''}
                ${sug.reason ? `<div class="ai-kw-reason">${escHtml(sug.reason)}</div>` : ''}
              </div>`).join('')}
          </div>
        </div>`).join('');
    }
  }

  // ---- action 字符串判定否词/暂停（前端兜底版）----
  function isNegativeAction(aiSug) {
    // 优先用后端已计算的 actionCode
    if (aiSug.actionCode === 'delete' || aiSug.actionCode === 'pause') return true;
    // 兜底：直接判断 action 字符串
    const a = (aiSug.action || '').toLowerCase();
    return a.includes('否词') || a.includes('删除') || a.includes('negative')
        || a.includes('暂停') || a.includes('停止') || a.includes('pause');
  }

  // ---- 将 AI 建议否词真正写入 negativeList ----
  function injectAINegatives(aiSuggestions) {
    if (!G.data) { console.warn('[AI否词] G.data 为空，跳过注入'); return; }

    G.data.negativeList = G.data.negativeList || [];

    // 先清除旧的 AI 来源词（防止重复注入）
    G.data.negativeList = G.data.negativeList.filter(i => i.source !== 'ai');

    const sug = aiSuggestions || {};
    const entries = Object.entries(sug);
    console.log(`[AI否词] aiSuggestions 总词数: ${entries.length}`);

    // 统计 actionCode 分布（调试用）
    const dist = {};
    entries.forEach(([, v]) => { dist[v.actionCode || v.action || '?'] = (dist[v.actionCode || v.action || '?'] || 0) + 1; });
    console.log('[AI否词] actionCode 分布:', dist);

    // 保留非 AI 词的 key 集合（规则词/irrel 词不被覆盖）
    const existingNonAiSet = new Set(G.data.negativeList.map(i => i.keyword));

    // 建立 rows 快速查询表
    const rowMap = {};
    if (G.data.rows) {
      G.data.rows.forEach(r => { if (r.keyword) rowMap[r.keyword] = r; });
    }

    let addedCount = 0;

    entries.forEach(([kw, aiSug]) => {
      if (!kw) return;
      if (!isNegativeAction(aiSug)) return;
      if (existingNonAiSet.has(kw)) return;

      const row = rowMap[kw] || {};
      G.data.negativeList.push({
        keyword:      kw,
        spend:        row.spend     || 0,
        clicks:       row.clicks    || 0,
        orders14d:    row.orders14d || 0,
        reasons:      [],
        campaignId:   row.campaignId   || '',
        campaignName: aiSug.campaignName || row.campaignName || '',
        source:       'ai',
        aiReason:     aiSug.reason || aiSug.actionDetail || 'AI建议否词'
      });
      addedCount++;
    });

    console.log(`[AI否词] 本次注入 ${addedCount} 个否词/暂停词`);
    if (addedCount > 0) {
      showToast(`✓ 已自动加入 ${addedCount} 个 AI 建议否词`, 'success');
    }
  }

  // ---- 更新否词数量（规则判定 + AI建议）----
  function updateNegativeCountWithAI() {
    if (!G.data) return;
    const list = buildMergedNegativeList(G.data, G.aiSuggestions, '');
    const count = list.length;
    const negCountEl    = document.getElementById('negativeCount');
    const negCountTopEl = document.getElementById('negativeCountTop');
    if (negCountEl)    negCountEl.textContent    = count;
    if (negCountTopEl) negCountTopEl.textContent = count;
  }

  // ---- 图表带活动筛选渲染 ----
  function renderChartsWithFilter() {
    if (!G.data) return;

    const campaignId = G.chartCampaignFilter;
    let chartData = G.data;

    if (campaignId) {
      const camp = (G.data.campaigns || []).find(c => c.id === campaignId);
      if (camp) {
        chartData = {
          rows:         camp.rows || [],
          summary:      camp.summary || {},
          adTypeStats:  camp.adTypeStats || [],
          losingProducts: camp.losingProducts || []
        };
      }
    }

    const currentMetric = document.querySelector('.chart-btn.active')?.dataset.metric || 'spend';
    Charts.renderAll(chartData);
  }

  // ---- 否词清单弹窗（带Tab分类：规则判定/AI建议/非强相关词）----
  let G_negTab = 'rule'; // 当前选中Tab

  function openNegativeModal() {
    const modal    = document.getElementById('negativeModal');
    const selectEl = document.getElementById('negFilterCampaign');

    // 填充广告活动下拉
    if (selectEl && G.data) {
      const campaigns = G.data.campaigns || [];
      selectEl.innerHTML = '<option value="">全部活动</option>';
      campaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id || c.name;
        opt.textContent = c.name || c.id;
        selectEl.appendChild(opt);
      });
      selectEl.onchange = () => renderNegativeContent();
    }

    // Tab 切换事件
    modal.querySelectorAll('.neg-tab').forEach(btn => {
      btn.onclick = () => {
        modal.querySelectorAll('.neg-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        G_negTab = btn.dataset.tab;
        renderNegativeContent();
      };
    });

    renderNegativeContent();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function renderNegativeContent() {
    const content    = document.getElementById('negativeListContent');
    const selectEl   = document.getElementById('negFilterCampaign');
    const campFilter = selectEl?.value || '';

    // 构建三类列表
    const allList   = buildMergedNegativeList(G.data, G.aiSuggestions, campFilter);
    const ruleList  = allList.filter(i => i.source !== 'ai' && i.source !== 'irrel');
    const aiList    = allList.filter(i => i.source === 'ai');
    const irrelList = allList.filter(i => i.source === 'irrel');

    // 更新Tab计数
    const tabCountRule  = document.getElementById('negTabCountRule');
    const tabCountAI    = document.getElementById('negTabCountAI');
    const tabCountIrrel = document.getElementById('negTabCountIrrel');
    if (tabCountRule)  tabCountRule.textContent  = ruleList.length;
    if (tabCountAI)    tabCountAI.textContent    = aiList.length;
    if (tabCountIrrel) tabCountIrrel.textContent = irrelList.length;

    // 更新描述文字
    const descEl = document.getElementById('negCurrentDesc');
    const tabDescMap = {
      rule:  '系统根据花费/点击/转化规则自动识别的否词候选',
      ai:    'AI 分析后建议删除或暂停的关键词',
      irrel: '从"非强相关词"板块手动加入的词'
    };
    if (descEl) descEl.textContent = tabDescMap[G_negTab] || '';

    // 按当前Tab筛选
    const tabMap = { rule: ruleList, ai: aiList, irrel: irrelList };
    const list = tabMap[G_negTab] || ruleList;

    if (list.length === 0) {
      const emptyMsg = {
        rule:  '暂无规则判定否词',
        ai:    '暂无 AI 建议否词，请先运行 AI 分析',
        irrel: '暂无非强相关词，请先在"非强相关词"页面一键加入'
      };
      content.innerHTML = `<p class="empty-state">${emptyMsg[G_negTab] || '暂无数据'}</p>`;
    } else {
      const sourceIcon = {
        ai:    { cls: 'neg-source-badge neg-ai',    text: 'AI建议' },
        irrel: { cls: 'neg-source-badge neg-irrel', text: '非强相关词' },
        rule:  { cls: 'neg-source-badge neg-rule',  text: '规则判定' }
      };
      content.innerHTML = list.map(item => {
        const src = sourceIcon[item.source] || sourceIcon.rule;
        return `
        <div class="negative-item">
          <div class="neg-item-header">
            <div class="kw-text">${escHtml(item.keyword)}</div>
            <div class="neg-item-tags">
              <span class="${src.cls}">${src.text}</span>
              ${item.campaignName ? `<span class="neg-campaign">${escHtml(item.campaignName)}</span>` : ''}
            </div>
          </div>
          <div class="kw-meta">花费: ${fmt(item.spend)}₩ · 点击: ${fmt(item.clicks)} · 14天订单: ${fmt(item.orders14d)}</div>
          <div class="kw-reason">${escHtml(item.aiReason || (item.reasons || []).join(' / '))}</div>
        </div>`;
      }).join('');
    }
  }

  /**
   * 构建否词列表（规则判定 + AI建议 + 非强相关词，均已持久化在 negativeList）
   */
  function buildMergedNegativeList(data, aiSuggestions, campFilter) {
    if (!data) return [];
    let list = [...(data.negativeList || [])];
    if (campFilter) {
      list = list.filter(i => i.campaignId === campFilter || i.campaignName === campFilter);
    }
    return list;
  }

  // ---- 通用复制到剪贴板（兼容 http 环境）----
  function copyTextToClipboard(text, successMsg) {
    function doFallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;width:2px;height:2px;padding:0;border:0;outline:0;box-shadow:none;background:transparent;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) showToast(successMsg, 'success');
        else showToast('复制失败，请手动复制', 'error');
      } catch(e) {
        document.body.removeChild(ta);
        showToast('复制失败：' + e.message, 'error');
      }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => showToast(successMsg, 'success')).catch(doFallback);
    } else {
      doFallback();
    }
  }

  function closeNegativeModal() {
    document.getElementById('negativeModal').style.display = 'none';
    document.body.style.overflow = '';
  }

  function copyNegativeList() {
    const selectEl   = document.getElementById('negFilterCampaign');
    const campFilter = selectEl?.value || '';
    const allList = buildMergedNegativeList(G.data, G.aiSuggestions, campFilter);
    const tabMap  = { rule: allList.filter(i => i.source !== 'ai' && i.source !== 'irrel'), ai: allList.filter(i => i.source === 'ai'), irrel: allList.filter(i => i.source === 'irrel') };
    const list = tabMap[G_negTab] || allList;
    if (list.length === 0) { showToast('暂无否词', 'info'); return; }
    const text = [...new Set(list.map(i => i.keyword))].join('\n');
    copyTextToClipboard(text, `✓ 已复制 ${list.length} 个否词`);
  }

  // ---- 复制非强相关词（仅关键词，支持活动筛选）----
  function copyIrrelevantList() {
    const selectEl   = document.getElementById('insightIrrelFilterCampaign');
    const campFilter = selectEl?.value || '';
    let list = G.data?.irrelevantKeywords || [];
    if (campFilter) {
      list = list.filter(k => k.campaignId === campFilter || k.campaignName === campFilter);
    }
    if (list.length === 0) { showToast('暂无非强相关词', 'info'); return; }
    const kwList = [...new Set(list.map(k => k.keyword))];
    copyTextToClipboard(kwList.join('\n'), `✓ 已复制 ${kwList.length} 个非强相关词`);
  }

  // ---- 一键将非强相关词加入否词清单 ----
  function addIrrelevantToNegative() {
    const selectEl   = document.getElementById('insightIrrelFilterCampaign');
    const campFilter = selectEl?.value || '';
    let list = G.data?.irrelevantKeywords || [];
    if (campFilter) {
      list = list.filter(k => k.campaignId === campFilter || k.campaignName === campFilter);
    }
    if (list.length === 0) { showToast('暂无非强相关词可添加', 'info'); return; }

    // 将非强相关词加入 G.data 的 negativeList（带 irrel 标记）
    const negSet = new Set((G.data.negativeList || []).map(n => n.keyword));
    let addedCount = 0;
    list.forEach(k => {
      if (!negSet.has(k.keyword)) {
        negSet.add(k.keyword);
        G.data.negativeList = G.data.negativeList || [];
        G.data.negativeList.push({
          keyword:      k.keyword,
          spend:        k.spend || 0,
          clicks:       k.clicks || 0,
          orders14d:    k.orders14d || 0,
          reasons:      ['非强相关词，与商品关联度较弱'],
          campaignId:   k.campaignId || '',
          campaignName: k.campaignName || '',
          source:       'irrel',    // 非强相关词来源
          aiReason:     null
        });
        addedCount++;
      }
    });

    // 更新否词数量
    updateNegativeCountWithAI();
    showToast(`✓ 已将 ${addedCount} 个非强相关词加入否词清单`, 'success');
  }

  // ---- 拖拽上传 ----
  function initDragDrop() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    });
  }

  // ---- DOM 就绪 ----
  document.addEventListener('DOMContentLoaded', () => {
    initDragDrop();
    setStatus('ready', '就绪');

    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const dropZone  = document.getElementById('dropZone');

    browseBtn?.addEventListener('click', e => { e.stopPropagation(); fileInput?.click(); });
    dropZone?.addEventListener('click', e => {
      if (e.target === browseBtn) return;
      fileInput?.click();
    });

    fileInput?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) uploadFile(file);
      fileInput.value = '';
    });

    // 重新上传
    function doReupload() {
      document.getElementById('dropZone').style.display = 'block';
      document.getElementById('uploadProgress').style.display = 'none';
      document.getElementById('statsRow').style.display = 'none';
      document.getElementById('actionRow').style.display = 'none';
      document.body.classList.remove('has-action-bar');
      document.getElementById('campaignSection').style.display = 'none';
      const successBar = document.getElementById('uploadSuccessBar');
      if (successBar) successBar.style.display = 'none';
      // 恢复 hero 和上传卡片
      const uploadHero2 = document.getElementById('uploadHero');
      const uploadCard2 = document.getElementById('uploadCard');
      if (uploadHero2) { uploadHero2.style.display = ''; uploadHero2.style.opacity = '1'; }
      if (uploadCard2) { uploadCard2.style.display = ''; uploadCard2.style.opacity = '1'; }
      G.data = null;
      G.aiSuggestions = {};
      G.chartCampaignFilter = '';
      setStatus('ready', '就绪');
    }
    document.getElementById('btnReupload')?.addEventListener('click', doReupload);
    document.getElementById('btnReupload2')?.addEventListener('click', doReupload);

    // 导航
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => { e.preventDefault(); switchView(item.dataset.view); });
    });

    // 操作按钮
    document.getElementById('btnViewAnalysis')?.addEventListener('click', () => switchView('analysis'));
    document.getElementById('btnViewInsights')?.addEventListener('click', () => switchView('insights'));
    document.getElementById('btnViewCharts')?.addEventListener('click', () => switchView('charts'));
    document.getElementById('btnAiAnalyze')?.addEventListener('click', () => {
      switchView('ai-insight');
      runAIAnalysis();
    });
    document.getElementById('btnAiAnalyze2')?.addEventListener('click', runAIAnalysis);
    document.getElementById('btnExport')?.addEventListener('click', () => {
      if (!G.data) { showToast('请先上传报告文件', 'error'); return; }
      Exporter.export(G.data, G.aiSuggestions, G.fileName);
    });

    // 否词弹窗
    document.getElementById('btnNegativeList')?.addEventListener('click', openNegativeModal);
    document.getElementById('btnNegativeListTop')?.addEventListener('click', openNegativeModal);
    document.getElementById('negativeModalClose')?.addEventListener('click', closeNegativeModal);
    document.getElementById('negativeModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('negativeModal')) closeNegativeModal();
    });
    document.getElementById('btnCopyNegative')?.addEventListener('click', copyNegativeList);

    // 数据分析表格 - 一键复制当前筛选的关键词
    document.getElementById('btnCopyKeywords')?.addEventListener('click', () => {
      const rows = Table.getFilteredRows();
      if (!rows.length) { showToast('当前筛选无数据', 'info'); return; }

      const kwList = [...new Set(
        rows.map(r => (r.keyword || r.keywordDisplay || '').trim()).filter(Boolean)
      )];
      if (!kwList.length) { showToast('未找到有效关键词', 'error'); return; }

      copyTextToClipboard(kwList.join('\n'), `✓ 已复制 ${kwList.length} 个关键词`);

      // 按钮短暂变色反馈
      const btn = document.getElementById('btnCopyKeywords');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 已复制！`;
        btn.style.background = '#DCFCE7';
        btn.style.borderColor = '#22C55E';
        btn.style.color = '#166534';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.style.background = '';
          btn.style.borderColor = '';
          btn.style.color = '';
        }, 1500);
      }
    });

    // 不相关词复制
    document.getElementById('btnCopyIrrelevant')?.addEventListener('click', copyIrrelevantList);

    // 一键将非强相关词加入否词清单
    document.getElementById('btnAddIrrelToNegative')?.addEventListener('click', addIrrelevantToNegative);

    // 广告活动弹窗
    document.getElementById('campaignModalClose')?.addEventListener('click', closeCampaignModal);
    document.getElementById('campaignModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('campaignModal')) closeCampaignModal();
    });

    // 统计卡片弹窗
    document.getElementById('statCardTotal')?.addEventListener('click', () => openStatDetail('', '全部关键词'));
    document.getElementById('statCardEfficient')?.addEventListener('click', () => openStatDetail('efficient', '高效词列表'));
    document.getElementById('statCardInvalid')?.addEventListener('click', () => openStatDetail('invalid', '无效词列表'));
    document.getElementById('statCardMeaningless')?.addEventListener('click', () => openStatDetail('meaningless', '无意义词列表'));
    document.getElementById('statDetailModalClose')?.addEventListener('click', closeStatDetail);
    document.getElementById('statDetailModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('statDetailModal')) closeStatDetail();
    });

    // 图表指标切换
    document.querySelectorAll('.chart-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (G.data) renderChartsWithFilter();
      });
    });

    // 图表广告活动筛选
    document.getElementById('chartFilterCampaign')?.addEventListener('change', e => {
      G.chartCampaignFilter = e.target.value;
      renderChartsWithFilter();
    });

    // 刷新图表
    document.getElementById('btnRefreshCharts')?.addEventListener('click', () => {
      if (G.data) renderChartsWithFilter();
    });

    // 洞察广告活动筛选（整体洞察）
    document.getElementById('insightFilterCampaign')?.addEventListener('change', e => {
      if (G.data) renderInsights(G.data, e.target.value);
    });

    // 不相关词活动筛选（独立筛选，只刷新不相关词面板）
    document.getElementById('insightIrrelFilterCampaign')?.addEventListener('change', () => {
      if (G.data) {
        const campFilter = document.getElementById('insightFilterCampaign')?.value || '';
        renderIrrelevantKeywords(
          campFilter
            ? ((G.data.campaigns || []).find(c => c.id === campFilter)?.irrelevantKeywords || [])
            : (G.data.irrelevantKeywords || [])
        );
      }
    });

    // ESC 关闭弹窗
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeNegativeModal();
        closeCampaignModal();
        closeStatDetail();
      }
    });
  });

})();
