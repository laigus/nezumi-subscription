'use strict';

const api = window.subscriptionAPI;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const icons = {
  all: '<svg viewBox="0 0 24 24"><path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="m5 16-1 4 4-1L19 8l-3-3L5 16Z"/><path d="m14 7 3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 7"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m6 14 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m6 10 6 6 6-6"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>'
};

const state = {
  categories: [],
  records: [],
  preferences: { reminderDays: 14, soundEnabled: true, pinned: true, interfaceOpacity: 100 },
  exchangeRates: { date: '', source: 'builtin', cnyPerUnit: { CNY: 1, USD: 6.91, EUR: 7.94, JPY: 0.0433, HKD: 0.882 } },
  selectedCategory: 'all',
  search: '',
  sort: 'expiry',
  subscriptionOnly: false,
  passwordTouched: false,
  audioContext: null,
  confirmResolve: null
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function dateFromKey(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12);
}

function daysUntil(value) {
  const target = dateFromKey(value);
  if (!target) return Infinity;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((target - today) / 86400000);
}

function expiryStatus(value) {
  const days = daysUntil(value);
  if (!Number.isFinite(days)) return { level: 'unknown', label: '日期待确认', days };
  if (days < 0) return { level: 'expired', label: `已过期 ${Math.abs(days)} 天`, days };
  if (days === 0) return { level: 'urgent', label: '今天到期', days };
  if (days <= 3) return { level: 'urgent', label: `${days} 天后到期`, days };
  if (days <= state.preferences.reminderDays) return { level: 'soon', label: `${days} 天后到期`, days };
  return { level: 'normal', label: `${days} 天后到期`, days };
}

function formatDate(value) {
  const date = dateFromKey(value);
  return date ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' }).format(date) : '—';
}

function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function cycleLabel(value) {
  return ({ monthly: '每月', quarterly: '每季度', yearly: '每年', once: '一次性', none: '无订阅' })[value] || '无订阅';
}

function monthlyEquivalent(item) {
  if (!item.hasSubscription) return 0;
  const factor = ({ monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, once: 0 })[item.billingCycle] ?? 1;
  return (Number(item.amount) || 0) * factor;
}

function monthlyEquivalentCny(item) {
  const rate = Number(state.exchangeRates?.cnyPerUnit?.[item.currency]) || 1;
  return monthlyEquivalent(item) * rate;
}

function getCategory(id) {
  return state.categories.find((category) => category.id === id) || { name: '未分类', color: '#7FA2D9' };
}

function normalizeInterfaceOpacity(value) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.min(100, Math.max(50, parsed)) : 100;
}

function applyInterfaceOpacity(value) {
  const opacity = normalizeInterfaceOpacity(value);
  document.documentElement.style.setProperty('--interface-opacity', String(opacity / 100));
  const input = $('#interfaceOpacityInput');
  const output = $('#interfaceOpacityValue');
  if (input) {
    input.value = String(opacity);
    input.style.setProperty('--range-progress', `${((opacity - 50) / 50) * 100}%`);
    input.setAttribute('aria-valuetext', `${opacity}%`);
  }
  if (output) output.textContent = `${opacity}%`;
  return opacity;
}

function playCrystalClick(strength = 1) {
  if (!state.preferences.soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext ||= new AudioContext();
    const context = state.audioContext;
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.055 * strength, now + 0.004);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    master.connect(context.destination);
    [1320, 2050].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, now + 0.055);
      gain.gain.value = index ? 0.42 : 0.68;
      oscillator.connect(gain).connect(master);
      oscillator.start(now + index * 0.009);
      oscillator.stop(now + 0.17);
    });
  } catch {
    // Interaction remains functional if an audio device is unavailable.
  }
}

function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  $('#toastRegion').append(item);
  setTimeout(() => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(7px)';
    item.style.transition = '.2s ease';
    setTimeout(() => item.remove(), 220);
  }, 2600);
}

