import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(fileURLToPath(import.meta.url))

// O package.json declara "type": "module": sem este marcador o Node trataria o preload CJS como ESM.
function preloadCommonJsMarker(): { name: string; apply: 'build'; closeBundle(): void } {
  return {
    name: 'preload-commonjs-marker',
    apply: 'build',
    closeBundle() {
      writeFileSync(resolve(rootDir, 'out/preload/package.json'), '{"type":"commonjs"}\n')
    }
  }
}

export default defineConfig({
  main: {},
  preload: {
    plugins: [preloadCommonJsMarker()],
    build: { rollupOptions: { output: { entryFileNames: 'index.js', format: 'cjs' } } }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          overlay: resolve(rootDir, 'src/renderer/overlay.html'),
          settings: resolve(rootDir, 'src/renderer/settings.html')
        }
      }
    },
    resolve: { alias: { '@shared': resolve(rootDir, 'src/shared') } }
  }
})
