import { useCallback, useEffect, useRef, useState } from 'react'

/** O Whisper trabalha com áudio mono de 16 kHz. */
const SAMPLE_RATE = 16_000
/** Quantas barras a onda mostra e de quanto em quanto tempo ela anda. */
export const WAVE_BARS = 48
const WAVE_TICK_MS = 60

/** Decodifica o que o MediaRecorder gravou para amostras mono de 16 kHz (o AudioContext reamostra). */
async function decodeRecording(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    return buffer.getChannelData(0)
  } finally {
    void context.close()
  }
}

const silence = (): number[] => new Array<number>(WAVE_BARS).fill(0)

/**
 * Gravação do microfone (do ditado do Agent Platform): `start` abre o microfone; `stop` encerra e devolve as
 * amostras prontas para o Whisper; `cancel` descarta. `levels` traz o volume recente (0 a 1, da mais antiga para
 * a mais nova) para desenhar a onda. Falhas viram exceções com mensagem pronta para mostrar.
 */
export function useRecorder() {
  const [levels, setLevels] = useState<number[]>(silence)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const meter = useRef<{ timer: ReturnType<typeof setInterval>; context: AudioContext } | null>(null)

  const stopMeter = useCallback(() => {
    if (meter.current) {
      clearInterval(meter.current.timer)
      void meter.current.context.close().catch(() => undefined)
      meter.current = null
    }
    setLevels(silence())
  }, [])

  const release = useCallback(() => {
    recorder.current?.stream.getTracks().forEach((track) => track.stop())
    recorder.current = null
    stopMeter()
  }, [stopMeter])

  useEffect(() => release, [release])

  /** Mede o volume do microfone para a onda; se não der, a onda fica parada. */
  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2
        // a voz normal fica em ~0,05-0,3 de RMS: realça para a onda ocupar a altura
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 4)
        setLevels((current) => [...current.slice(1), level])
      }, WAVE_TICK_MS)
      meter.current = { timer, context }
    } catch {
      meter.current = null
    }
  }, [])

  const start = useCallback(async (): Promise<void> => {
    // No macOS o app precisa da permissão do sistema antes; negada, a gravação nem chega a abrir.
    const access = await window.api.speech.requestMicrophone()
    if (access.ok && access.data !== 'granted') {
      throw new Error(
        access.data === 'restricted'
          ? 'O sistema bloqueia o microfone neste computador.'
          : 'Microfone negado. Ative o Ditado em Ajustes > Privacidade e Segurança > Microfone.'
      )
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      throw new Error('Não foi possível acessar o microfone.')
    }
    const next = new MediaRecorder(stream)
    chunks.current = []
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data)
    }
    next.start()
    recorder.current = next
    startMeter(stream)
  }, [startMeter])

  /** Encerra a gravação e espera o MediaRecorder entregar o último pedaço. */
  const finish = useCallback(
    async (active: MediaRecorder): Promise<Blob> => {
      const stopped = new Promise<void>((resolve) => {
        active.onstop = () => resolve()
      })
      active.stop()
      await stopped
      release()
      const blob = new Blob(chunks.current, { type: active.mimeType })
      chunks.current = []
      return blob
    },
    [release]
  )

  /** Amostras mono 16 kHz do que foi gravado (vazio se nada foi gravado). */
  const stop = useCallback(async (): Promise<Float32Array> => {
    const active = recorder.current
    if (!active) return new Float32Array(0)
    const blob = await finish(active)
    if (blob.size === 0) return new Float32Array(0)
    return decodeRecording(blob)
  }, [finish])

  const cancel = useCallback(async (): Promise<void> => {
    const active = recorder.current
    if (active) await finish(active)
  }, [finish])

  return { levels, start, stop, cancel }
}