function renderCategoryNav() {
  const total = state.records.length;
  const items = [
    `<button class="category-button ${state.selectedCategory === 'all' ? 'active' : ''}" data-category="all">${icons.all}<span>全部记录</span><b class="category-count">${total}</b></button>`,
    ...state.categories.map((category) => {
      const count = state.records.filter((item) => item.categoryId === category.id).length;
      return `<button class="category-button ${state.selectedCategory === category.id ? 'active' : ''}" data-category="${escapeHtml(category.id)}"><i class="category-dot" style="--dot:${escapeHtml(category.color)}"></i><span>${escapeHtml(category.name)}</span><b class="category-count">${count}</b></button>`;
    })
  ];
  $('#categoryNav').innerHTML = items.join('');
}

function getVisibleRecords() {
  const query = state.search.toLocaleLowerCase('zh-CN');
  const visible = state.records.filter((item) => {
    const categoryMatch = state.selectedCategory === 'all' || item.categoryId === state.selectedCategory;
    const subscriptionMatch = !state.subscriptionOnly || item.hasSubscription;
    const text = `${item.title} ${item.account} ${item.password} ${item.address} ${item.notes}`.toLocaleLowerCase('zh-CN');
    return categoryMatch && subscriptionMatch && (!query || text.includes(query));
  });
  return visible.sort((a, b) => {
    if (state.sort === 'name') return a.title.localeCompare(b.title, 'zh-CN');
    if (state.sort === 'amount') return monthlyEquivalentCny(b) - monthlyEquivalentCny(a);
    const aStatus = a.hasSubscription ? expiryStatus(a.expiresAt) : { level: 'neutral', days: Infinity };
    const bStatus = b.hasSubscription ? expiryStatus(b.expiresAt) : { level: 'neutral', days: Infinity };
    const rank = { expired: 0, urgent: 1, soon: 2, normal: 3, unknown: 4, neutral: 5 };
    if (rank[aStatus.level] !== rank[bStatus.level]) return rank[aStatus.level] - rank[bStatus.level];
    if (aStatus.level === 'expired') return bStatus.days - aStatus.days;
    return aStatus.days - bStatus.days;
  });
}

