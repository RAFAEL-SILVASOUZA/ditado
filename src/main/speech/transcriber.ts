import type { ModelDtype } from './model-catalog'
import type { RuntimeDevice } from './devices'

/** O pedaço do `@huggingface/transformers` que usamos (e que os testes substituem por um falso). */
export interface AsrPipelineLike {
  (
    audio: Float32Array,
    options: {
      chunk_length_s: number
      stride_length_s: number
      task: 'transcribe'
      language?: string
    }
  ): Promise<{ text: string } | Array<{ text: string }>>
  dispose?(): Promise<void> | void
}

export interface TransformersModuleLike {
  env: { allowRemoteModels: boolean; allowLocalModels: boolean; localModelPath: string }
  pipeline(
    task: 'automatic-speech-recognition',
    model: string,
    options: { dtype: ModelDtype; device: RuntimeDevice }
  ): Promise<AsrPipelineLike>
}

/** O que o transcritor precisa saber do modelo: a pasta (`id`), a precisão e onde ele deve rodar. */
export interface ModelSpec {
  id: string
  dtype: ModelDtype
  device: RuntimeDevice
}

export interface TranscriberOptions {
  /** Pasta com uma subpasta por modelo (`<dir>/<id>/`). */
  dir: string
  loadModule?: () => Promise<TransformersModuleLike>
  /** Descarrega o modelo da memória depois desse tempo sem uso. */
  idleMs?: number
  /** Avisa quando a GPU falhou e o modelo foi para a CPU (vai para o log). */
  onFallback?: (spec: ModelSpec, err: unknown) => void
}

export interface Transcription {
  text: string
  usedFallback: boolean
}

/** Mais que o ditado do chat: aqui o modelo fica pronto entre um atalho e outro. */
const IDLE_UNLOAD_MS = 15 * 60_000
/** O Whisper enxerga janelas de 30 s; áudios maiores são partidos com uma sobreposição de 5 s. */
const CHUNK_SECONDS = 30
const STRIDE_SECONDS = 5

const describe = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * Fala para texto local (Whisper via transformers.js/ONNX). Carrega o modelo no primeiro uso, no device que
 * o catálogo pede; se a GPU falhar (ao carregar ou na primeira transcrição), recarrega o mesmo modelo na CPU e
 * segue nela enquanto ele estiver carregado. Descarrega quando fica parado ou quando outro modelo é pedido.
 * Uma transcrição por vez: as seguintes esperam a anterior terminar.
 */
export function createTranscriber({
  dir,
  loadModule = () =>
    import('@huggingface/transformers') as unknown as Promise<TransformersModuleLike>,
  idleMs = IDLE_UNLOAD_MS,
  onFallback
}: TranscriberOptions) {
  let loaded: { key: string; asr: AsrPipelineLike; fallback: boolean } | null = null
  let queue: Promise<unknown> = Promise.resolve()
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  const keyOf = (spec: ModelSpec): string => `${spec.id}:${spec.dtype}:${spec.device}`

  async function unload(): Promise<void> {
    clearTimeout(idleTimer)
    const current = loaded
    loaded = null
    await current?.asr.dispose?.()
  }

  async function module(): Promise<TransformersModuleLike> {
    const mod = await loadModule().catch((err: unknown) => {
      if ((err as { code?: string } | null)?.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error(
          'o motor de voz (@huggingface/transformers) não está neste build do app; rode "npm install" e gere o app de novo'
        )
      }
      throw err
    })
    // só arquivos locais: o download é feito (e acompanhado) pelo gerenciador de modelos
    mod.env.allowRemoteModels = false
    mod.env.allowLocalModels = true
    mod.env.localModelPath = dir
    return mod
  }

  async function load(spec: ModelSpec, device: RuntimeDevice): Promise<AsrPipelineLike> {
    const mod = await module()
    return mod.pipeline('automatic-speech-recognition', spec.id, { dtype: spec.dtype, device })
  }

  async function fallBackToCpu(spec: ModelSpec, err: unknown): Promise<AsrPipelineLike> {
    onFallback?.(spec, err)
    await unload()
    const asr = await load(spec, 'cpu')
    loaded = { key: keyOf(spec), asr, fallback: true }
    return asr
  }

  async function ensure(spec: ModelSpec): Promise<AsrPipelineLike> {
    if (loaded?.key === keyOf(spec)) return loaded.asr
    await unload()
    try {
      const asr = await load(spec, spec.device)
      loaded = { key: keyOf(spec), asr, fallback: false }
      return asr
    } catch (err) {
      if (spec.device === 'cpu') throw err
      return fallBackToCpu(spec, err)
    }
  }

  async function infer(asr: AsrPipelineLike, audio: Float32Array, language?: string): Promise<string> {
    // o pipeline não detecta o idioma: sem `language` ele assume inglês
    const result = await asr(audio, {
      chunk_length_s: CHUNK_SECONDS,
      stride_length_s: STRIDE_SECONDS,
      task: 'transcribe',
      ...(language ? { language } : {})
    })
    const text = Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text
    return text.trim()
  }

  async function run(spec: ModelSpec, audio: Float32Array, language?: string): Promise<Transcription> {
    try {
      let asr = await ensure(spec)
      try {
        return { text: await infer(asr, audio, language), usedFallback: loaded?.fallback ?? false }
      } catch (err) {
        // alguns drivers carregam o modelo e só quebram ao executar: tenta de novo na CPU
        if (spec.device === 'cpu' || loaded?.fallback) throw err
        asr = await fallBackToCpu(spec, err)
        return { text: await infer(asr, audio, language), usedFallback: true }
      }
    } catch (err) {
      throw new Error(`Falha ao transcrever o áudio: ${describe(err)}`)
    } finally {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => void unload(), idleMs)
      idleTimer.unref?.()
    }
  }

  return {
    /** Texto falado em `audio` (mono, 16 kHz, amostras entre -1 e 1) no idioma `language` (código ISO, ex.: pt). */
    transcribe(spec: ModelSpec, audio: Float32Array, language?: string): Promise<Transcription> {
      const result = queue.then(() => run(spec, audio, language))
      queue = result.catch(() => undefined)
      return result
    },

    /** Carrega o modelo antes da primeira fala, para o primeiro ditado não esperar o carregamento. */
    warmUp(spec: ModelSpec): Promise<void> {
      const result = queue.then(() => ensure(spec)).then(() => undefined)
      queue = result.catch(() => undefined)
      return result
    },

    /** Libera o modelo da memória (modelo removido, app fechando). */
    async unload(): Promise<void> {
      await queue.catch(() => undefined)
      await unload()
    }
  }
}

export type Transcriber = ReturnType<typeof createTranscriber>
