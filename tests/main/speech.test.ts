// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SpeechDownloadEvent } from '../../src/shared/types'
import { SPEECH_CATALOG, modelSize, type SpeechCatalogModel } from '../../src/main/speech/model-catalog'
import { createSpeechModelManager } from '../../src/main/speech/model-manager'
import { runtimeDevice } from '../../src/main/speech/devices'
import {
  createTranscriber,
  type AsrPipelineLike,
  type ModelSpec,
  type TransformersModuleLike
} from '../../src/main/speech/transcriber'

describe('model catalog', () => {
  it('has unique ids and the onnx files of the precision each model declares', () => {
    const ids = SPEECH_CATALOG.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const suffix = { q8: 'quantized', fp16: 'fp16', q4f16: 'q4f16' }
    for (const entry of SPEECH_CATALOG) {
      const onnx = entry.files.filter((f) => f.path.startsWith('onnx/')).map((f) => f.path)
      expect(onnx).toEqual([
        `onnx/encoder_model_${suffix[entry.dtype]}.onnx`,
        `onnx/decoder_model_merged_${suffix[entry.dtype]}.onnx`
      ])
      expect(entry.files.every((f) => f.sizeBytes > 0)).toBe(true)
    }
  })

  it('runs the CPU tier on the CPU and every GPU tier on the GPU', () => {
    for (const entry of SPEECH_CATALOG) {
      expect(entry.device).toBe(entry.tier === 'cpu' ? 'cpu' : 'gpu')
    }
    expect(SPEECH_CATALOG.some((m) => m.tier === 'gpu-small')).toBe(true)
    expect(SPEECH_CATALOG.some((m) => m.tier === 'gpu-large')).toBe(true)
  })

  it('puts the recommended Large v3 Turbo for small GPUs under 600 MB', () => {
    const turbo = SPEECH_CATALOG.find((m) => m.id === 'whisper-large-v3-turbo-q4f16')!
    expect(modelSize(turbo)).toBeLessThan(600_000_000)
  })
})

describe('runtime device', () => {
  it('maps the GPU to DirectML on Windows and CoreML on macOS', () => {
    expect(runtimeDevice('gpu', 'win32')).toBe('dml')
    expect(runtimeDevice('gpu', 'darwin')).toBe('coreml')
    expect(runtimeDevice('gpu', 'linux')).toBe('cpu')
    expect(runtimeDevice('cpu', 'win32')).toBe('cpu')
  })
})

const MODEL: SpeechCatalogModel = {
  id: 'tiny',
  name: 'Tiny',
  description: 'test model',
  tier: 'gpu-small',
  device: 'gpu',
  dtype: 'fp16',
  repo: 'org/tiny',
  files: [
    { path: 'config.json', sizeBytes: 5 },
    { path: 'onnx/model.onnx', sizeBytes: 5 }
  ]
}

function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

describe('model manager', () => {
  let dir: string
  let events: SpeechDownloadEvent[]
  const emit = (event: SpeechDownloadEvent): void => {
    events.push(event)
  }
  const settled = (): Promise<void> =>
    vi.waitFor(() => expect(events.some((e) => e.status !== 'progress')).toBe(true))

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ditado-models-'))
    events = []
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lists the catalog with the tier, the summed size and the install state', () => {
    const manager = createSpeechModelManager({ dir, emit, catalog: [MODEL] })
    expect(manager.list()).toEqual([
      { id: 'tiny', name: 'Tiny', description: 'test model', tier: 'gpu-small', sizeBytes: 10, installed: false }
    ])
  })

  it('downloads every file into a folder named only when complete', async () => {
    const fetchImpl = vi.fn(async () => new Response(bodyOf('he', 'llo')))
    const manager = createSpeechModelManager({
      dir,
      emit,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      catalog: [MODEL]
    })
    manager.download('tiny')
    await settled()
    expect(events.at(-1)).toMatchObject({ status: 'done', receivedBytes: 10, totalBytes: 10 })
    expect(existsSync(join(dir, 'tiny', 'onnx', 'model.onnx'))).toBe(true)
    expect(existsSync(join(dir, 'tiny.part'))).toBe(false)
  })

  it('throttles the progress events of a download that arrives in many pieces', async () => {
    const pieces = Array.from({ length: 200 }, () => 'x')
    const fetchImpl = vi.fn(async () => new Response(bodyOf(...pieces)))
    const manager = createSpeechModelManager({
      dir,
      emit,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      catalog: [MODEL]
    })
    manager.download('tiny')
    await settled()
    expect(events.filter((e) => e.status === 'progress').length).toBeLessThan(10)
  })

  it('reports a failed file and leaves nothing behind', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }))
    const manager = createSpeechModelManager({
      dir,
      emit,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      catalog: [MODEL]
    })
    manager.download('tiny')
    await settled()
    expect(events.at(-1)?.status).toBe('error')
    expect(events.at(-1)?.error).toContain('404')
    expect(existsSync(join(dir, 'tiny.part'))).toBe(false)
  })
})

