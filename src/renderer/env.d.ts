/// <reference types="vite/client" />
import type { DitadoApi } from '@shared/api'

declare global {
  interface Window {
    api: DitadoApi & { platform: string; onSettingsTab(callback: (tab: string) => void): () => void }
  }
}

export {}
