import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, chromium, type Page, test as base } from '@playwright/test'
import {
  type ModelGateway,
  startModelGateway,
} from '../../harness-server/tests/fixtures/model-gateway.ts'
import {
  freePort,
  newScratch,
  operatorLayer,
  type ServerHandle,
  startServer,
  writeOperator,
} from '../../harness-server/tests/r9/support.ts'
import { packagedExecutable } from './packaged-path.ts'

/**
 * What the tests start:
 * - `unpackaged`: the Electron of this workspace on `dist/main/main.js`, after `pnpm run build`;
 * - `packaged`: the test profile from `pnpm run package`, through Playwright's Electron driver;
 * - `release`: the release profile from `pnpm run package:release`. Its fuses turn the Node
 *   inspector off, so the Electron driver cannot attach; Chromium's debugging port still can.
 */
export type Target = 'unpackaged' | 'packaged' | 'release'

const desktop = fileURLToPath(new URL('..', import.meta.url))
const electronBinary: string = createRequire(import.meta.url)('electron')
export const REPLY = 'hello from the e2e gateway'

const OUT = { packaged: 'out', release: join('out', 'release') } as const
const BUILD = {
  unpackaged: 'pnpm run build',
  packaged: 'pnpm run build && pnpm run package',
  release: 'pnpm run build && pnpm run package:release',
} as const

function binary(target: Target): string {
  if (target === 'unpackaged') return electronBinary
  const names = JSON.parse(readFileSync(join(desktop, 'dist', 'app', 'package.json'), 'utf8'))
  return packagedExecutable(join(desktop, OUT[target]), names, process.platform, process.arch)
}

/** The processes of a target still running, helpers included (macOS keeps those in the bundle). */
export function targetProcesses(target: Target): number[] {
  let executable: string
  try {
    executable = binary(target)
  } catch {
    return []
  }
  const directory = process.platform === 'darwin' ? resolve(executable, '../../..') : dirname(executable)
  let output: string
  try {
    output =
      process.platform === 'win32'
        ? execFileSync(
            'powershell',
            [
              '-NoProfile',
              '-Command',
              'Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:E2E_DIR, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.ProcessId }',
            ],
            { encoding: 'utf8', env: { ...process.env, E2E_DIR: directory } },
          )
        : execFileSync('pgrep', ['-f', `^${directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`], {
            encoding: 'utf8',
          })
  } catch (failure) {
    // pgrep answers 1 when nothing matches.
    if ((failure as { status?: number }).status === 1) return []
    throw failure
  }
  return output
    .split(/\r?\n/)
    .map(Number)
    .filter(pid => pid > 0 && pid !== process.pid)
}

export type Launched = Readonly<{ page: Page; pid: number; close(): Promise<void> }>

function environment(server: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env))
    // Nothing from a developer's shell that changes what the app is or does.
    if (value !== undefined && !/^(OMNE_|ELECTRON_RUN_AS_NODE$|NODE_OPTIONS$)/.test(name))
      env[name] = value
  env['OMNE_SERVER'] = server
  return env
}

async function launch(target: Target, userData: string, server: string): Promise<Launched> {
  const main = join(desktop, 'dist', 'main', 'main.js')
  const executable = binary(target)
  const needed = target === 'unpackaged' ? main : executable
  if (!existsSync(needed)) throw new Error(`${needed} is missing: run \`${BUILD[target]}\` first`)
  const args = [`--user-data-dir=${userData}`]
  if (target === 'release') return attach(executable, args, userData, server)
  const app = await electron.launch({
    executablePath: executable,
    args: target === 'unpackaged' ? [main, ...args] : args,
    env: environment(server),
  })
  const pid = await app.evaluate(() => process.pid)
  const page = await app.firstWindow()
  // Through `app.quit()`, so `before-quit` runs as when a person quits.
  return { page, pid, close: () => app.close() }
}

