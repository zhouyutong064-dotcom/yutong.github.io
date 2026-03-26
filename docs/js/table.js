/**
 * table.js v5 - 数据表格模块
 * 修复：点击关键词后数据消失（keyword click 事件阻断了行渲染）
 * 新增：
 *  - 搜索区域筛选
 *  - 特殊词标记 (specialMark: anomaly/perfect/meaningless)
 *  - 所有英文缩写指标改为中文
 *  - 待评估词全部归为无意义，无需分析
 */
(function() {
  'use strict';

  const PAGE_SIZE = 60;

  let state = {
    allRows:       [],
    filteredRows:  [],
    currentPage:   1,
    sortCol:       'spend',
    sortDir:       'desc',
    aiSuggestions: {}
  };

  // ---- 格式化工具 ----
  function fmt(v, dec = 0) {
    if (v == null || isNaN(v)) return '–';
    return Number(v).toLocaleString('ko-KR', { maximumFractionDigits: dec });
  }
  function fmtPct(v, dec = 2) {
    if (v == null || isNaN(v) || v === 0) return '–';
    return Number(v).toFixed(dec) + '%';
  }
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- 设置数据 ----
  function setData(rows, campaigns) {
    state.allRows = rows || [];
    state.currentPage = 1;

    // 填充广告活动下拉
    const campaignSelect = document.getElementById('filterCampaign');
    if (campaignSelect && campaigns) {
      campaignSelect.innerHTML = '<option value="">全部活动</option>';
      campaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        campaignSelect.appendChild(opt);
      });
    }

    // 填充广告类型下拉
    const adTypeSelect = document.getElementById('filterAdType');
    if (adTypeSelect) {
      const types = [...new Set(rows.map(r => r.adType).filter(Boolean))];
      adTypeSelect.innerHTML = '<option value="">全部类型</option>';
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        adTypeSelect.appendChild(opt);
      });
    }

    applyFilters();
  }

  // ---- 设置 AI 建议（BUG修复：不重置 filteredRows，仅重新渲染当前页）----
  function setAISuggestions(suggestions) {
    state.aiSuggestions = suggestions || {};
    // 不调用 applyFilters()，只重新渲染当前页面，避免清空筛选结果
    renderPage();
  }

  // ---- 筛选 ----
  function applyFilters() {
    const campaign  = document.getElementById('filterCampaign')?.value || '';
    const label     = document.getElementById('filterLabel')?.value || '';
    const adType    = document.getElementById('filterAdType')?.value || '';
    const keyword   = document.getElementById('filterKeyword')?.value.toLowerCase().trim() || '';
    const action    = document.getElementById('filterAction')?.value || '';
    const spendFilter = document.getElementById('filterSpend')?.value || '';
    const areaFilter  = document.getElementById('filterArea')?.value || '';   // 新增：搜索区域筛选

    let rows = state.allRows;

    if (campaign) {
      rows = rows.filter(r => r.campaignId === campaign || r.campaignName === campaign);
    }
    if (label) {
      if (label === 'anomaly')  rows = rows.filter(r => r.specialMark === 'anomaly');
      else if (label === 'perfect') rows = rows.filter(r => r.specialMark === 'perfect');
      else rows = rows.filter(r => r.label === label);
    }
    if (adType) {
      rows = rows.filter(r => r.adType === adType);
    }
    if (keyword) {
      rows = rows.filter(r => {
        const kw = (r.keyword || r.keywordDisplay || '').toLowerCase();
        return kw.includes(keyword);
      });
    }
    if (action) {
      rows = rows.filter(r => {
        const s = state.aiSuggestions[r.keyword];
        return s && s.actionCode === action;
      });
    }
    if (spendFilter) {
      const thresholds = { gt0: 0, gt1000: 1000, gt10000: 10000, gt50000: 50000 };
      const minSpend = thresholds[spendFilter];
      if (minSpend !== undefined) rows = rows.filter(r => (r.spend || 0) > minSpend);
    }
    if (areaFilter === 'search') {
      rows = rows.filter(r => r.isSearchArea === true);
    } else if (areaFilter === 'nonsearch') {
      rows = rows.filter(r => r.isSearchArea === false);
    }

    // 排序
    const col = state.sortCol;
    const dir = state.sortDir;
    rows = [...rows].sort((a, b) => {
      let va = a[col], vb = b[col];
      if (va == null) va = -Infinity;
      if (vb == null) vb = -Infinity;
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

    state.filteredRows = rows;
    state.currentPage = 1;
    renderPage();

    // ---- 控制"复制关键词"按钮：有任意筛选条件时显示 ----
    const btnCopyKw  = document.getElementById('btnCopyKeywords');
    const copyKwBadge = document.getElementById('copyKwCount');
    const hasFilter = campaign || label || adType || keyword || action || spendFilter || areaFilter;
    if (btnCopyKw) {
      if (hasFilter && rows.length > 0) {
        btnCopyKw.style.display = 'inline-flex';
        if (copyKwBadge) copyKwBadge.textContent = rows.length;
      } else {
        btnCopyKw.style.display = 'none';
      }
    }
  }

  // ---- 渲染页面 ----
  function renderPage() {
    const tbody    = document.getElementById('tableBody');
    const pageInfo = document.getElementById('pageInfo');
    const sizeInfo = document.getElementById('pageSizeInfo');
    if (!tbody) return;

    const total = state.filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(state.currentPage, totalPages);
    state.currentPage = page;

    const start = (page - 1) * PAGE_SIZE;
    const end   = Math.min(start + PAGE_SIZE, total);
    const pageRows = state.filteredRows.slice(start, end);

    if (pageRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="15" class="empty-state">暂无匹配数据</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(row => renderRow(row)).join('');
      // 绑定行点击事件 - 展开关键词详情
      tbody.querySelectorAll('tr.data-row').forEach((tr, idx) => {
        const rowData = pageRows[idx];
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => openKwDetail(rowData));
      });
    }

    if (pageInfo) pageInfo.textContent = `第 ${page} / ${totalPages} 页`;
    if (sizeInfo) sizeInfo.textContent = `共 ${total} 条`;
  }

  function renderRow(row) {
    const ai = state.aiSuggestions[row.keyword];
    const aiHtml  = ai ? aiActionBadge(ai) : '<span class="ai-empty">–</span>';
    const areaTag = row.isSearchArea
      ? '<span class="area-tag area-search">搜索</span>'
      : '<span class="area-tag area-nonsearch">非搜索</span>';
    const specialTag = specialMarkBadge(row.specialMark);
    const kwDisplay = row.isSearchArea
      ? escHtml(row.keyword || '')
      : '<span class="text-muted">非搜索区域</span>';

    return `<tr class="data-row ${row.label || ''}">
      <td class="keyword-cell" title="${escHtml(row.keyword || '')}">${kwDisplay} ${areaTag}</td>
      <td class="campaign-cell" title="${escHtml(row.campaignName || '')}">${escHtml(shortText(row.campaignName, 12) || '–')}</td>
      <td class="num-cell">${fmt(row.impressions)}</td>
      <td class="num-cell">${fmt(row.clicks)}</td>
      <td class="num-cell spend-cell">${fmt(row.spend)}</td>
      <td class="num-cell">${fmtPct(row.ctrCalc, 3)}</td>
      <td class="num-cell">${fmtPct(row.cvr, 2)}</td>
      <td class="num-cell">${row.cpc != null && row.cpc > 0 ? Math.round(row.cpc).toLocaleString('ko-KR') : '–'}</td>
      <td class="num-cell ${row.orders14d > 0 ? 'highlight' : ''}">${fmt(row.orders14d)}</td>
      <td class="num-cell ${roasClass(row.roas)}">${row.roas != null && row.roas > 0 ? Number(row.roas).toFixed(1) + '%' : '–'}</td>
      <td class="num-cell ${acosClass(row.acos)}">${row.acos != null ? Number(row.acos).toFixed(1) + '%' : '–'}</td>
      <td>${labelBadge(row.label)}</td>
      <td>${specialTag}</td>
      <td class="ai-cell">${aiHtml}</td>
    </tr>`;
  }

  function specialMarkBadge(mark) {
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
      efficient:   ['✅ 高效词',  'efficient'],
      inefficient: ['⚡ 低效词',  'inefficient'],
      invalid:     ['❌ 无效词',  'invalid'],
      meaningless: ['💤 无意义',  'meaningless']
    };
    const [text, cls] = map[label] || ['💤 无意义', 'meaningless'];
    return `<span class="label-badge label-${cls}">${text}</span>`;
  }

  function aiActionBadge(ai) {
    const map = {
      increase: ['📈 加价',   'ai-increase'],
      decrease: ['📉 降价',   'ai-decrease'],
      delete:   ['🚫 否词',   'ai-delete'],
      pause:    ['⏸ 暂停',   'ai-pause'],
      observe:  ['👁 观察',   'ai-observe'],
      maintain: ['✅ 保持',   'ai-maintain']
    };
    const [text, cls] = map[ai.actionCode] || ['保持', 'ai-maintain'];
    const urgencyMark = ai.urgency === '高' ? ' 🔥' : '';
    const detail = ai.actionDetail || ai.reason || '';
    return `<span class="ai-badge ${cls}" title="${escHtml(detail)}">${text}${urgencyMark}</span>`;
  }

  function roasClass(roas) {
    if (!roas || roas === 0) return '';
    if (roas >= 500) return 'text-green';
    if (roas >= 200) return '';
    return 'text-red';
  }

  function acosClass(acos) {
    if (acos == null) return '';
    if (acos <= 20) return 'text-green';
    if (acos <= 50) return '';
    return 'text-red';
  }

  function shortText(s, maxLen) {
    if (!s) return '';
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  }

  // ---- 关键词详情侧边栏 ----
  function openKwDetail(row) {
    const panel  = document.getElementById('kwDetailPanel');
    const title  = document.getElementById('kwDetailTitle');
    const body   = document.getElementById('kwDetailBody');
    if (!panel || !body) return;

    const ai = state.aiSuggestions[row.keyword] || null;

    title.textContent = row.keyword || '非搜索区域';

    const actionMap = {
      increase: { text: '📈 加价',  cls: 'ai-increase' },
      decrease: { text: '📉 降价',  cls: 'ai-decrease' },
      delete:   { text: '🚫 否词',  cls: 'ai-delete'   },
      pause:    { text: '⏸ 暂停',  cls: 'ai-pause'    },
      observe:  { text: '👁 观察',  cls: 'ai-observe'  },
      maintain: { text: '✅ 保持',  cls: 'ai-maintain' }
    };
    const labelMap = {
      efficient:   ['✅ 高效词',  'efficient'],
      inefficient: ['⚡ 低效词',  'inefficient'],
      invalid:     ['❌ 无效词',  'invalid'],
      meaningless: ['💤 无意义',  'meaningless']
    };
    const specialMap = {
      anomaly:     '<span class="special-badge special-anomaly">⚠️ 异常</span>',
      perfect:     '<span class="special-badge special-perfect">🚨 转化异常</span>',
      meaningless: '<span class="special-badge special-meaningless">💤 无意义</span>'
    };

    const [labelText, labelCls] = labelMap[row.label] || ['💤 无意义', 'meaningless'];
    const specialHtml = specialMap[row.specialMark] || '';
    const aiAct       = ai ? (actionMap[ai.actionCode] || actionMap.maintain) : null;

    // 各项指标颜色
    function roasColor(v)  { return v >= 500 ? 'green' : v >= 200 ? '' : 'red'; }
    function acosColor(v)  { return v <= 20  ? 'green' : v <= 50  ? '' : 'red'; }
    function cvrColor(v)   { return v >= 5   ? 'green' : v >= 1   ? '' : 'red'; }

    body.innerHTML = `
      <!-- 标签行 -->
      <div class="kw-detail-section">
        <div class="kw-detail-section-title">分类标签</div>
        <div class="kw-detail-tags">
          <span class="label-badge label-${labelCls}">${labelText}</span>
          ${specialHtml}
          ${row.isSearchArea
            ? '<span class="area-tag area-search">搜索区域</span>'
            : '<span class="area-tag area-nonsearch">非搜索区域</span>'}
          ${row.campaignName ? `<span class="neg-campaign">${escHtml(row.campaignName)}</span>` : ''}
          ${row.adType ? `<span class="neg-campaign">${escHtml(row.adType)}</span>` : ''}
        </div>
      </div>

      <!-- 核心指标 -->
      <div class="kw-detail-section">
        <div class="kw-detail-section-title">核心指标</div>
        <div class="kw-detail-metrics">
          <div class="kw-detail-metric">
            <div class="metric-label">花费</div>
            <div class="metric-value">${fmt(row.spend)}<small style="font-size:12px;font-weight:400;color:#9CA3AF">₩</small></div>
          </div>
          <div class="kw-detail-metric">
            <div class="metric-label">点击</div>
            <div class="metric-value">${fmt(row.clicks)}</div>
          </div>
          <div class="kw-detail-metric">
            <div class="metric-label">曝光</div>
            <div class="metric-value">${fmt(row.impressions)}</div>
          </div>
          <div class="kw-detail-metric">
            <div class="metric-label">点击率 (CTR)</div>
            <div class="metric-value">${fmtPct(row.ctrCalc, 3)}</div>
          </div>
          <div class="kw-detail-metric">
            <div class="metric-label">转化率 (CVR)</div>
            <div class="metric-value ${cvrColor(row.cvr)}">${fmtPct(row.cvr, 2)}</div>
          </div>
          <div class="kw-detail-metric">
            <div class="metric-label">点击成本 (CPC)</div>
            <div class="metric-value">${row.cpc != null && row.cpc > 0 ? Math.round(row.cpc).toLocaleString('ko-KR') + '₩' : '–'}</div>
          </div>
          <div class="kw-detail-metric">
            <div class="metric-label">14天订单</div>
            <div class="metric-value ${row.orders14d > 0 ? 'green' : ''}">${fmt(row.orders14d)}</div>
          </div>
          <div class="kw-detail-metric">
            <div class="metric-label">14天销售额</div>
            <div class="metric-value">${fmt(row.salesAmt14d)}<small style="font-size:12px;font-weight:400;color:#9CA3AF">₩</small></div>
          </div>
          <div class="kw-detail-metric">
            <div class="metric-label">ROAS</div>
            <div class="metric-value ${roasColor(row.roas)}">${row.roas != null && row.roas > 0 ? Number(row.roas).toFixed(1) + '%' : '–'}</div>
          </div>
          <div class="kw-detail-metric">
            <div class="metric-label">ACoS</div>
            <div class="metric-value ${acosColor(row.acos)}">${row.acos != null ? Number(row.acos).toFixed(1) + '%' : '–'}</div>
          </div>
        </div>
      </div>

      ${ai ? `
      <!-- AI 建议块 -->
      <div class="kw-detail-section">
        <div class="kw-detail-section-title">AI 优化建议</div>
        <div class="kw-detail-ai-block">
          <div class="kw-detail-ai-action">
            <span class="ai-badge ${aiAct.cls}">${aiAct.text}</span>
            ${ai.urgency ? `<span class="ai-kw-urgency ${ai.urgency === '高' ? 'urgency-high' : ai.urgency === '中' ? 'urgency-mid' : 'urgency-low'}">${escHtml(ai.urgency)}优先</span>` : ''}
          </div>
          ${ai.actionDetail ? `<div class="kw-detail-ai-detail"><strong>建议：</strong>${escHtml(ai.actionDetail)}</div>` : ''}
          ${ai.reason ? `<div class="kw-detail-ai-detail" style="margin-top:6px"><strong>原因：</strong>${escHtml(ai.reason)}</div>` : ''}
        </div>
      </div>
      ` : `
      <div class="kw-detail-section">
        <div class="kw-detail-section-title">AI 优化建议</div>
        <p style="color:var(--text-muted);font-size:13px;padding:8px 0">暂无 AI 建议，请先运行 AI 分析</p>
      </div>
      `}

      ${(row.reasons && row.reasons.length > 0) ? `
      <!-- 系统判定理由 -->
      <div class="kw-detail-section">
        <div class="kw-detail-section-title">系统判定理由</div>
        <div class="kw-detail-reasons">
          ${row.reasons.map(r => `<div class="kw-detail-reason ${r.startsWith('⚠') || r.startsWith('❌') ? 'reason-bad' : ''}">${escHtml(r)}</div>`).join('')}
        </div>
      </div>
      ` : ''}
    `;

    panel.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function closeKwDetail() {
    const panel = document.getElementById('kwDetailPanel');
    if (panel) panel.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ---- 分页 ----
  function prevPage() {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderPage();
    }
  }

  function nextPage() {
    const totalPages = Math.ceil(state.filteredRows.length / PAGE_SIZE);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      renderPage();
    }
  }

  // ---- 排序 ----
  function sortBy(col) {
    if (state.sortCol === col) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortCol = col;
      state.sortDir = 'desc';
    }
    document.querySelectorAll('.sortable').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.col === col) th.classList.add('sort-' + state.sortDir);
    });
    applyFilters();
  }

  // ---- 对外暴露筛选活动方法（供 app.js 跳转时调用）----
  function filterByCampaign(campaignId) {
    const filterEl = document.getElementById('filterCampaign');
    if (filterEl) {
      filterEl.value = campaignId || '';
      applyFilters();
    }
  }

  // ---- 事件绑定 ----
  document.addEventListener('DOMContentLoaded', () => {
    // 筛选变化
    ['filterCampaign', 'filterLabel', 'filterTime', 'filterAdType', 'filterAction', 'filterSpend', 'filterArea'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyFilters);
    });
    document.getElementById('filterKeyword')?.addEventListener('input', applyFilters);

    // 分页
    document.getElementById('prevPage')?.addEventListener('click', prevPage);
    document.getElementById('nextPage')?.addEventListener('click', nextPage);

    // 排序
    document.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', () => sortBy(th.dataset.col));
    });

    // 关键词详情侧边栏关闭
    document.getElementById('kwDetailClose')?.addEventListener('click', closeKwDetail);
    document.getElementById('kwDetailBackdrop')?.addEventListener('click', closeKwDetail);
    // ESC 键关闭
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeKwDetail();
    });
  });

  // 获取当前筛选后的全部行
  function getFilteredRows() {
    return state.filteredRows || [];
  }

  // 导出接口
  window.Table = { setData, setAISuggestions, applyFilters, filterByCampaign, closeKwDetail, getFilteredRows };

})();