function renderRecordList() {
  const visible = getVisibleRecords();
  const selected = state.selectedCategory === 'all' ? null : getCategory(state.selectedCategory);
  $('#listTitle').textContent = selected ? selected.name : (state.search ? '搜索结果' : (state.subscriptionOnly ? '订阅记录' : '全部记录'));
  $('#resultCount').textContent = `${visible.length} 项`;
  $('#subscriptionFilterButton').classList.toggle('active', state.subscriptionOnly);
  $('#subscriptionFilterButton').setAttribute('aria-pressed', String(state.subscriptionOnly));
  $('#recordColumnHeadings').hidden = !visible.length;
  if (!visible.length) {
    const filtered = state.search || state.selectedCategory !== 'all' || state.subscriptionOnly;
    $('#recordList').innerHTML = `<div class="empty-state"><div><div class="empty-orbit"></div><h3>${filtered ? '这里暂时没有匹配项' : '把账号集中放好'}</h3><p>${filtered ? '换个关键词或类别试试。' : '需要时再为记录开启订阅或标记充值。'}</p><button class="primary-button compact" data-action="empty-add">${filtered ? '添加一项记录' : '添加第一项记录'}</button></div></div>`;
    return;
  }

  $('#recordList').innerHTML = visible.map((item) => {
    const category = getCategory(item.categoryId);
    const isSubscription = Boolean(item.hasSubscription);
    const status = isSubscription ? expiryStatus(item.expiresAt) : { level: 'neutral', label: '', days: Infinity };
    const initial = escapeHtml([...item.title][0]?.toUpperCase() || '账');
    const account = item.account || '-';
    const password = item.password || '-';
    const host = (() => { try { return new URL(item.address).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    const prepaidText = item.isPrepaid ? '<span class="prepaid-text">充值</span>' : '';
    return `<article class="record-item status-${status.level}" data-id="${escapeHtml(item.id)}" data-has-subscription="${isSubscription}" style="--item-color:${escapeHtml(category.color)}">
      <div class="service-cell">
        <div class="service-avatar">${initial}</div>
        <div class="service-copy"><h3 title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3><div class="service-meta"><i></i><span>${escapeHtml(category.name)}</span>${host ? `<button class="address-link" data-action="open-address" title="${escapeHtml(item.address)}">${escapeHtml(host)}</button>` : ''}</div></div>
      </div>
      <div class="credentials-cell"><div class="credential-line"><span class="credential-value credential-account" aria-label="账号：${escapeHtml(account)}" title="${escapeHtml(account)}">${escapeHtml(account)}</span></div><div class="credential-line"><span class="credential-value credential-password" aria-label="密码：${escapeHtml(password)}" title="${escapeHtml(password)}">${escapeHtml(password)}</span></div></div>
      <div class="expiry-cell">${isSubscription ? `<div class="expiry-date">${escapeHtml(formatDate(item.expiresAt))}</div><span class="status-pill ${status.level}">${escapeHtml(status.label)}</span>` : '<div class="cell-dash">-</div>'}</div>
      <div class="amount-cell">${isSubscription ? `<div class="amount-value">${escapeHtml(formatMoney(item.amount, item.currency))}</div><span class="amount-cycle">${escapeHtml(cycleLabel(item.billingCycle))}</span>${prepaidText}` : (item.isPrepaid ? prepaidText : '<div class="cell-dash">-</div>')}</div>
      <div class="row-actions"><button class="row-action" data-action="edit" aria-label="编辑">${icons.edit}</button><button class="row-action danger" data-action="delete" aria-label="删除">${icons.trash}</button></div>
    </article>`;
  }).join('');
}

function renderStats() {
  const subscriptions = state.records.filter((item) => item.hasSubscription);
  const prepaid = state.records.filter((item) => item.isPrepaid);
  const due = subscriptions.filter((item) => ['expired', 'urgent', 'soon'].includes(expiryStatus(item.expiresAt).level));
  $('#totalStat').textContent = state.records.length;
  $('#totalStatCaption').textContent = `${subscriptions.length} 订阅 · ${prepaid.length} 充值`;
  $('#dueStat').textContent = due.length;
  $('#dueStatCaption').textContent = `${state.preferences.reminderDays} 天内 / 已过期`;
  const monthlyCny = subscriptions.reduce((total, item) => total + monthlyEquivalentCny(item), 0);
  $('#spendStat').textContent = formatMoney(monthlyCny, 'CNY');
  $('#spendStatCaption').textContent = state.exchangeRates?.date ? `折合人民币 · ${state.exchangeRates.date.slice(5)} 汇率` : '折合人民币 · 缓存汇率';

  const next = [...subscriptions]
    .map((item) => ({ ...item, days: daysUntil(item.expiresAt) }))
    .filter((item) => Number.isFinite(item.days))
    .sort((a, b) => {
      if (a.days >= 0 && b.days < 0) return -1;
      if (a.days < 0 && b.days >= 0) return 1;
      return a.days >= 0 ? a.days - b.days : b.days - a.days;
    })[0];
  $('#nextRenewalTitle').textContent = next?.title || '暂无订阅';
  $('#nextRenewalMeta').textContent = next ? `${formatDate(next.expiresAt)} · ${expiryStatus(next.expiresAt).label}` : '开启订阅后，这里会显示最近到期项目。';
}

function renderPreferences() {
  $('#pinButton').classList.toggle('active', state.preferences.pinned);
  $('#soundButton').classList.toggle('active', state.preferences.soundEnabled);
  $('#soundButton').classList.toggle('muted', !state.preferences.soundEnabled);
  state.preferences.interfaceOpacity = applyInterfaceOpacity(state.preferences.interfaceOpacity);
}

function renderAll() {
  renderCategoryNav();
  renderStats();
  renderRecordList();
  renderPreferences();
}

async function loadData() {
  const data = await api.bootstrap();
  state.categories = data.categories;
  state.records = data.records;
  state.preferences = data.preferences;
  state.exchangeRates = data.exchangeRates || state.exchangeRates;
  if (state.selectedCategory !== 'all' && !state.categories.some((item) => item.id === state.selectedCategory)) state.selectedCategory = 'all';
  renderAll();
}

function openModal(id) {
  const layer = $(`#${id}`);
  layer.hidden = false;
  if (id === 'themeModal') $('#themeButton').classList.add('active');
  requestAnimationFrame(() => $('input:not([type="hidden"]), select, button', layer)?.focus());
}

function closeModal(id) {
  $(`#${id}`).hidden = true;
  if (id === 'themeModal') $('#themeButton').classList.remove('active');
}

function defaultExpiryDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updateSubscriptionFields() {
  const hasSubscription = $('#hasSubscriptionInput').checked;
  $('#subscriptionFields').hidden = !hasSubscription;
  $('#expiryInput').required = hasSubscription;
  $('#recordModalTitle').textContent = $('#recordId').value ? '编辑记录' : '添加记录';
}

function openRecordEditor(item = null) {
  $('#recordId').value = item?.id || '';
  $('#titleInput').value = item?.title || '';
  $('#categoryInput').innerHTML = state.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('');
  $('#categoryInput').value = item?.categoryId || (state.selectedCategory !== 'all' ? state.selectedCategory : state.categories[0]?.id || '');
  $('#expiryInput').value = item?.expiresAt || defaultExpiryDate();
  $('#accountInput').value = item?.account || '';
  $('#passwordInput').value = item?.password || '';
  $('#passwordInput').placeholder = '输入密码';
  $('#addressInput').value = item?.address || '';
  $('#amountInput').value = item?.amount ?? 0;
  $('#currencyInput').value = item?.currency || 'CNY';
  $('#cycleInput').value = item?.billingCycle || 'monthly';
  $('#hasSubscriptionInput').checked = Boolean(item?.hasSubscription);
  $('#isPrepaidInput').checked = Boolean(item?.isPrepaid);
  $('#notesInput').value = item?.notes || '';
  state.passwordTouched = false;
  updateSubscriptionFields();
  openModal('recordModal');
  setTimeout(() => $('#titleInput').focus(), 0);
}

function renderCategoryEditor() {
  $('#categoryEditorList').innerHTML = state.categories.map((category, index) => `<div class="category-editor-row" data-category-id="${escapeHtml(category.id)}"><input class="editor-color" type="color" value="${escapeHtml(category.color)}" aria-label="类别颜色"/><input class="editor-name" type="text" maxlength="20" value="${escapeHtml(category.name)}" aria-label="类别名称"/><button class="editor-action move" data-category-action="move-up" aria-label="上移类别" ${index === 0 ? 'disabled' : ''}>${icons.up}</button><button class="editor-action move" data-category-action="move-down" aria-label="下移类别" ${index === state.categories.length - 1 ? 'disabled' : ''}>${icons.down}</button><button class="editor-action" data-category-action="save" aria-label="保存类别">${icons.check}</button><button class="editor-action danger" data-category-action="delete" aria-label="删除类别">${icons.trash}</button></div>`).join('');
}

function showConfirm(title, message, acceptLabel = '确认删除') {
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmAccept').textContent = acceptLabel;
  openModal('confirmModal');
  return new Promise((resolve) => { state.confirmResolve = resolve; });
}

function settleConfirm(value) {
  closeModal('confirmModal');
  state.confirmResolve?.(value);
  state.confirmResolve = null;
}

async function handleListAction(button) {
  const action = button.dataset.action;
  if (action === 'empty-add') return openRecordEditor();
  const card = button.closest('.record-item');
  const item = state.records.find((entry) => entry.id === card?.dataset.id);
  if (!item) return;
  if (action === 'edit') return openRecordEditor(item);
  if (action === 'open-address') {
    try { await api.openExternal(item.address); } catch (error) { toast(error.message, 'error'); }
    return;
  }
  if (action === 'delete') {
    const confirmed = await showConfirm('删除这项记录？', `“${item.title}”及其加密账号信息会从本地保险库移除。`);
    if (!confirmed) return;
    try {
      await api.deleteRecord(item.id);
      await loadData();
      toast('记录已删除');
    } catch (error) { toast(error.message, 'error'); }
  }
}

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button, .category-button, select, input[type="color"]')) playCrystalClick(event.target.closest('.primary-button') ? 1.15 : .8);
});

$('#categoryNav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  state.selectedCategory = button.dataset.category;
  renderCategoryNav();
  renderRecordList();
});

