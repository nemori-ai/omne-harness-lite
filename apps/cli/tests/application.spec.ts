import { describe, expect, it, vi } from 'vitest'
import type {
  ActionReport,
  GovernanceClientOperations,
} from '@omne-harness-lite/governance-client-operations'
import { runCli, providers, type CliRuntime } from '../src/application.ts'
import { commands } from '../src/parser.ts'
import { json, unopened } from '../src/presentation.ts'
const healthCommand = commands.find(c => c.action === 'health')!
const origin = {
  centerId: '11111111111111111111111111111111',
  accountId: null,
  loginStateHandle: null,
}
const report: ActionReport = {
  ...unopened(healthCommand, 'invalid-input'),
  origin,
  admission: { status: 'admitted' },
  remote: {
    status: 'success',
    stage: 'health',
    sendAttempted: false,
    health: { reachable: true, centerId: origin.centerId, version: 'test' },
  },
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(yes => {
    resolve = yes
  })
  return { promise, resolve }
}
function fixture(overrides: Partial<CliRuntime> = {}) {
  const controller = new AbortController(),
    order: string[] = [],
    stdout: string[] = [],
    stderr: string[] = []
  const state = {
    read: vi.fn(),
    compareAndReplace: vi.fn(),
    close: vi.fn(async () => {
      order.push('state-close')
    }),
  }
  const client: GovernanceClientOperations = {
    runAction: vi.fn(),
    openUse: vi.fn(),
    close: vi.fn(async () => {
      order.push('client-close')
    }),
    runPrepared: vi.fn(async (intent, prompt) => {
      order.push('client-action')
      const result = await prompt(
        {
          intent: { action: 'health' },
          origin,
          endpoint: 'https://center.invalid/',
          source: 'local-selection',
        },
        controller.signal,
      )
      if (result.kind === 'cancelled') return unopened(healthCommand, 'invalid-input')
      return report
    }),
  }
  const runtime: CliRuntime = {
    ...providers(),
    signal: controller.signal,
    stdoutIsTTY: true,
    home: '/test-home',
    stdout: async text => {
      order.push('stdout')
      stdout.push(text)
    },
    stderr: async text => {
      stderr.push(text)
    },
    openState: vi.fn(async () => {
      order.push('state-open')
      return state
    }),
    createClient: vi.fn(() => client),
    ...overrides,
  }
  return { runtime, controller, order, stdout, stderr, client, state }
}
describe('CLI owns process resources and preserves governance facts', () => {
  it('normal machine output follows complete client then state close', async () => {
    const f = fixture()
    expect(await runCli(['machine', 'center', 'health'], f.runtime)).toBe(0)
    expect(f.order).toEqual([
      'state-open',
      'client-action',
      'client-close',
      'state-close',
      'stdout',
    ])
    expect(f.stdout).toHaveLength(1)
    expect(JSON.parse(f.stdout[0]!)).toEqual(report)
    expect(f.stderr).toEqual([])
  })
  it('human preview precedes secrets, uses only the supplied capture, and final output follows close', async () => {
    const f = fixture()
    let secretsCalled = false
    const runtime = {
      ...f.runtime,
      secrets: vi.fn(async () => {
        expect(f.stdout[0]).toContain('Operation preview:')
        expect(f.stdout[0]).toContain(origin.centerId)
        secretsCalled = true
        return { kind: 'continue' as const, secrets: {} }
      }),
    }
    expect(await runCli(['center', 'health'], runtime)).toBe(0)
    expect(secretsCalled).toBe(true)
    expect(f.order).toEqual([
      'state-open',
      'client-action',
      'stdout',
      'client-close',
      'state-close',
      'stdout',
    ])
  })
  it('all human governance commands require stdout TTY and do not open state on rejection', async () => {
    const f = fixture({ stdoutIsTTY: false })
    expect(await runCli(['center', 'health'], f.runtime)).toBe(2)
    expect(f.runtime.openState).not.toHaveBeenCalled()
    expect(f.stdout).toEqual([])
    expect(f.stderr).toEqual(['omne: tty-required\n'])
  })
  it.each(['--help', '--version'])(
    'pure %s does not open state even through a pipe',
    async option => {
      const f = fixture({ stdoutIsTTY: false })
      expect(await runCli([option], f.runtime)).toBe(0)
      expect(f.runtime.openState).not.toHaveBeenCalled()
    },
  )
  it('unexpected action rejection cannot fabricate a not-attempted document', async () => {
    const f = fixture()
    f.client.runPrepared = vi.fn(async () => {
      throw new Error('PRIVATE')
    })
    expect(await runCli(['machine', 'center', 'health'], f.runtime)).toBe(70)
    expect(f.stdout).toEqual([])
    expect(f.order).toEqual(['state-open', 'client-close', 'state-close'])
    expect(f.stderr.join('')).not.toContain('PRIVATE')
  })
  it('CG close rejection preserves the report, exits 70, and does not withdraw borrowed state', async () => {
    const f = fixture()
    f.client.close = vi.fn(async () => {
      throw new Error('PRIVATE')
    })
    expect(await runCli(['machine', 'center', 'health'], f.runtime)).toBe(70)
    expect(f.state.close).not.toHaveBeenCalled()
    expect(JSON.parse(f.stdout[0]!)).toEqual(report)
    expect(f.stderr).toEqual(['omne: client-close-failed\n'])
  })
  it('CLS close rejection does not change the recorded local or remote outcome', async () => {
    const f = fixture()
    f.state.close = vi.fn(async () => {
      throw new Error('PRIVATE')
    })
    expect(await runCli(['machine', 'center', 'health'], f.runtime)).toBe(70)
    expect(JSON.parse(f.stdout[0]!)).toEqual(report)
    expect(f.stderr).toEqual(['omne: state-close-failed\n'])
  })
  it('EPIPE and a broken diagnostic stream do not retry output or business', async () => {
    const stdout = vi.fn(async () => {
        throw new Error('EPIPE PRIVATE')
      }),
      stderr = vi.fn(async () => {
        throw new Error('PRIVATE')
      })
    const f = fixture({ stdout, stderr })
    expect(await runCli(['machine', 'center', 'health'], f.runtime)).toBe(70)
    expect(stdout).toHaveBeenCalledTimes(1)
    expect(stderr).toHaveBeenCalledTimes(1)
    expect(f.client.runPrepared).toHaveBeenCalledTimes(1)
    expect(f.state.close).toHaveBeenCalledTimes(1)
  })
  it('a handled stop waits for accepted work and its close before releasing state', async () => {
    const f = fixture(),
      entered = deferred(),
      settled = deferred()
    f.client.runPrepared = vi.fn(async () => {
      entered.resolve()
      await settled.promise
      f.order.push('settled')
      return report
    })
    f.client.close = vi.fn(async () => {
      f.order.push('close-request')
      await settled.promise
      f.order.push('closed')
    })
    const running = runCli(['machine', 'center', 'health'], f.runtime)
    await entered.promise
    f.controller.abort()
    expect(f.state.close).not.toHaveBeenCalled()
    expect(f.stdout).toEqual([])
    settled.resolve()
    expect(await running).toBe(0)
    expect(f.order.indexOf('state-close')).toBeGreaterThan(f.order.indexOf('settled'))
    expect(f.order.indexOf('state-close')).toBeGreaterThan(f.order.indexOf('closed'))
    expect(f.client.close).toHaveBeenCalledTimes(1)
  })
  it('a stop during actual input read waits for it, then never opens state', async () => {
    const entered = deferred(),
      release = deferred()
    const f = fixture({
      intent: async () => {
        entered.resolve()
        await release.promise
        return { action: 'health' }
      },
    })
    let done = false
    const running = runCli(['machine', 'center', 'health'], f.runtime).then(code => {
      done = true
      return code
    })
    await entered.promise
    f.controller.abort()
    await Promise.resolve()
    expect(done).toBe(false)
    release.resolve()
    expect(await running).toBe(2)
    expect(f.runtime.openState).not.toHaveBeenCalled()
  })
  it('turns output control sequences into JSON data including C1 and bidi controls', () => {
    const encoded = json({ id: '\u001b]52;secret\u0007\u009b\u202e' })
    expect(encoded).not.toMatch(/[\x00-\x1f\x7f-\x9f\u202a-\u202e]/)
    expect(JSON.parse(encoded)).toEqual({ id: '\u001b]52;secret\u0007\u009b\u202e' })
  })
  it('retains machine mode behind a global option when later syntax is invalid', async () => {
    const f = fixture({ stdoutIsTTY: false })
    expect(
      await runCli(
        ['--state-dir', '/chosen', 'machine', 'center', 'health', '--unknown'],
        f.runtime,
      ),
    ).toBe(2)
    expect(JSON.parse(f.stdout[0]!).remote).toEqual({
      status: 'not-attempted',
      stage: 'none',
      sendAttempted: false,
    })
    expect(f.stderr).toEqual(['omne: invalid-options\n'])
    expect(f.runtime.openState).not.toHaveBeenCalled()
  })
})

it('a malformed build identity fails without opening state or emitting a version', async () => {
  const f = fixture({
    version: async () => {
      throw new Error('PRIVATE')
    },
  })
  expect(await runCli(['--version'], f.runtime)).toBe(70)
  expect(f.runtime.openState).not.toHaveBeenCalled()
  expect(f.stdout).toEqual([])
  expect(f.stderr).toEqual(['omne: internal-defect\n'])
})
