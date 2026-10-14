// Windows sets ELECTRON_RUN_AS_NODE=1 in the process environment, which makes
// electron.exe run as plain Node and breaks the ESM main process. Clear it
// before spawning electron-vite.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const ps = spawn(process.execPath, [join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), 'dev'], {
  cwd: root,
  stdio: 'inherit',
  env
})

ps.on('close', (code) => process.exit(code ?? 1))
