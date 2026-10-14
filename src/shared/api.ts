import type {
  IpcResult,
  MicrophoneAccess,
  OverlayCommand,
  Settings,
  SpeechDownloadEvent,
  SpeechModelInfo,
  TranscriptionResult
} from './types'

export interface DeliverResult {
  /** O Ctrl+V / ⌘V foi enviado (falso: o texto só ficou na área de transferência). */
  pasted: boolean
  /** Motivo de não ter colado, quando a colagem estava ligada. */
  warning?: string
}

export interface DitadoApi {
  settings: {
    get(): Promise<IpcResult<Settings>>
    set(patch: Partial<Omit<Settings, 'shortcut'>>): Promise<IpcResult<Settings>>
    /** Troca o atalho global; falha se o sistema ou outro app já usa a combinação. */
    setShortcut(accelerator: string): Promise<IpcResult<Settings>>
    /** Solta o atalho enquanto o usuário grava um novo (senão ele dispara em vez de ser capturado). */
    suspendShortcut(suspended: boolean): Promise<IpcResult<null>>
    systemLanguage(): Promise<IpcResult<string>>
  }
  models: {
    list(): Promise<IpcResult<SpeechModelInfo[]>>
    download(id: string): Promise<IpcResult<null>>
    cancel(id: string): Promise<IpcResult<null>>
    remove(id: string): Promise<IpcResult<null>>
    onEvent(callback: (event: SpeechDownloadEvent) => void): () => void
  }
  speech: {
    requestMicrophone(): Promise<IpcResult<MicrophoneAccess>>
    transcribe(audio: Float32Array): Promise<IpcResult<TranscriptionResult>>
  }
  overlay: {
    onCommand(callback: (command: OverlayCommand) => void): () => void
    /** Entrega o texto (área de transferência + colar) e esconde a janelinha. */
    deliver(text: string): Promise<IpcResult<DeliverResult>>
    /** Esconde a janelinha sem entregar nada. */
    dismiss(): Promise<IpcResult<null>>
    /** Altura da janelinha conforme o conteúdo (mensagens de erro ocupam duas linhas). */
    resize(height: number): Promise<IpcResult<null>>
    /** Mostra a janelinha de novo (sem foco) para um aviso depois da entrega. */
    reveal(): Promise<IpcResult<null>>
  }
  openSettings(tab?: 'shortcut' | 'models' | 'general'): Promise<IpcResult<null>>
}