/** Starts the app itself and attaches over Chromium's debugging port, to the app's own page. */
async function attach(
  executable: string,
  args: string[],
  userData: string,
  server: string,
): Promise<Launched> {
  const portFile = join(userData, 'DevToolsActivePort')
  // A file left by an earlier start on the same user data names a port nobody listens on.
  rmSync(portFile, { force: true })
  const child: ChildProcess = spawn(executable, ['--remote-debugging-port=0', ...args], {
    env: environment(server),
    stdio: 'ignore',
  })
  for (let i = 0; i < 300 && !existsSync(portFile); i += 1) await new Promise(r => setTimeout(r, 100))
  if (!existsSync(portFile)) {
    child.kill('SIGKILL')
    throw new Error('the release app did not open its debugging port')
  }
  const port = readFileSync(portFile, 'utf8').split('\n')[0]
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const context = browser.contexts()[0]!
  const isApp = (page: Page) => page.url().startsWith('omne-app://app')
  const page = context.pages().find(isApp) ?? (await context.waitForEvent('page', { predicate: isApp }))
  return {
    page,
    pid: child.pid!,
    async close() {
      await browser.close()
      // SIGTERM quits Electron the way a person does: `before-quit` runs.
      child.kill('SIGTERM')
    },
  }
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Quits the way a person does, so `before-quit` flushes the cookies, and waits for the process. */
export async function quit({ close, pid }: Launched): Promise<void> {
  await close()
  for (let i = 0; i < 200 && alive(pid); i += 1) await new Promise(r => setTimeout(r, 50))
  if (alive(pid)) throw new Error(`main process ${pid} still running after quit`)
}

/** A real server with a stand-in model gateway that answers every request with `REPLY`. */
async function startStack(): Promise<{ origin: string; stop(): Promise<void> }> {
  const scratch = newScratch('desktop-e2e-')
  let gateway: ModelGateway | undefined
  let server: ServerHandle | undefined
  try {
    gateway = await startModelGateway(({ body }) => ({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        { model: JSON.parse(body).model ?? 'm', provider: 'OpenAI', choices: [{ delta: { content: REPLY } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]
        .map(event => `data: ${JSON.stringify(event)}\n\n`)
        .concat('data: [DONE]\n\n')
        .join(''),
    }))
    const port = await freePort()
    const operatorPath = join(scratch.base, 'operator.json')
    writeOperator(
      operatorPath,
      operatorLayer({ storageRoot: scratch.storageRoot, port, modelRoute: gateway.url }),
    )
    server = await startServer({
      stateRoot: scratch.stateRoot,
      operatorPath,
      port,
      extraCaPath: gateway.certPath,
    })
  } catch (failure) {
    await gateway?.close()
    scratch.remove()
    throw failure
  }
  const [started, stub] = [server, gateway]
  return {
    origin: `http://127.0.0.1:${started.port}`,
    async stop() {
      await started.stop().catch(() => {})
      await stub.close().catch(() => {})
      scratch.remove()
    },
  }
}

type Fixtures = {
  /** This test's own user data directory, deleted afterwards. */
  userData: string
  /** Starts the app on `userData`; every app started here is quit afterwards. */
  launchApp: () => Promise<Launched>
}

type Options = { target: Target }

type Worker = { server: string }

export const test = base.extend<Fixtures & Options, Worker>({
  target: ['unpackaged', { option: true }],
  server: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures destructure their dependencies
    async ({}, provide) => {
      const stack = await startStack()
      await provide(stack.origin)
      await stack.stop()
    },
    { scope: 'worker' },
  ],
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures destructure their dependencies
  userData: async ({}, provide) => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'omne-e2e-ud-')))
    await provide(directory)
    rmSync(directory, { recursive: true, force: true })
  },
  launchApp: async ({ target, server, userData }, provide) => {
    const launched: Launched[] = []
    await provide(async () => {
      const app = await launch(target, userData, server)
      launched.push(app)
      return app
    })
    for (const app of launched)
      if (alive(app.pid)) await quit(app).catch(() => process.kill(app.pid, 'SIGKILL'))
  },
})

export { expect } from '@playwright/test'
