/**
 * settings.js - 设置面板：API Key 管理、阈值配置
 * 修复：API Key 保存 BUG；统一模型选择为下拉框
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'coupang_ad_settings';

  const DEFAULT_SETTINGS = {
    selectedModel: 'deepseek',
    apiKeys: { deepseek: '', doubao: '' },
    thresholds: {
      invalidSpendNoClick: 1000,
      invalidClickNoConv: 10,
      invalidSpendNoOrder: 20000,
      efficientRoas: 500,
      efficientCtr: 0.3,
      efficientCvr: 3
    }
  };

  /** 从 localStorage 读取原始对象（不触发 UI 回填） */
  function _loadRaw() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      const parsed = JSON.parse(saved);
      // 深度合并，确保子字段不丢失
      return {
        selectedModel: parsed.selectedModel || DEFAULT_SETTINGS.selectedModel,
        apiKeys: {
          deepseek: parsed.apiKeys?.deepseek || '',
          doubao:   parsed.apiKeys?.doubao   || ''
        },
        thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(parsed.thresholds || {}) }
      };
    } catch(e) {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  }

  window.Settings = {
    /**
     * 加载设置（含 UI 回填）
     */
    load() {
      const settings = _loadRaw();
      this._applyToUI(settings);
      return settings;
    },

    /**
     * 保存 API Keys（修复版：直接读取 input 值，不依赖 load）
     */
    saveApiKeys() {
      const settings = _loadRaw();
      // 直接从 DOM 读取，不经过 load()，避免 UI 回填干扰
      const dsInput  = document.getElementById('key-deepseek');
      const dbInput  = document.getElementById('key-doubao');
      const modelSel = document.getElementById('modelSelect');

      if (dsInput)  settings.apiKeys.deepseek = dsInput.value.trim();
      if (dbInput)  settings.apiKeys.doubao   = dbInput.value.trim();
      if (modelSel) settings.selectedModel    = modelSel.value;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

      // 验证是否真的保存成功
      const verify = _loadRaw();
      const saved = (modelSel?.value === 'deepseek')
        ? verify.apiKeys.deepseek
        : verify.apiKeys.doubao;
      const inputVal = (modelSel?.value === 'deepseek')
        ? dsInput?.value?.trim()
        : dbInput?.value?.trim();

      if (saved === inputVal) {
        window.showToast('✓ API Key 已保存成功', 'success');
      } else {
        window.showToast('保存失败，请重试', 'error');
      }
    },

    /**
     * 保存阈值
     */
    saveThresholds() {
      const settings = _loadRaw();
      settings.thresholds = {
        invalidSpendNoClick: Number(document.getElementById('th-invalidSpendNoClick')?.value) || 1000,
        invalidClickNoConv:  Number(document.getElementById('th-invalidClickNoConv')?.value)  || 10,
        invalidSpendNoOrder: Number(document.getElementById('th-invalidSpendNoOrder')?.value) || 20000,
        efficientRoas:       Number(document.getElementById('th-efficientRoas')?.value)       || 500,
        efficientCtr:        Number(document.getElementById('th-efficientCtr')?.value)        || 0.3,
        efficientCvr:        Number(document.getElementById('th-efficientCvr')?.value)        || 3
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      window.showToast('✓ 阈值配置已保存', 'success');
    },

    getApiKey(model) {
      return _loadRaw().apiKeys[model] || '';
    },

    getSelectedModel() {
      const sel = document.getElementById('modelSelect');
      if (sel && sel.value) return sel.value;
      return _loadRaw().selectedModel || 'deepseek';
    },

    getThresholds() {
      return _loadRaw().thresholds || DEFAULT_SETTINGS.thresholds;
    },

    _applyToUI(settings) {
      // 表单回填（现已整合到上传页）
      const dsInput  = document.getElementById('key-deepseek');
      const dbInput  = document.getElementById('key-doubao');
      const modelSel = document.getElementById('modelSelect');
      if (dsInput)  dsInput.value  = settings.apiKeys?.deepseek || '';
      if (dbInput)  dbInput.value  = settings.apiKeys?.doubao   || '';
      if (modelSel) modelSel.value = settings.selectedModel || 'deepseek';

      // 根据当前模型初始化 API Key 输入框显示状态
      const currentModel = settings.selectedModel || 'deepseek';
      setTimeout(() => window.updateApiKeyVisibility && window.updateApiKeyVisibility(currentModel), 0);

      // 阈值表单回填
      const th = settings.thresholds || {};
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setVal('th-invalidSpendNoClick', th.invalidSpendNoClick || 1000);
      setVal('th-invalidClickNoConv',  th.invalidClickNoConv  || 10);
      setVal('th-invalidSpendNoOrder', th.invalidSpendNoOrder || 20000);
      setVal('th-efficientRoas',       th.efficientRoas       || 500);
      setVal('th-efficientCtr',        th.efficientCtr        || 0.3);
      setVal('th-efficientCvr',        th.efficientCvr        || 3);
    },
  };

  // ---- 事件绑定 ----
  document.addEventListener('DOMContentLoaded', () => {
    Settings.load();

    // 保存按钮（上传页与设置页共用同一 ID）
    document.getElementById('btnSaveApiKeys')?.addEventListener('click', () => Settings.saveApiKeys());
    document.getElementById('btnSaveThresholds')?.addEventListener('click', () => Settings.saveThresholds());

    // 模型下拉切换：只显示对应的 API Key 输入框
    document.getElementById('modelSelect')?.addEventListener('change', (e) => {
      window.updateApiKeyVisibility && window.updateApiKeyVisibility(e.target.value);
    });
  });

  // ---- 全局：切换 Key 可见性 ----
  window.toggleKeyVisibility = function(model) {
    const input = document.getElementById('key-' + model);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  };

  // ---- 根据选择的模型显示/隐藏对应 API Key 输入框 ----
  window.updateApiKeyVisibility = function(selectedModel) {
    const dsBlock = document.getElementById('apiKeyDeepseek');
    const dbBlock = document.getElementById('apiKeyDoubao');
    const apiRow  = document.querySelector('.api-key-row-2');

    if (selectedModel === 'deepseek') {
      if (dsBlock) dsBlock.style.display = 'block';
      if (dbBlock) dbBlock.style.display = 'none';
      if (apiRow) apiRow.style.gridTemplateColumns = '1fr';
    } else {
      if (dsBlock) dsBlock.style.display = 'none';
      if (dbBlock) dbBlock.style.display = 'block';
      if (apiRow) apiRow.style.gridTemplateColumns = '1fr';
    }
  };

})();
