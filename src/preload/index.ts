import { contextBridge, ipcRenderer } from 'electron'
import type { DitadoApi } from '../shared/api'
import { IpcChannels } from '../shared/ipc-channels'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: DitadoApi & { platform: NodeJS.Platform; onSettingsTab(cb: (tab: string) => void): () => void } = {
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.settingsSet, patch),
    setShortcut: (accelerator) => ipcRenderer.invoke(IpcChannels.shortcutSet, accelerator),
    suspendShortcut: (suspended) => ipcRenderer.invoke(IpcChannels.shortcutSuspend, suspended),
    systemLanguage: () => ipcRenderer.invoke(IpcChannels.systemLanguage)
  },
  models: {
    list: () => ipcRenderer.invoke(IpcChannels.modelsList),
    download: (id) => ipcRenderer.invoke(IpcChannels.modelsDownload, id),
    cancel: (id) => ipcRenderer.invoke(IpcChannels.modelsCancel, id),
    remove: (id) => ipcRenderer.invoke(IpcChannels.modelsRemove, id),
    onEvent: (callback) => subscribe(IpcChannels.modelsEvent, callback)
  },
  speech: {
    requestMicrophone: () => ipcRenderer.invoke(IpcChannels.requestMicrophone),
    transcribe: (audio) => ipcRenderer.invoke(IpcChannels.transcribe, audio)
  },
  overlay: {
    onCommand: (callback) => subscribe(IpcChannels.overlayCommand, callback),
    deliver: (text) => ipcRenderer.invoke(IpcChannels.overlayDeliver, text),
    dismiss: () => ipcRenderer.invoke(IpcChannels.overlayDismiss),
    resize: (height) => ipcRenderer.invoke(IpcChannels.overlayResize, height),
    reveal: () => ipcRenderer.invoke(IpcChannels.overlayReveal)
  },
  openSettings: (tab) => ipcRenderer.invoke(IpcChannels.openSettings, tab),
  onSettingsTab: (callback) => subscribe('settings.tab', callback)
}

contextBridge.exposeInMainWorld('api', api)
