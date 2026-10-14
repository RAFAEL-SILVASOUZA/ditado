import { BrowserWindow, app, clipboard } from 'electron'
import { join } from 'node:path'
import { formatAccelerator } from '../shared/accelerator'
import { IpcChannels } from '../shared/ipc-channels'
import type { OverlayCommand, Settings } from '../shared/types'
import { AppError } from './errors'
import { handle } from './ipc'
import { createSettingsStore } from './settings'
import { createShortcuts } from './shortcuts'
import { runtimeDevice } from './speech/devices'
import { SPEECH_CATALOG } from './speech/model-catalog'
import { createSpeechModelManager } from './speech/model-manager'
import { createTranscriber, type ModelSpec } from './speech/transcriber'
import { deliverText } from './system/paste'
import { canControlKeyboard, microphoneAccess } from './system/permissions'
import { createTray } from './tray'
import { OVERLAY_HEIGHT, OVERLAY_WIDTH, createOverlayWindow, overlayBounds, showSettingsWindow } from './windows'

// Windows deixa ELECTRON_RUN_AS_NODE no ambiente de alguns terminais; o app não deve herdar isso.
delete process.env.ELECTRON_RUN_AS_NODE

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void app.whenReady().then(start)
}

/** 10 minutos de fala a 16 kHz: folga de sobra para um ditado. */
const MAX_AUDIO_SAMPLES = 16_000 * 60 * 10

