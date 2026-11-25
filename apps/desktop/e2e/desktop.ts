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
  launchLocation,
  type LaunchTarget,
  launchSpec,
  removeUserDataDir,
} from '../scripts/launch.ts'
import { closeApplication, type MainProcess } from './close.ts'

export type Target = LaunchTarget
export const REPLY = 'hello from the e2e gateway'
/** A message with this in it gets, after a pause, a turn that asks the person one question. */
export const ASK_MARKER = 'ask-me-one-question'
const ASK_PAUSE_MS = 3_000
const ASK_ARGUMENTS = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: 'Which port should the dev server use?',
        description: 'Port 8080 is taken.',
        options: [
          { label: '8081', description: 'The next free port.' },
          { label: '3000', description: 'The default port.' },
        ],
      },
    ],
  },
})

/** The processes of a target still running, helpers included; a failed listing throws. */
export function targetProcesses(target: Target): number[] {
  const { command, processDir } = launchLocation(target)
  return appProcesses(command, processDir)
}

export type Launched = Readonly<{
  app: ElectronApplication
  page: Page
  pid: number
  close: () => Promise<void>
}>

// A launch whose exit is unconfirmed takes its directory off this list, so the fixture keeps it.
const removableProfiles = new Set<string>()

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
  const launcher = app.process()
  let main: MainProcess | undefined
  const close = () =>
    closeApplication(app, launcher, main, () => {
      removableProfiles.delete(userDataDir)
      process.stderr.write(`e2e: exit unconfirmed; keeping user data in ${userDataDir}\n`)
    })
  try {
    // On Windows Playwright may start Electron through a separate launcher process.
    main = await app.evaluate(() => {
      const created = process.platform === 'win32' ? process.getCreationTime() : null
      return { pid: process.pid, ...(created === null ? {} : { startedAt: Math.trunc(created) }) }
    })
    if (main.pid !== launcher.pid && (process.platform !== 'win32' || main.startedAt === undefined))
      throw new Error('cannot verify the identity of the launched Electron main process')
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
    return { app, page, pid: main.pid, close }
  } catch (failure) {
    await close().catch((closeFailure: unknown) => {
      process.stderr.write(`e2e: cleanup after a failed launch: ${String(closeFailure)}\n`)
    })
    throw failure
  }
}

/** Quits the way a person does, so `before-quit` flushes the cookies, and waits for the process. */
export const quit = ({ close }: Launched): Promise<void> => close()

/** A real server with a stand-in model gateway that answers every request with `REPLY`. */
async function startStack(): Promise<{ origin: string; stop(): Promise<void> }> {
  const scratch = newScratch('desktop-e2e-')
  let gateway: ModelGateway | undefined
  let server: ServerHandle | undefined
  try {
    gateway = await startModelGateway(async ({ body }) => {
      const model = JSON.parse(body).model ?? 'm'
      const asks = body.includes(ASK_MARKER) && body.includes('"Ask"')
      if (asks) await new Promise(done => setTimeout(done, ASK_PAUSE_MS))
      const call = {
        index: 0,
        id: 'call_ask_e2e',
        type: 'function',
        function: { name: 'Ask', arguments: ASK_ARGUMENTS },
      }
      const events = asks
        ? [
            { model, provider: 'OpenAI', choices: [{ delta: { tool_calls: [call] } }] },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
          ]
        : [
            { model, provider: 'OpenAI', choices: [{ delta: { content: REPLY } }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
          ]
      return {
        status: 200,
        contentType: 'text/event-stream',
        body: events
          .map(event => `data: ${JSON.stringify(event)}\n\n`)
          .concat('data: [DONE]\n\n')
          .join(''),
      }
    })
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
    removableProfiles.add(directory)
    try {
      await provide(directory)
    } finally {
      if (removableProfiles.delete(directory)) removeUserDataDir(directory)
    }
  },
  launchApp: async ({ target, server, userDataDir }, provide) => {
    const launched: Launched[] = []
    await provide(async () => {
      const app = await launch(target, userDataDir, server)
      launched.push(app)
      return app
    })
    const failures: unknown[] = []
    for (const app of launched)
      try {
        await quit(app)
      } catch (failure) {
        failures.push(failure)
      }
    if (failures.length > 0)
      throw new AggregateError(failures, 'could not close every test app cleanly')
  },
})

export { expect } from '@playwright/test'
