const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('get-init'),
  getHistory: (code) => ipcRenderer.invoke('get-history', code),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (c) => ipcRenderer.invoke('save-config', c),
  addRoom: (r) => ipcRenderer.invoke('add-room', r),
  updateRoom: (code, r) => ipcRenderer.invoke('update-room', code, r),
  leaveRoom: (code) => ipcRenderer.invoke('leave-room', code),
  sendChat: (code, text) => ipcRenderer.send('send-chat', code, text),
  setActive: (code) => ipcRenderer.send('set-active', code),
  setDesk: (code) => ipcRenderer.send('set-desk', code),
  openRoom: (code) => ipcRenderer.send('open-room', code),
  hideChat: () => ipcRenderer.send('hide-chat'),
  copyText: (text) => ipcRenderer.send('copy-text', text),
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  onRooms: (cb) => ipcRenderer.on('rooms', (_e, d) => cb(d)),
  onChat: (cb) => ipcRenderer.on('chat', (_e, d) => cb(d)),
  onStatus: (cb) => ipcRenderer.on('status', (_e, d) => cb(d)),
  onOpenRoom: (cb) => ipcRenderer.on('open-room', (_e, d) => cb(d)),
});