$('#recordList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button) handleListAction(button);
});

$('#searchInput').addEventListener('input', (event) => {
  state.search = event.target.value.trim();
  renderRecordList();
});

$('#sortSelect').addEventListener('change', (event) => {
  state.sort = event.target.value;
  renderRecordList();
});

$('#subscriptionFilterButton').addEventListener('click', () => {
  state.subscriptionOnly = !state.subscriptionOnly;
  renderRecordList();
});

$('#addRecordButton').addEventListener('click', () => openRecordEditor());
$('#themeButton').addEventListener('click', () => {
  applyInterfaceOpacity(state.preferences.interfaceOpacity);
  openModal('themeModal');
});
$('#interfaceOpacityInput').addEventListener('input', (event) => {
  state.preferences.interfaceOpacity = applyInterfaceOpacity(event.target.value);
});
$('#interfaceOpacityInput').addEventListener('change', async (event) => {
  try {
    state.preferences = await api.updatePreferences({ interfaceOpacity: normalizeInterfaceOpacity(event.target.value) });
    renderPreferences();
    toast('界面透明度已保存');
  } catch (error) {
    await loadData();
    toast(error.message, 'error');
  }
});
$('#resetThemeButton').addEventListener('click', async () => {
  try {
    state.preferences = await api.updatePreferences({ interfaceOpacity: 100 });
    renderPreferences();
    toast('主题已恢复默认');
  } catch (error) {
    await loadData();
    toast(error.message, 'error');
  }
});
$('#passwordInput').addEventListener('input', () => { state.passwordTouched = true; });
$('#hasSubscriptionInput').addEventListener('change', updateSubscriptionFields);

