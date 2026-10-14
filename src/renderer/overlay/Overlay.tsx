import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, Settings as SettingsIcon, X } from 'lucide-react'
import type { OverlayCommand } from '@shared/types'
import { useRecorder } from './use-recorder'

export type Phase = 'idle' | 'starting' | 'recording' | 'transcribing' | 'message'

interface Message {
  text: string
  /** Mostra o botão que abre as configurações (falta escolher/baixar o modelo). */
  openSettings?: boolean
}

/** Avisos somem sozinhos depois disso; os que pedem uma ação (configurar o modelo) ficam até o ✕ ou o Esc. */
const MESSAGE_MS = 5_000
const BASE_HEIGHT = 44
const MESSAGE_HEIGHT = 64

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties
const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties

const iconButton =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-text transition-colors hover:bg-white/20'

/**
 * A janelinha flutuante. O main só manda `toggle` (o atalho) e `cancel` (o Esc); o resto é decidido aqui:
 * toggle parado → grava; toggle gravando → transcreve e entrega; cancel → descarta e esconde.
 */
export default function Overlay() {
  const recorder = useRecorder()
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [message, setMessage] = useState<Message | null>(null)
  // o assinante do IPC é criado uma vez: lê a fase atual pela ref
  const phaseRef = useRef<Phase>('idle')
  // cada ditado ganha um número; um resultado que chega depois de cancelado é ignorado
  const session = useRef(0)
  const messageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])

  const close = useCallback(() => {
    clearTimeout(messageTimer.current)
    setMessage(null)
    setPhase('idle')
    void window.api.overlay.resize(BASE_HEIGHT)
    void window.api.overlay.dismiss()
  }, [setPhase])

  const show = useCallback(
    (next: Message, reveal = false) => {
      clearTimeout(messageTimer.current)
      setMessage(next)
      setPhase('message')
      void window.api.overlay.resize(MESSAGE_HEIGHT)
      if (reveal) void window.api.overlay.reveal()
      if (!next.openSettings) messageTimer.current = setTimeout(close, MESSAGE_MS)
    },
    [close, setPhase]
  )

  const begin = useCallback(async () => {
    const id = ++session.current
    clearTimeout(messageTimer.current)
    setMessage(null)
    void window.api.overlay.resize(BASE_HEIGHT)
    setPhase('starting')
    const settings = await window.api.settings.get()
    if (id !== session.current) return
    if (settings.ok && !settings.data.modelId) {
      show({ text: 'Escolha e baixe um modelo de voz para começar.', openSettings: true })
      return
    }
    try {
      await recorder.start()
      if (id !== session.current) {
        await recorder.cancel()
        return
      }
      setPhase('recording')
    } catch (err) {
      show({ text: err instanceof Error ? err.message : String(err) })
    }
  }, [recorder, setPhase, show])

  const confirm = useCallback(async () => {
    if (phaseRef.current !== 'recording') return
    const id = session.current
    setPhase('transcribing')
    try {
      const audio = await recorder.stop()
      if (id !== session.current) return
      if (audio.length === 0) {
        close()
        return
      }
      const result = await window.api.speech.transcribe(audio)
      if (id !== session.current) return
      if (!result.ok) {
        show({ text: result.error.message, openSettings: result.error.code === 'VALIDATION' || result.error.code === 'NOT_FOUND' })
        return
      }
      if (!result.data.text) {
        show({ text: 'Nenhuma fala reconhecida.' })
        return
      }
      const delivered = await window.api.overlay.deliver(result.data.text)
      setPhase('idle')
      const warnings = [
        delivered.ok ? delivered.data.warning : delivered.error.message,
        result.data.usedFallback ? 'A GPU não carregou o modelo; a transcrição rodou na CPU.' : undefined
      ].filter(Boolean)
      if (warnings.length > 0) show({ text: warnings.join(' ') }, true)
    } catch (err) {
      if (id === session.current) show({ text: err instanceof Error ? err.message : String(err) })
    }
  }, [close, recorder, setPhase, show])

  const cancel = useCallback(async () => {
    session.current++
    if (phaseRef.current === 'recording' || phaseRef.current === 'starting') await recorder.cancel()
    close()
  }, [close, recorder])

  useEffect(
    () =>
      window.api.overlay.onCommand((command: OverlayCommand) => {
        if (command === 'cancel') {
          void cancel()
          return
        }
        const current = phaseRef.current
        if (current === 'idle' || current === 'message') void begin()
        else if (current === 'recording') void confirm()
        // começando ou transcrevendo: o atalho espera
      }),
    [begin, cancel, confirm]
  )

  useEffect(() => () => clearTimeout(messageTimer.current), [])

  return (
    <div
      data-testid="overlay"
      data-phase={phase}
      style={drag}
      className="flex h-full w-full items-center gap-2 rounded-lg border border-white/10 bg-[#0b0b0b]/95 px-3 text-text select-none"
    >
      <div className="flex min-w-0 flex-1 items-center justify-center gap-[2px] overflow-hidden">
        {phase === 'recording' &&
          recorder.levels.map((level, index) => (
            <span
              key={index}
              className="w-[2px] shrink-0 rounded-full bg-muted"
              style={{ height: `${Math.max(2, Math.round(level * 22))}px` }}
            />
          ))}
        {(phase === 'starting' || phase === 'transcribing') && (
          <span className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={14} className="animate-spin" />
            {phase === 'starting' ? 'Abrindo o microfone…' : 'Transcrevendo…'}
          </span>
        )}
        {phase === 'message' && message && (
          <span role="alert" className="line-clamp-2 text-xs leading-snug text-text">
            {message.text}
          </span>
        )}
      </div>

      {phase === 'message' && message?.openSettings && (
        <button
          type="button"
          style={noDrag}
          aria-label="Abrir configurações"
          data-testid="overlay-settings"
          className={iconButton}
          onClick={() => {
            void window.api.openSettings('models')
            close()
          }}
        >
          <SettingsIcon size={13} />
        </button>
      )}
      <button
        type="button"
        style={noDrag}
        aria-label="Cancelar"
        data-testid="overlay-cancel"
        className={iconButton}
        onClick={() => void cancel()}
      >
        <X size={13} />
      </button>
      {phase === 'recording' && (
        <button
          type="button"
          style={noDrag}
          aria-label="Confirmar"
          data-testid="overlay-confirm"
          className={iconButton}
          onClick={() => void confirm()}
        >
          <Check size={13} />
        </button>
      )}
    </div>
  )
}
