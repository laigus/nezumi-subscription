'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, net, Notification, safeStorage, shell } = require('electron');
const { expiryState, isSafeWebAddress, localDateKey } = require('../shared/domain.cjs');
const { EXCHANGE_RATE_URL, exchangeRatesNeedRefresh, parseFrankfurterRates } = require('../shared/exchange-rates.cjs');
const { readReadableWorkbook, writeReadableWorkbook } = require('../shared/workbook.cjs');
const { roundedWindowShape } = require('../shared/window-shape.cjs');
const { VaultStore } = require('./store.cjs');

// Electron's Windows GPU compositor can turn a large transparent surface into
// an opaque black swap chain. Software compositing preserves per-pixel alpha.
app.disableHardwareAcceleration();

let mainWindow = null;
let vault = null;
const WINDOW_RADIUS = 28;
const WINDOW_WIDTH = 1288;
const WINDOW_HEIGHT = 868;
const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
const EXCHANGE_RATE_TIMEOUT_MS = 6000;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function applyNativeWindowShape(window, radius = WINDOW_RADIUS) {
  const [width, height] = window.getSize();
  const rectangles = roundedWindowShape(width, height, radius);
  window.setShape(rectangles);
  window.__nativeShape = rectangles;
}

function settleNativeWindowSurface(window, radius = WINDOW_RADIUS) {
  // A transparent frameless HWND can retain its creation-time DWM rectangle
  // until its first position change. Settle that state while the window is
  // still hidden so the native rectangular border/shadow never becomes visible.
  window.setHasShadow(false);
  applyNativeWindowShape(window, radius);
  const { x, y } = window.getBounds();
  window.setPosition(x + 1, y, false);
  window.setPosition(x, y, false);
  window.setHasShadow(false);
}

function createWindow() {
  const pinned = Boolean(vault.data.preferences.pinned);
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'none',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: pinned,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    title: '账耗',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  // Keep the interactive HWND transparent and draw the shell in the renderer.
  mainWindow.setBackgroundMaterial('none');
  mainWindow.setBackgroundColor('#00000000');
  mainWindow.setHasShadow(false);
  applyNativeWindowShape(mainWindow);
  mainWindow.on('resize', () => applyNativeWindowShape(mainWindow));

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    settleNativeWindowSurface(mainWindow);
    mainWindow.show();
    mainWindow.focus();
    setTimeout(showExpiryNotification, 1200);
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeWebAddress(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showExpiryNotification() {
  if (!Notification.isSupported() || !vault) return;
  const today = localDateKey();
  if (vault.data.preferences.lastNotifiedDate === today) return;
  const reminderDays = vault.data.preferences.reminderDays;
  const due = vault.bootstrap().records
    .filter((item) => item.hasSubscription)
    .map((item) => ({ ...item, status: expiryState(item.expiresAt, reminderDays) }))
    .filter((item) => ['expired', 'urgent', 'soon'].includes(item.status.level));
  if (!due.length) return;
  const urgent = due.filter((item) => ['expired', 'urgent'].includes(item.status.level)).length;
  const detail = urgent ? `${urgent} 项已到期或 3 天内到期` : `最近一项：${due[0].title}`;
  const notice = new Notification({
    title: `账耗 · ${due.length} 项需要留意`,
    body: detail,
    silent: false
  });
  notice.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  notice.show();
  vault.updatePreferences({ lastNotifiedDate: today });
}

async function refreshExchangeRates() {
  const cached = structuredClone(vault.data.exchangeRates);
  if (!exchangeRatesNeedRefresh(cached)) return { ...cached, usingCache: true };
  if (!net.isOnline()) return { ...cached, usingCache: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXCHANGE_RATE_TIMEOUT_MS);
  try {
    const response = await net.fetch(EXCHANGE_RATE_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = parseFrankfurterRates(await response.json());
    return { ...vault.saveExchangeRates(next), usingCache: false };
  } catch {
    return { ...cached, usingCache: true };
  } finally {
    clearTimeout(timeout);
  }
}

function registerIpc() {
  ipcMain.handle('vault:bootstrap', () => vault.bootstrap());
  ipcMain.handle('vault:record:save', (_event, id, value) => vault.saveRecord(id, value));
  ipcMain.handle('vault:record:delete', (_event, id) => vault.deleteRecord(id));
  ipcMain.handle('vault:category:save', (_event, value) => vault.saveCategory(value));
  ipcMain.handle('vault:category:delete', (_event, id) => vault.deleteCategory(id));
  ipcMain.handle('vault:category:move', (_event, id, offset) => vault.moveCategory(id, offset));
  ipcMain.handle('vault:preferences:update', (_event, value) => vault.updatePreferences(value));
  ipcMain.handle('exchange-rates:refresh', () => refreshExchangeRates());
  ipcMain.handle('app:open-external', async (_event, value) => {
    if (!isSafeWebAddress(value)) throw new Error('地址需要以 http:// 或 https:// 开头');
    await shell.openExternal(value);
    return true;
  });
  ipcMain.handle('app:open-data-folder', async () => shell.openPath(path.dirname(vault.dataFile)));
  ipcMain.handle('vault:export-workbook', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出账号与订阅表格',
      buttonLabel: '保存 XLSX',
      defaultPath: path.join(app.getPath('documents'), `账耗-明文导出-${localDateKey()}.xlsx`),
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const exportPath = path.extname(result.filePath).toLowerCase() === '.xlsx' ? result.filePath : `${result.filePath}.xlsx`;
    const data = vault.bootstrap();
    try {
      const exported = await writeReadableWorkbook(exportPath, data);
      return {
        canceled: false,
        fileName: path.basename(exportPath),
        filePath: exportPath,
        ...exported
      };
    } catch (error) {
      throw new Error(`导出失败：${error.message}`);
    }
  });
  ipcMain.handle('vault:import-workbook', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '从表格导入账号与订阅',
      buttonLabel: '导入 XLSX',
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const importPath = result.filePaths[0];
    try {
      const stat = await fs.promises.stat(importPath);
      if (stat.size > MAX_IMPORT_FILE_BYTES) throw new Error('表格不能超过 25 MB');
      const parsed = await readReadableWorkbook(importPath);
      const imported = vault.importRecords(parsed);
      return {
        canceled: false,
        fileName: path.basename(importPath),
        ignoredSheetCount: parsed.ignoredSheetCount,
        ...imported
      };
    } catch (error) {
      throw new Error(`导入失败：${error.message}`);
    }
  });
  ipcMain.handle('window:set-pinned', (_event, value) => {
    const pinned = Boolean(value);
    mainWindow?.setAlwaysOnTop(pinned, 'normal');
    vault.updatePreferences({ pinned });
    return pinned;
  });
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:close', () => mainWindow?.close());
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  vault = new VaultStore({
    dataFile: path.join(app.getPath('userData'), 'vault.json'),
    safeStorage
  });
  try {
    vault.load();
  } catch (error) {
    console.error(error);
  }
  registerIpc();
  createWindow();
  setInterval(showExpiryNotification, 4 * 60 * 60 * 1000).unref();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && vault) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
