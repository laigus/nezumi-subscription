'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('subscriptionAPI', {
  bootstrap: () => ipcRenderer.invoke('vault:bootstrap'),
  saveRecord: (id, value) => ipcRenderer.invoke('vault:record:save', id, value),
  deleteRecord: (id) => ipcRenderer.invoke('vault:record:delete', id),
  saveCategory: (value) => ipcRenderer.invoke('vault:category:save', value),
  deleteCategory: (id) => ipcRenderer.invoke('vault:category:delete', id),
  moveCategory: (id, offset) => ipcRenderer.invoke('vault:category:move', id, offset),
  updatePreferences: (value) => ipcRenderer.invoke('vault:preferences:update', value),
  refreshExchangeRates: () => ipcRenderer.invoke('exchange-rates:refresh'),
  exportWorkbook: () => ipcRenderer.invoke('vault:export-workbook'),
  importWorkbook: () => ipcRenderer.invoke('vault:import-workbook'),
  openExternal: (value) => ipcRenderer.invoke('app:open-external', value),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  setPinned: (value) => ipcRenderer.invoke('window:set-pinned', value),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close')
});
