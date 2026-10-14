/** Teclas que sozinhas não formam um atalho (são só modificadoras). */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS'])

/** `event.code` das teclas que não são letra/número para o nome que o Electron entende. */
const NAMED_CODES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  Pause: 'Pause',
  ScrollLock: 'Scrolllock',
  PrintScreen: 'PrintScreen'
}

export interface KeyLike {
  key: string
  code: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  return NAMED_CODES[code] ?? null
}

/**
 * O acelerador do Electron para uma tecla pressionada (ex.: Control+Shift+Space). Usa `code` (a posição da
 * tecla) e não `key`, para o layout do teclado (ABNT, US...) não mudar o atalho. `null` enquanto só há
 * modificadoras, para tecla desconhecida ou sem modificadora (exceto F1–F24, que funcionam sozinhas).
 */
export function acceleratorFromEvent(event: KeyLike, platform: string): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  const key = keyName(event.code)
  if (!key) return null
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Control')
  if (event.metaKey) parts.push(platform === 'darwin' ? 'Command' : 'Super')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  const isFunctionKey = /^F\d+$/.test(key)
  if (parts.length === 0 && !isFunctionKey) return null
  // Shift sozinho com uma letra viraria maiúscula ao digitar: não serve de atalho
  if (parts.length === 1 && parts[0] === 'Shift' && !isFunctionKey) return null
  return [...parts, key].join('+')
}

/** O atalho como o usuário lê (Ctrl+Shift+Espaço no Windows, ⌃⇧Espaço no macOS). */
export function formatAccelerator(accelerator: string, platform: string): string {
  const mac = platform === 'darwin'
  const names: Record<string, string> = mac
    ? { CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Super: '⌘' }
    : { CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Control: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Super: 'Win', Meta: 'Win' }
  const keys: Record<string, string> = { Space: 'Espaço', Up: '↑', Down: '↓', Left: '←', Right: '→' }
  const parts = accelerator.split('+').map((part) => names[part] ?? keys[part] ?? part)
  return mac ? parts.join('') : parts.join('+')
}
