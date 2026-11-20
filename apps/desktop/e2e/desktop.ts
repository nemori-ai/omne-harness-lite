import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
  test as base,
} from '@playwright/test'
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
 * What Playwright's Electron driver starts:
 * - `unpackaged`: the Electron of this workspace on `dist/main/main.js`, after `pnpm run build`;
 * - `packaged`: the test profile from `pnpm run package`. The release profile turns the Node
 *   inspector off, so the driver cannot attach to it.
 */
export type Target = 'unpackaged' | 'packaged'

const desktop = fileURLToPath(new URL('..', import.meta.url))
export const REPLY = 'hello from the e2e gateway'

function packagedBinary(): string {
  const names = JSON.parse(readFileSync(join(desktop, 'dist', 'app', 'package.json'), 'utf8'))
  return packagedExecutable(join(desktop, 'out'), names, process.platform, process.arch)
}

export type Launched = Readonly<{ app: ElectronApplication; page: Page; pid: number }>

async function launch(target: Target, userData: string, server: string): Promise<Launched> {
  const main = join(desktop, 'dist', 'main', 'main.js')
  const binary = target === 'packaged' ? packagedBinary() : undefined
  const needed = binary ?? main
  if (!existsSync(needed)) {
    const command = target === 'packaged' ? 'pnpm run build && pnpm run package' : 'pnpm run build'
    throw new Error(`${needed} is missing: run \`${command}\` first`)
  }
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env))
    // Nothing from a developer's shell that changes what the app is or does.
    if (value !== undefined && !/^(OMNE_|ELECTRON_RUN_AS_NODE$|NODE_OPTIONS$)/.test(name))
      env[name] = value
  env['OMNE_SERVER'] = server
  const args = [`--user-data-dir=${userData}`]
  const app = await electron.launch(
    binary === undefined
      ? { executablePath: createRequire(import.meta.url)('electron'), args: [main, ...args], env }
      : { executablePath: binary, args, env },
  )
  const pid = await app.evaluate(() => process.pid)
  const page = await app.firstWindow()
  return { app, page, pid }
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
export async function quit({ app, pid }: Launched): Promise<void> {
  await app.close()
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
  /** Starts the app on this test's own user data; every app started here is quit afterwards. */
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
  launchApp: async ({ target, server }, provide) => {
    const userData = realpathSync(mkdtempSync(join(tmpdir(), 'omne-e2e-ud-')))
    const launched: Launched[] = []
    await provide(async () => {
      const app = await launch(target, userData, server)
      launched.push(app)
      return app
    })
    for (const app of launched)
      if (alive(app.pid)) await quit(app).catch(() => process.kill(app.pid, 'SIGKILL'))
    rmSync(userData, { recursive: true, force: true })
  },
})

export { expect } from '@playwright/test'
