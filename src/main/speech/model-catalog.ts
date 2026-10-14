import type { ModelTier } from '../../shared/types'

/** Um arquivo do repositório do modelo (caminho relativo igual no Hugging Face e na pasta local). */
export interface CatalogFile {
  path: string
  sizeBytes: number
}

/** Precisão dos pesos: q8 roda bem na CPU; fp16 e q4f16 são as variantes para GPU. */
export type ModelDtype = 'q8' | 'fp16' | 'q4f16'

/** `gpu` vira DirectML no Windows e CoreML no macOS (ver devices.ts). */
export type ModelDevice = 'cpu' | 'gpu'

export interface SpeechCatalogModel {
  id: string
  name: string
  description: string
  tier: ModelTier
  device: ModelDevice
  dtype: ModelDtype
  /** Repositório no Hugging Face de onde os arquivos são baixados. */
  repo: string
  files: readonly CatalogFile[]
}

/** O sufixo que o transformers.js procura em `onnx/` para cada precisão. */
const DTYPE_SUFFIX: Record<ModelDtype, string> = {
  q8: 'quantized',
  fp16: 'fp16',
  q4f16: 'q4f16'
}

interface RepoFiles {
  repo: string
  config: number
  generationConfig: number
  preprocessorConfig: number
  tokenizer: number
  tokenizerConfig: number
  /** Tamanho do encoder e do decoder para cada precisão publicada. */
  weights: Partial<Record<ModelDtype, [encoder: number, decoder: number]>>
}

const TINY: RepoFiles = {
  repo: 'onnx-community/whisper-tiny',
  config: 2_243,
  generationConfig: 3_772,
  preprocessorConfig: 339,
  tokenizer: 2_480_466,
  tokenizerConfig: 282_683,
  weights: { q8: [10_124_990, 30_719_241] }
}

const BASE: RepoFiles = {
  repo: 'onnx-community/whisper-base',
  config: 2_243,
  generationConfig: 3_832,
  preprocessorConfig: 339,
  tokenizer: 2_480_466,
  tokenizerConfig: 282_682,
  weights: { q8: [23_201_314, 53_693_315] }
}

const SMALL: RepoFiles = {
  repo: 'onnx-community/whisper-small',
  config: 2_227,
  generationConfig: 3_893,
  preprocessorConfig: 339,
  tokenizer: 2_480_466,
  tokenizerConfig: 282_683,
  weights: { q8: [92_326_160, 156_750_845], fp16: [176_607_756, 308_583_076] }
}

const LARGE_V3_TURBO: RepoFiles = {
  repo: 'onnx-community/whisper-large-v3-turbo',
  config: 1_332,
  generationConfig: 3_897,
  preprocessorConfig: 340,
  tokenizer: 2_480_617,
  tokenizerConfig: 282_843,
  weights: {
    q8: [644_822_195, 439_936_716],
    fp16: [1_274_342_603, 344_227_339],
    q4f16: [369_974_078, 193_505_017]
  }
}

const LARGE_V3: RepoFiles = {
  repo: 'onnx-community/whisper-large-v3-ONNX',
  config: 1_288,
  generationConfig: 3_896,
  preprocessorConfig: 340,
  tokenizer: 3_930_645,
  tokenizerConfig: 282_873,
  weights: { fp16: [1_274_316_249, 1_815_335_624] }
}

function filesOf(source: RepoFiles, dtype: ModelDtype): CatalogFile[] {
  const weights = source.weights[dtype]
  if (!weights) throw new Error(`${source.repo} não publica a precisão ${dtype}`)
  const suffix = DTYPE_SUFFIX[dtype]
  return [
    { path: 'config.json', sizeBytes: source.config },
    { path: 'generation_config.json', sizeBytes: source.generationConfig },
    { path: 'preprocessor_config.json', sizeBytes: source.preprocessorConfig },
    { path: 'tokenizer.json', sizeBytes: source.tokenizer },
    { path: 'tokenizer_config.json', sizeBytes: source.tokenizerConfig },
    { path: `onnx/encoder_model_${suffix}.onnx`, sizeBytes: weights[0] },
    { path: `onnx/decoder_model_merged_${suffix}.onnx`, sizeBytes: weights[1] }
  ]
}

function model(
  id: string,
  name: string,
  description: string,
  tier: ModelTier,
  source: RepoFiles,
  dtype: ModelDtype
): SpeechCatalogModel {
  return {
    id,
    name,
    description,
    tier,
    device: tier === 'cpu' ? 'cpu' : 'gpu',
    dtype,
    repo: source.repo,
    files: filesOf(source, dtype)
  }
}

/** Modelos Whisper multilíngues (ONNX do onnx-community), agrupados pelo hardware que pedem. */
export const SPEECH_CATALOG: readonly SpeechCatalogModel[] = [
  model('whisper-tiny-q8', 'Whisper Tiny', 'O mais leve e rápido; erra bastante em frases longas ou com ruído.', 'cpu', TINY, 'q8'),
  model('whisper-base-q8', 'Whisper Base', 'Leve; razoável para frases curtas.', 'cpu', BASE, 'q8'),
  model('whisper-small-q8', 'Whisper Small', 'Bom equilíbrio para quem não tem GPU.', 'cpu', SMALL, 'q8'),
  model(
    'whisper-large-v3-turbo-q8',
    'Whisper Large v3 Turbo',
    'Qualidade de modelo grande sem GPU; pede uma CPU forte e leva alguns segundos por frase.',
    'cpu',
    LARGE_V3_TURBO,
    'q8'
  ),
  model('whisper-small-fp16', 'Whisper Small', 'Rápido em qualquer GPU, inclusive integradas.', 'gpu-small', SMALL, 'fp16'),
  model(
    'whisper-large-v3-turbo-q4f16',
    'Whisper Large v3 Turbo',
    'Recomendado: qualidade de modelo grande cabendo em GPUs de 2–4 GB.',
    'gpu-small',
    LARGE_V3_TURBO,
    'q4f16'
  ),
  model(
    'whisper-large-v3-turbo-fp16',
    'Whisper Large v3 Turbo',
    'Qualidade alta e rápido; para GPUs com 6 GB ou mais.',
    'gpu-large',
    LARGE_V3_TURBO,
    'fp16'
  ),
  model(
    'whisper-large-v3-fp16',
    'Whisper Large v3',
    'Máxima qualidade, mais lento que o Turbo; para GPUs com 8 GB ou mais.',
    'gpu-large',
    LARGE_V3,
    'fp16'
  )
]

export const modelSize = (entry: SpeechCatalogModel): number =>
  entry.files.reduce((sum, file) => sum + file.sizeBytes, 0)

export const fileUrl = (entry: SpeechCatalogModel, file: CatalogFile): string =>
  `https://huggingface.co/${entry.repo}/resolve/main/${file.path}`
