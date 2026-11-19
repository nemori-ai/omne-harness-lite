// Starts the built window: `pnpm run build` first. Arguments go to Electron.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { electronBinary, electronEnvironment } from './electron-env.mjs'

const main = fileURLToPath(new URL('../dist/main/main.js', import.meta.url))
if (!existsSync(main)) {
  process.stderr.write('window: no build at dist/main/main.js; run `pnpm run build` first\n')
  process.exit(2)
}
const child = spawn(electronBinary, [main, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: electronEnvironment(process.env),
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', (code, signal) => process.exit(signal === null ? (code ?? 1) : 1))