describe('transcriber', () => {
  const GPU: ModelSpec = { id: 'turbo', dtype: 'q4f16', device: 'dml' }
  const CPU: ModelSpec = { id: 'small', dtype: 'q8', device: 'cpu' }
  const audio = new Float32Array(16_000)

  function fakeModule(behavior: {
    loadFails?: (device: string) => boolean
    inferFails?: (device: string) => boolean
  }) {
    const loads: string[] = []
    const calls: { device: string; language?: string }[] = []
    const mod: TransformersModuleLike = {
      env: { allowRemoteModels: true, allowLocalModels: false, localModelPath: '' },
      pipeline: vi.fn(async (_task, _model, options) => {
        loads.push(options.device)
        if (behavior.loadFails?.(options.device)) throw new Error('no adapter')
        const asr = (async (_audio, opts) => {
          calls.push({ device: options.device, language: opts.language })
          if (behavior.inferFails?.(options.device)) throw new Error('kernel failed')
          return { text: ` olá ${options.device} ` }
        }) as AsrPipelineLike
        return asr
      })
    }
    return { mod, loads, calls }
  }

  it('runs on the GPU when it loads, passing the language', async () => {
    const { mod, loads, calls } = fakeModule({})
    const transcriber = createTranscriber({ dir: '/models', loadModule: async () => mod })
    await expect(transcriber.transcribe(GPU, audio, 'pt')).resolves.toEqual({
      text: 'olá dml',
      usedFallback: false
    })
    expect(loads).toEqual(['dml'])
    expect(calls[0].language).toBe('pt')
    expect(mod.env).toMatchObject({ allowRemoteModels: false, allowLocalModels: true, localModelPath: '/models' })
    await transcriber.unload()
  })

  it('falls back to the CPU when the GPU fails to load, and stays there', async () => {
    const { mod, loads } = fakeModule({ loadFails: (d) => d === 'dml' })
    const onFallback = vi.fn()
    const transcriber = createTranscriber({ dir: '/m', loadModule: async () => mod, onFallback })
    await expect(transcriber.transcribe(GPU, audio)).resolves.toEqual({ text: 'olá cpu', usedFallback: true })
    await expect(transcriber.transcribe(GPU, audio)).resolves.toEqual({ text: 'olá cpu', usedFallback: true })
    expect(loads).toEqual(['dml', 'cpu'])
    expect(onFallback).toHaveBeenCalledOnce()
    await transcriber.unload()
  })

  it('falls back to the CPU when the GPU loads but fails to run', async () => {
    const { mod, loads } = fakeModule({ inferFails: (d) => d === 'dml' })
    const transcriber = createTranscriber({ dir: '/m', loadModule: async () => mod })
    await expect(transcriber.transcribe(GPU, audio)).resolves.toEqual({ text: 'olá cpu', usedFallback: true })
    expect(loads).toEqual(['dml', 'cpu'])
    await transcriber.unload()
  })

  it('reports a CPU failure without retrying', async () => {
    const { mod, loads } = fakeModule({ loadFails: () => true })
    const transcriber = createTranscriber({ dir: '/m', loadModule: async () => mod })
    await expect(transcriber.transcribe(CPU, audio)).rejects.toThrow('Falha ao transcrever o áudio: no adapter')
    expect(loads).toEqual(['cpu'])
  })

  it('keeps the model loaded between calls and reloads when another model is asked', async () => {
    const { mod, loads } = fakeModule({})
    const transcriber = createTranscriber({ dir: '/m', loadModule: async () => mod })
    await transcriber.warmUp(GPU)
    await transcriber.transcribe(GPU, audio)
    await transcriber.transcribe(CPU, audio)
    expect(loads).toEqual(['dml', 'cpu'])
    await transcriber.unload()
  })
})
