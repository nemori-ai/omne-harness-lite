// The conformance suite of `ProcessLanding`, and an in-memory double that passes it.
import assert from 'node:assert/strict'
import type { Access } from '@omne-harness/legal-identity'
import type {
  ProcessCredentialHandle,
  ProcessEnvironment,
  ProcessHandle,
  ProcessLanding,
  StopScope,
} from './ports.ts'
import { NotApplicable, conformanceCase, handle, type ConformanceCase } from './testing-case.ts'
import { memorySecretOf } from './testing-credentials.ts'
import type { StdioLaunch } from './values.ts'

export type ProcessLandingFixture<P> = Readonly<{
  port: ProcessLanding<P>
  access: Access<P>
  /** A launch that lands. Its credential variables are filled from `credential`. */
  launch: StdioLaunch
  credential: () => Promise<ProcessCredentialHandle>
  /** The secret value behind `credential`, which the process writes to standard error. */
  secret?: string
  missingFacility?: StdioLaunch
  invalidLanding?: StdioLaunch
}>

const STOP_SCOPES: readonly StopScope[] = ['tree-confirmed', 'root-only', 'unconfirmed']

async function environmentOf<P>(fixture: ProcessLandingFixture<P>): Promise<ProcessEnvironment> {
  const credential = await fixture.credential()
  return {
    values: fixture.launch.env
      .filter(binding => binding.source === 'setting')
      .map(binding => ({ name: binding.name, value: 'setting-value' })),
    credentials: fixture.launch.env
      .filter(binding => binding.source === 'credential')
      .map(binding => ({ name: binding.name, handle: credential })),
  }
}

async function started<P>(fixture: ProcessLandingFixture<P>): Promise<ProcessHandle> {
  const answer = await fixture.port.start(
    fixture.access,
    fixture.launch,
    await environmentOf(fixture),
  )
  assert.ok('ok' in answer, 'the process did not start')
  return answer.ok
}

async function textOf(stream: ReadableStream<string>): Promise<string> {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

export function mcpProcessLandingConformance<P>(): readonly ConformanceCase<
  ProcessLandingFixture<P>
>[] {
  return [
    conformanceCase(
      'PL1',
      'starts a process and reports the stop range it confirmed',
      async fixture => {
        const process = await started(fixture)
        const scope = await process.stop()
        assert.ok(STOP_SCOPES.includes(scope), `unknown stop scope ${String(scope)}`)
        if (scope !== 'unconfirmed') await process.exited
      },
    ),
    conformanceCase(
      'PL2',
      'masks secret values before standard error is handed over',
      async fixture => {
        const secret = handle(fixture.secret, 'secret')
        const process = await started(fixture)
        // Standard error ends only when the process has stopped. Without a confirmed stop the
        // case would wait without bound, so it does not read the stream.
        if ((await process.stop()) === 'unconfirmed') throw new NotApplicable('confirmed stop')
        assert.ok(
          !(await textOf(process.stderr)).includes(secret),
          'standard error reveals a secret',
        )
      },
    ),
    conformanceCase('PL3', 'answers facility-missing and starts nothing', async fixture => {
      const launch = handle(fixture.missingFacility, 'launch with a missing facility')
      const env = await environmentOf(fixture)
      assert.deepStrictEqual(await fixture.port.start(fixture.access, launch, env), {
        failure: 'facility-missing',
      })
    }),
    conformanceCase(
      'PL4',
      'answers landing-invalid and does not fall back to the host',
      async fixture => {
        const launch = handle(fixture.invalidLanding, 'launch that cannot land')
        const env = await environmentOf(fixture)
        assert.deepStrictEqual(await fixture.port.start(fixture.access, launch, env), {
          failure: 'landing-invalid',
        })
      },
    ),
    conformanceCase('PL5', 'answers a repeated stop without a smaller range', async fixture => {
      const process = await started(fixture)
      const first = await process.stop()
      const second = await process.stop()
      assert.ok(
        STOP_SCOPES.indexOf(second) <= STOP_SCOPES.indexOf(first),
        `the second stop answered ${second} after ${first}`,
      )
    }),
  ]
}

export type MemoryProcessLanding<P> = ProcessLanding<P> &
  Readonly<{ started(): readonly Readonly<{ launch: StdioLaunch; env: ProcessEnvironment }>[] }>

function memoryProcess(lines: readonly string[]): ProcessHandle {
  let closeStreams = (): void => {}
  let markExited = (): void => {}
  const exited = new Promise<void>(resolve => {
    markExited = resolve
  })
  const stdout = new ReadableStream<Uint8Array>({
    start(controller) {
      const previous = closeStreams
      closeStreams = () => {
        previous()
        controller.close()
      }
    },
  })
  const stderr = new ReadableStream<string>({
    start(controller) {
      for (const line of lines) controller.enqueue(`${line}\n`)
      const previous = closeStreams
      closeStreams = () => {
        previous()
        controller.close()
      }
    },
  })
  let stopped = false
  return {
    stdin: new WritableStream<Uint8Array>(),
    stdout,
    stderr,
    exited,
    async stop() {
      if (!stopped) {
        stopped = true
        closeStreams()
        markExited()
      }
      return 'tree-confirmed'
    },
  }
}

/**
 * A landing without processes. A started process writes each credential variable to standard
 * error with its secret masked, and stops when asked. It refuses the listed commands as
 * `landing-invalid` and a facility it does not offer as `facility-missing`.
 */
export function createMemoryProcessLanding<P>(
  options: Readonly<{ facilities: readonly string[]; refusedCommands?: readonly string[] }>,
): MemoryProcessLanding<P> {
  const record: { launch: StdioLaunch; env: ProcessEnvironment }[] = []
  return {
    async start(_access, launch, env) {
      if (options.refusedCommands?.includes(launch.command) === true)
        return { failure: 'landing-invalid' }
      if (launch.facilities.some(facility => !options.facilities.includes(facility)))
        return { failure: 'facility-missing' }
      record.push({ launch, env })
      const lines = env.credentials.map(({ name, handle: credential }) => {
        const secret = memorySecretOf(credential)
        const line = `${name}=${secret ?? ''}`
        return secret === undefined || secret === '' ? line : line.replaceAll(secret, '***')
      })
      return { ok: memoryProcess(lines) }
    },
    started: () => [...record],
  }
}
