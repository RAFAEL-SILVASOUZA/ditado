import { execFile } from 'node:child_process'

export interface PasteDeps {
  writeClipboard: (text: string) => void
  /** Executa um programa e resolve quando ele termina (rejeita se falhar). */
  run?: (file: string, args: string[]) => Promise<void>
  platform?: NodeJS.Platform
  /** macOS: o app pode controlar o teclado (Acessibilidade). */
  canControlKeyboard?: () => boolean
}

export interface PasteOutcome {
  pasted: boolean
  warning?: string
}

const runFile = (file: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 5_000 }, (err) => (err ? reject(err) : resolve()))
  })

/**
 * O comando que tecla Ctrl+V / ⌘V no app em foco, sem módulo nativo: SendKeys do .NET pelo PowerShell no
 * Windows e o System Events pelo osascript no macOS. `null` onde não há como.
 */
export function pasteCommand(platform: NodeJS.Platform): { file: string; args: string[] } | null {
  if (platform === 'win32') {
    return {
      file: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"
      ]
    }
  }
  if (platform === 'darwin') {
    return {
      file: 'osascript',
      args: ['-e', 'tell application "System Events" to keystroke "v" using command down']
    }
  }
  return null
}

/**
 * Põe o texto na área de transferência e, se `autoPaste`, cola no app em foco. O texto fica na área de
 * transferência mesmo quando a colagem não acontece, para o usuário colar à mão.
 */
export async function deliverText(
  text: string,
  autoPaste: boolean,
  { writeClipboard, run = runFile, platform = process.platform, canControlKeyboard = () => true }: PasteDeps
): Promise<PasteOutcome> {
  writeClipboard(text)
  if (!autoPaste) return { pasted: false }
  const command = pasteCommand(platform)
  if (!command) return { pasted: false, warning: 'Colar automaticamente não é suportado neste sistema.' }
  if (platform === 'darwin' && !canControlKeyboard()) {
    return {
      pasted: false,
      warning:
        'Texto copiado. Para colar sozinho, ative o Ditado em Ajustes do Sistema > Privacidade e Segurança > Acessibilidade.'
    }
  }
  try {
    await run(command.file, command.args)
    return { pasted: true }
  } catch {
    return { pasted: false, warning: 'Texto copiado, mas não foi possível colar. Use Ctrl+V / ⌘V.' }
  }
}
