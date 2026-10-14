import type { ModelDevice } from './model-catalog'

/** O device do onnxruntime-node que o transformers.js aceita. */
export type RuntimeDevice = 'cpu' | 'dml' | 'coreml'

/**
 * A GPU de cada sistema no onnxruntime-node: DirectML no Windows (qualquer placa com DirectX 12, sem instalar
 * CUDA) e CoreML no macOS (GPU e Neural Engine). Nos demais, fica na CPU.
 */
export function runtimeDevice(device: ModelDevice, platform: NodeJS.Platform = process.platform): RuntimeDevice {
  if (device === 'cpu') return 'cpu'
  if (platform === 'win32') return 'dml'
  if (platform === 'darwin') return 'coreml'
  return 'cpu'
}