function start(): void {
  if (process.platform === 'darwin') app.dock?.hide()
  if (process.platform === 'win32') app.setAppUserModelId('com.ditado.app')

  const dataDir = app.getPath('userData')
  const settings = createSettingsStore(join(dataDir, 'settings.json'))
  const modelsDir = join(dataDir, 'models')

  const broadcast = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }

  const models = createSpeechModelManager({
    dir: modelsDir,
    emit: (event) => broadcast(IpcChannels.modelsEvent, event)
  })
  const transcriber = createTranscriber({
    dir: modelsDir,
    onFallback: (spec, err) => console.warn(`[speech] ${spec.id} falhou em ${spec.device}; usando a CPU`, err)
  })

  /** O modelo escolhido, pronto para o transcritor; erro com mensagem para a janelinha se não houver. */
  function chosenSpec(): ModelSpec {
    const id = settings.get().modelId
    const entry = SPEECH_CATALOG.find((m) => m.id === id)
    if (!entry) throw new AppError('VALIDATION', 'Escolha um modelo de voz nas configurações.')
    if (!models.isInstalled(entry.id))
      throw new AppError('NOT_FOUND', 'O modelo de voz escolhido não está instalado.')
    return { id: entry.id, dtype: entry.dtype, device: runtimeDevice(entry.device) }
  }

  /** Idioma da fala: o escolhido ou o do sistema (pt-BR → pt). Sem ele o Whisper assume inglês. */
  const systemLanguage = (): string => app.getSystemLocale().split('-')[0].toLowerCase() || 'en'
  const language = (): string => settings.get().language ?? systemLanguage()

  // --- janelinha -------------------------------------------------------------------------------------
  const overlay = createOverlayWindow((position) => settings.set({ overlayPosition: position }))

  const sendToOverlay = (command: OverlayCommand): void => {
    if (!overlay.isDestroyed()) overlay.webContents.send(IpcChannels.overlayCommand, command)
  }

  function hideOverlay(): void {
    shortcuts.setEscape(false)
    if (!overlay.isDestroyed() && overlay.isVisible()) overlay.hide()
  }

  function toggleDictation(): void {
    if (overlay.isDestroyed()) return
    if (!overlay.isVisible()) {
      const { x, y } = overlayBounds(settings.get().overlayPosition)
      overlay.setBounds({ x, y, width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT })
      overlay.showInactive()
      shortcuts.setEscape(true)
      // carrega o modelo enquanto o usuário fala: o primeiro ditado não espera o carregamento
      try {
        void transcriber.warmUp(chosenSpec()).catch(() => undefined)
      } catch {
        // sem modelo: a janelinha mostra o aviso
      }
    }
    sendToOverlay('toggle')
  }

  const shortcuts = createShortcuts({
    onToggle: toggleDictation,
    onCancel: () => sendToOverlay('cancel')
  })

  // --- IPC -------------------------------------------------------------------------------------------
  handle(IpcChannels.settingsGet, () => settings.get())
  handle(IpcChannels.settingsSet, (patch: Partial<Settings>) => {
    const { shortcut: _ignored, ...rest } = (patch ?? {}) as Partial<Settings>
    const next = settings.set(rest)
    if (typeof rest.openAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: rest.openAtLogin })
    return next
  })
  handle(IpcChannels.shortcutSet, (accelerator: string) => {
    shortcuts.set(String(accelerator))
    const next = settings.set({ shortcut: String(accelerator) })
    tray.refresh()
    return next
  })
  handle(IpcChannels.shortcutSuspend, (value: boolean) => {
    shortcuts.suspend(Boolean(value))
    return null
  })
  handle(IpcChannels.systemLanguage, () => systemLanguage())

  handle(IpcChannels.modelsList, () => models.list())
  handle(IpcChannels.modelsDownload, (id: string) => {
    models.download(String(id))
    return null
  })
  handle(IpcChannels.modelsCancel, (id: string) => {
    models.cancel(String(id))
    return null
  })
  handle(IpcChannels.modelsRemove, async (id: string) => {
    const modelId = String(id)
    // os arquivos ficam abertos enquanto o modelo está carregado (no Windows, não dá para apagar)
    await transcriber.unload()
    models.remove(modelId)
    if (settings.get().modelId === modelId) settings.set({ modelId: null })
    return null
  })

  handle(IpcChannels.requestMicrophone, () => microphoneAccess())
  handle(IpcChannels.transcribe, async (audio: unknown) => {
    const spec = chosenSpec()
    const samples =
      audio instanceof Float32Array ? audio : audio instanceof ArrayBuffer ? new Float32Array(audio) : null
    if (!samples) throw new AppError('VALIDATION', 'Áudio inválido.')
    if (samples.length === 0) return { text: '', usedFallback: false }
    if (samples.length > MAX_AUDIO_SAMPLES)
      throw new AppError('TOO_LARGE', 'Áudio longo demais (máximo de 10 minutos).')
    return transcriber.transcribe(spec, samples, language())
  })

  handle(IpcChannels.overlayDeliver, async (text: string) => {
    hideOverlay()
    const value = String(text ?? '').trim()
    if (!value) return { pasted: false }
    return deliverText(value, settings.get().autoPaste, {
      writeClipboard: (t) => clipboard.writeText(t),
      canControlKeyboard
    })
  })
  handle(IpcChannels.overlayDismiss, () => {
    hideOverlay()
    return null
  })
  handle(IpcChannels.overlayResize, (height: number) => {
    const value = Math.max(OVERLAY_HEIGHT, Math.min(160, Math.round(Number(height) || OVERLAY_HEIGHT)))
    if (!overlay.isDestroyed()) {
      const [x, y] = overlay.getPosition()
      overlay.setBounds({ x, y, width: OVERLAY_WIDTH, height: value })
    }
    return null
  })
  handle(IpcChannels.overlayReveal, () => {
    if (!overlay.isDestroyed() && !overlay.isVisible()) {
      overlay.showInactive()
      shortcuts.setEscape(true)
    }
    return null
  })
  handle(IpcChannels.openSettings, (tab?: string) => {
    showSettingsWindow(typeof tab === 'string' ? tab : undefined)
    return null
  })

  // --- bandeja, atalho e primeira execução -----------------------------------------------------------
  const label = (): string => formatAccelerator(shortcuts.current ?? settings.get().shortcut, process.platform)
  const tray = createTray({
    dictate: toggleDictation,
    settings: () => showSettingsWindow(),
    shortcutLabel: label
  })

  try {
    shortcuts.set(settings.get().shortcut)
  } catch {
    // atalho salvo em uso por outro app: o usuário escolhe outro nas configurações
    showSettingsWindow('shortcut')
  }
  tray.refresh()

  if (!settings.get().modelId) showSettingsWindow('models')

  app.on('second-instance', () => showSettingsWindow())
  // app de bandeja: fechar as configurações não encerra
  app.on('window-all-closed', () => undefined)
  app.on('will-quit', () => {
    shortcuts.setEscape(false)
    void transcriber.unload()
  })
}
