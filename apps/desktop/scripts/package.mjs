// Packs the desktop app: `pnpm run build` first. Stages dist/app (the two bundled entries, the
// page, a package.json with no dependencies), then runs electron-builder on it. `--release` packs
// the release profile; other arguments go to electron-builder (`--dir`, `--mac`, `--win`, `--linux`).
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PRODUCT } from '../electron-builder.config.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const at = path => fileURLToPath(new URL(`../${path}`, import.meta.url))
const fail = line => {
  process.stderr.write(`package: ${line}\n`)
  process.exit(1)
}
const tool = (name, args) => {
  const { status, error } = spawnSync('pnpm', ['exec', name, ...args], { cwd: root, stdio: 'inherit' })
  if (error !== undefined) fail(`${name}: ${error.message}`)
  if (status !== 0) fail(`${name} exited with ${status}`)
}

if (!existsSync(at('dist/page/index.html'))) fail('no build at dist/page; run `pnpm run build` first')

rmSync(at('dist/app'), { recursive: true, force: true })
tool('vite', ['build', '--config', 'vite.app.config.ts'])
cpSync(at('dist/page'), at('dist/app/page'), { recursive: true })

const own = JSON.parse(readFileSync(at('package.json'), 'utf8'))
const metadata = {
  name: PRODUCT.name,
  productName: PRODUCT.productName,
  version: own.version,
  description: own.description,
  homepage: PRODUCT.homepage,
  author: { name: PRODUCT.productName },
  type: 'module',
  main: 'main/main.js',
}
writeFileSync(at('dist/app/package.json'), `${JSON.stringify(metadata, null, 2)}\n`)

const args = process.argv.slice(2)
const release = args.includes('--release')
tool('electron-builder', [
  '--config',
  release ? 'electron-builder.release.config.mjs' : 'electron-builder.config.mjs',
  '--publish',
  'never',
  ...args.filter(arg => arg !== '--release'),
])
