import { realpathSync } from 'node:fs'
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
import {
  appProcesses,
  checkLaunchInputs,
  freshUserDataDir,
  launchEnvironment,
  type LaunchTarget,
  launchSpec,
  removeUserDataDir,
} from '../scripts/launch.ts'

export type Target = LaunchTarget
export const REPLY = 'hello from the e2e gateway'

/** The processes of a target still running, helpers included. */
export function targetProcesses(target: Target): number[] {
  try {
    const { command, processDir } = launchSpec(target, 'test', { userDataDir: 'unused' })
    return appProcesses(command, processDir)
  } catch {
    return []
  }
}

export type Launched = Readonly<{ app: ElectronApplication; page: Page; pid: number }>

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function launch(target: Target, userDataDir: string, server: string): Promise<Launched> {
  const spec = launchSpec(target, 'test', { userDataDir })
  await checkLaunchInputs(spec)
  const app = await electron.launch({
    executablePath: spec.command,
    args: spec.args,
    cwd: spec.cwd,
    env: launchEnvironment(process.env, { OMNE_SERVER: server }),
    chromiumSandbox: !spec.args.includes('--no-sandbox'),
  })
  let pid: number | undefined
  try {
    pid = await app.evaluate(() => process.pid)
    const page = await app.firstWindow()
    const reported = await app.evaluate(() => globalThis.desktopBuildProfile)
    if (reported !== 'test')
      throw new Error(`the app reports build profile ${reported}, expected test`)
    const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
    if (realpathSync(userData) !== realpathSync(userDataDir))
      throw new Error(`the app runs on user data ${userData}, not on ${userDataDir}`)
    if (process.platform === 'linux') {
      const store = await app.evaluate(({ safeStorage }) => safeStorage.getSelectedStorageBackend())
      if (store !== 'basic_text')
        throw new Error(`the app keeps its secrets in ${store}, not the basic store`)
    }
    return { app, page, pid }
  } catch (failure) {
    await app.close().catch(() => {})
    if (pid !== undefined && alive(pid)) process.kill(pid, 'SIGKILL')
    throw failure
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
        {
          model: JSON.parse(body).model ?? 'm',
          provider: 'OpenAI',
          choices: [{ delta: { content: REPLY } }],
        },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]
        .map(event => `data: ${JSON.stringify(event)}\n\n`)
        .concat('data: [DONE]\n\n')
        .join(''),
    }))
    const port = await freePort()
    const operatorPath = `${scratch.base}/operator.json`
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

type Fixtures = { userDataDir: string; launchApp: () => Promise<Launched> }
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
  userDataDir: async ({}, provide) => {
    const directory = freshUserDataDir('e2e')
    try {
      await provide(directory)
    } finally {
      removeUserDataDir(directory)
    }
  },
  launchApp: async ({ target, server, userDataDir }, provide) => {
    const launched: Launched[] = []
    await provide(async () => {
      const app = await launch(target, userDataDir, server)
      launched.push(app)
      return app
    })
    for (const app of launched)
      if (alive(app.pid)) await quit(app).catch(() => process.kill(app.pid, 'SIGKILL'))
  },
})

export { expect } from '@playwright/test'