$('#recordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $('button[type="submit"]', event.currentTarget);
  submit.disabled = true;
  const input = {
    title: $('#titleInput').value,
    categoryId: $('#categoryInput').value,
    hasSubscription: $('#hasSubscriptionInput').checked,
    isPrepaid: $('#isPrepaidInput').checked,
    expiresAt: $('#expiryInput').value,
    account: $('#accountInput').value,
    password: $('#passwordInput').value,
    passwordTouched: state.passwordTouched,
    address: $('#addressInput').value,
    amount: $('#amountInput').value,
    currency: $('#currencyInput').value,
    billingCycle: $('#cycleInput').value,
    notes: $('#notesInput').value
  };
  try {
    const editing = Boolean($('#recordId').value);
    await api.saveRecord($('#recordId').value || null, input);
    closeModal('recordModal');
    await loadData();
    toast(editing ? '记录已更新' : '记录已添加');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    submit.disabled = false;
  }
});

$('#manageCategoriesButton').addEventListener('click', () => {
  renderCategoryEditor();
  openModal('categoryModal');
});

$('#categoryEditorList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-category-action]');
  if (!button) return;
  const row = button.closest('.category-editor-row');
  const category = getCategory(row.dataset.categoryId);
  try {
    const action = button.dataset.categoryAction;
    if (action === 'move-up' || action === 'move-down') {
      state.categories = await api.moveCategory(row.dataset.categoryId, action === 'move-up' ? -1 : 1);
      renderAll();
      renderCategoryEditor();
      return;
    }
    if (action === 'save') {
      state.categories = await api.saveCategory({ id: row.dataset.categoryId, name: $('.editor-name', row).value, color: $('.editor-color', row).value });
      renderAll();
      renderCategoryEditor();
      toast('类别已更新');
      return;
    }
    const confirmed = await showConfirm('删除这个类别？', `“${category.name}”中的记录会自动移动到第一个类别。`);
    if (!confirmed) return;
    await api.deleteCategory(row.dataset.categoryId);
    await loadData();
    renderCategoryEditor();
    toast('类别已删除');
  } catch (error) { toast(error.message, 'error'); }
});

