import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'

function trayIcon(): Electron.NativeImage {
  const file = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
  const size = process.platform === 'darwin' ? 18 : 16
  return nativeImage.createFromPath(file).resize({ width: size, height: size })
}

/** Ícone na bandeja (Windows) / barra de menu (macOS): o único jeito de ver o app, que não tem janela fixa. */
export function createTray(actions: {
  dictate: () => void
  settings: () => void
  shortcutLabel: () => string
}): { tray: Tray; refresh: () => void } {
  const tray = new Tray(trayIcon())
  const refresh = (): void => {
    tray.setToolTip(`Ditado — ${actions.shortcutLabel()}`)
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Ditar (${actions.shortcutLabel()})`, click: actions.dictate },
        { label: 'Configurações...', click: actions.settings },
        { type: 'separator' },
        { label: 'Sair', click: () => app.quit() }
      ])
    )
  }
  refresh()
  // no Windows o clique simples no ícone abre as configurações; no macOS o clique abre o menu
  if (process.platform !== 'darwin') tray.on('click', actions.settings)
  return { tray, refresh }
}
