import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

export const OVERLAY_WIDTH = 280
export const OVERLAY_HEIGHT = 44
const MARGIN = 16

const preload = (): string => join(__dirname, '../preload/index.js')

function load(win: BrowserWindow, page: 'overlay' | 'settings', hash = ''): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html${hash ? `#${hash}` : ''}`)
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`), hash ? { hash } : undefined)
}

/** Onde a janelinha aparece: a posição salva se ainda cabe em algum monitor; senão o canto superior direito. */
export function overlayBounds(saved: { x: number; y: number } | null): { x: number; y: number } {
  if (saved) {
    const display = screen.getDisplayMatching({ ...saved, width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT })
    const area = display.workArea
    const inside =
      saved.x >= area.x &&
      saved.y >= area.y &&
      saved.x + OVERLAY_WIDTH <= area.x + area.width &&
      saved.y + OVERLAY_HEIGHT <= area.y + area.height
    if (inside) return saved
  }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  return { x: area.x + area.width - OVERLAY_WIDTH - MARGIN, y: area.y + MARGIN }
}

/**
 * A janelinha flutuante. Nunca recebe o foco (`focusable: false` + `showInactive`; painel no macOS): o app em
 * que o usuário está continua em foco e recebe o Ctrl+V / ⌘V no fim.
 */
export function createOverlayWindow(onMoved: (position: { x: number; y: number }) => void): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    ...(isMac ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: preload(),
      sandbox: false,
      contextIsolation: true,
      // grava e anima a onda mesmo sem foco
      backgroundThrottling: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.on('moved', () => {
    const [x, y] = win.getPosition()
    onMoved({ x, y })
  })
  load(win, 'overlay')
  return win
}

let settingsWindow: BrowserWindow | null = null

/** A janela de configurações (uma só; abrir de novo traz ela para frente na aba pedida). */
export function showSettingsWindow(tab?: string): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (tab) settingsWindow.webContents.send('settings.tab', tab)
    if (settingsWindow.isMinimized()) settingsWindow.restore()
    settingsWindow.show()
    settingsWindow.focus()
    return settingsWindow
  }
  const win = new BrowserWindow({
    width: 620,
    height: 680,
    minWidth: 520,
    minHeight: 480,
    title: 'Ditado',
    backgroundColor: '#161616',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: preload(), sandbox: false, contextIsolation: true }
  })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    settingsWindow = null
  })
  load(win, 'settings', tab)
  settingsWindow = win
  return win
}