$('#categoryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    state.categories = await api.saveCategory({ name: $('#categoryNameInput').value, color: $('#categoryColorInput').value });
    $('#categoryNameInput').value = '';
    renderAll();
    renderCategoryEditor();
    toast('新类别已添加');
  } catch (error) { toast(error.message, 'error'); }
});

$$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
$$('.modal-layer').forEach((layer) => layer.addEventListener('pointerdown', (event) => {
  if (event.target === layer && layer.id !== 'confirmModal') closeModal(layer.id);
}));

$('#confirmCancel').addEventListener('click', () => settleConfirm(false));
$('#confirmAccept').addEventListener('click', () => settleConfirm(true));
$('#minimizeButton').addEventListener('click', () => api.minimize());
$('#closeButton').addEventListener('click', () => api.close());
$('#openDataButton').addEventListener('click', async () => {
  const result = await api.openDataFolder();
  if (result) toast(result, 'error');
});

function setDataMenuOpen(open) {
  $('#dataMenu').hidden = !open;
  $('#dataMenuButton').classList.toggle('active', open);
  $('#dataMenuButton').setAttribute('aria-expanded', String(open));
}

$('#dataMenuButton').addEventListener('click', () => setDataMenuOpen($('#dataMenu').hidden));
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('#dataMenuWrap')) setDataMenuOpen(false);
});

$('#importDataOption').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setDataMenuOpen(false);
  button.disabled = true;
  try {
    const result = await api.importWorkbook();
    if (!result.canceled) {
      await loadData();
      const categoryText = result.categoryCount ? `，新增 ${result.categoryCount} 个类别` : '';
      toast(`已导入 ${result.recordCount} 条记录${categoryText}`);
    }
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
});
$('#exportDataOption').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setDataMenuOpen(false);
  button.disabled = true;
  try {
    const result = await api.exportWorkbook();
    if (!result.canceled) toast(`已导出 ${result.recordCount} 条记录 / ${result.sheetCount} 个类别：${result.fileName}`);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
});
$('#pinButton').addEventListener('click', async () => {
  state.preferences.pinned = await api.setPinned(!state.preferences.pinned);
  renderPreferences();
  toast(state.preferences.pinned ? '窗口将保持悬浮' : '已取消窗口悬浮');
});
$('#soundButton').addEventListener('click', async () => {
  const enabled = !state.preferences.soundEnabled;
  state.preferences = await api.updatePreferences({ soundEnabled: enabled });
  renderPreferences();
  if (enabled) setTimeout(() => playCrystalClick(1.2), 30);
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('#searchInput').focus();
    $('#searchInput').select();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    openRecordEditor();
  }
  if (event.key === 'Escape') {
    if (!$('#confirmModal').hidden) settleConfirm(false);
    else if (!$('#recordModal').hidden) closeModal('recordModal');
    else if (!$('#categoryModal').hidden) closeModal('categoryModal');
    else if (!$('#themeModal').hidden) closeModal('themeModal');
    else setDataMenuOpen(false);
  }
});

const today = new Date();
$('#dateLine').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(today).toUpperCase();

loadData().then(async () => {
  try {
    state.exchangeRates = await api.refreshExchangeRates();
    renderStats();
    renderRecordList();
  } catch {
    // Cached rates remain active when the network service is unavailable.
  }
}).catch((error) => {
  toast(`保险库载入失败：${error.message}`, 'error');
  renderAll();
});
