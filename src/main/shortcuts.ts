import { globalShortcut } from 'electron'
import { AppError } from './errors'

export interface ShortcutDeps {
  register: (accelerator: string, callback: () => void) => boolean
  unregister: (accelerator: string) => void
}

const electronShortcuts: ShortcutDeps = {
  register: (accelerator, callback) => {
    try {
      return globalShortcut.register(accelerator, callback)
    } catch {
      // acelerador que o Electron não entende
      return false
    }
  },
  unregister: (accelerator) => globalShortcut.unregister(accelerator)
}

/**
 * O atalho global do ditado e o Esc que cancela. O Esc só fica registrado enquanto a janelinha está aberta
 * (ela nunca tem foco, então não recebe teclas) — registrado o tempo todo, ele roubaria o Esc dos outros apps.
 */
export function createShortcuts(
  handlers: { onToggle: () => void; onCancel: () => void },
  deps: ShortcutDeps = electronShortcuts
) {
  let current: string | null = null
  let suspended = false
  let escapeActive = false

  return {
    /** Troca o atalho; se o novo não registrar (em uso por outro app), mantém o anterior e falha. */
    set(accelerator: string): void {
      if (accelerator === current && !suspended) return
      if (current && !suspended) deps.unregister(current)
      if (!deps.register(accelerator, handlers.onToggle)) {
        if (current && !suspended) deps.register(current, handlers.onToggle)
        throw new AppError(
          'CONFLICT',
          `Não foi possível usar ${accelerator}: o sistema ou outro app já usa essa combinação.`
        )
      }
      current = accelerator
      suspended = false
    },

    /** Solta o atalho enquanto a tela de configurações captura um novo; `false` volta a registrar. */
    suspend(value: boolean): void {
      if (value === suspended || !current) return
      if (value) deps.unregister(current)
      else deps.register(current, handlers.onToggle)
      suspended = value
    },

    setEscape(active: boolean): void {
      if (active === escapeActive) return
      if (active) escapeActive = deps.register('Escape', handlers.onCancel)
      else {
        deps.unregister('Escape')
        escapeActive = false
      }
    },

    get current(): string | null {
      return current
    }
  }
}

export type Shortcuts = ReturnType<typeof createShortcuts>
