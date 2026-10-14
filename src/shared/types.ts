/** Resposta de toda chamada IPC: dado ou erro com mensagem pronta para mostrar. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

/** Em que hardware o modelo foi preparado para rodar. */
export type ModelTier = 'cpu' | 'gpu-small' | 'gpu-large'

export interface SpeechModelInfo {
  id: string
  name: string
  description: string
  tier: ModelTier
  sizeBytes: number
  installed: boolean
  downloading?: { receivedBytes: number; totalBytes: number }
}

export interface SpeechDownloadEvent {
  id: string
  status: 'progress' | 'done' | 'error' | 'cancelled'
  receivedBytes: number
  totalBytes: number
  error?: string
}

export interface TranscriptionResult {
  text: string
  /** A GPU falhou ao carregar o modelo e a transcrição rodou na CPU. */
  usedFallback: boolean
}

export type MicrophoneAccess = 'granted' | 'denied' | 'restricted'

export interface Settings {
  /** Acelerador do Electron (ex.: CommandOrControl+Shift+Space). */
  shortcut: string
  modelId: string | null
  /** Código ISO (pt, en...); `null` usa o idioma do sistema. */
  language: string | null
  /** Simula Ctrl+V / ⌘V depois de pôr o texto na área de transferência. */
  autoPaste: boolean
  openAtLogin: boolean
  overlayPosition: { x: number; y: number } | null
}

/** O que a janelinha recebe do main. */
export type OverlayCommand = 'toggle' | 'cancel'
