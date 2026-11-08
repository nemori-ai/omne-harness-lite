/** @module-tag slow */
// Slow: one-shot commands on macOS through the real gate, the real session reader and the real
// kernel. Sessions do not meet closed containment, so nothing is retained: the facility has no
// retention extension, every completed outcome carries `residue`, leftovers are stopped with the
// first unmet reason, and a stop is confirmed only once every member is gone by pid. A provider
// that dies leaves nothing running, and a fresh provider recovers what the index lists. The tests
// run only on macOS with `OMNE_HOST_MACOS=1`; elsewhere they are skipped, and a skip is not a pass.
import { execFile, spawn } from 'node:child_process'
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { sessionReader } from '../../src/macos-execution/compile.ts'
import { readIdentity } from '../../src/macos-execution/session.ts'
import {
  acquisitionLedger,
  alive,
  cleanup,
  commandOf,
  enabled,
  eventually,
  finished,
  freshScope,
  hostProvider,
  killAll,
  leaseOf,
  pidsIn,
  processLedger,
  request,
  started,
  workDirectory,
} from './fixture.ts'

const run = promisify(execFile)
const spawned: number[] = []
afterEach(async () => {
  killAll(spawned.splice(0))
  await cleanup()
})

/** Leaves three processes behind: a plain background job, a nohup job, and a job-control group. */
const leaveThree = `
  /bin/sleep 300 & echo $! >> pids
  nohup /bin/sleep 301 >/dev/null 2>&1 & echo $! >> pids
  /bin/sh -c 'set -m; /bin/sleep 302 & echo $! >> pids; wait' >/dev/null 2>&1 & echo $! >> pids
  sleep 0.2; echo left`

async function bound(options: { policy?: 'stop'; processes?: boolean; otherScope?: boolean } = {}) {
  const cwd = await workDirectory()
  const provider = hostProvider(
    undefined,
    options.policy === undefined ? {} : { command: { residuePolicy: 'stop' } },
  )
  const own = acquisitionLedger()
  const processes = processLedger()
  const released = new AbortController()
  const scope = freshScope()
  const lease = await leaseOf(provider, own.ledger, {
    scope,
    released: released.signal,
    ...(options.otherScope === true ? { retentionScope: freshScope() } : {}),
    ...(options.processes === false ? {} : { processes: processes.ledger }),
  })
  return { cwd, provider, own, processes, released, lease, command: commandOf(lease) }
}

describe('C11 and a clean exit', () => {
  it('reports residue none, stops the gate, confirms and has no retention extension', async ctx => {
    if (!enabled) return ctx.skip()
    const { cwd, own, command } = await bound()
    expect(command.retention).toBeUndefined()
    const handle = await started(command, request(cwd, 'echo hello; echo oops >&2'))
    const { outcome, text } = await finished(handle)
    expect(outcome).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
      residue: { kind: 'none' },
    })
    expect(text).toBe('hello\noops\n')
    await eventually(() => own.stopped.length === 1)
    expect(own.stopped).toEqual([[own.plans[0]?.key, 'confirmed']])
  })

  it('gives the command only the requested environment, and the gate holds none of the provider', async ctx => {
    if (!enabled) return ctx.skip()
    process.env['OMNE_PROVIDER_SECRET_PROBE'] = 'leak-me'
    try {
      const { cwd, command } = await bound()
      const env = await started(
        command,
        request(cwd, '', {
          executable: '/usr/bin/env',
          args: [],
          env: { PATH: '/usr/bin:/bin', OMNE_ONLY: 'x y' },
        }),
      )
      const own = (await finished(env)).text
      expect(own.trim().split('\n').sort()).toEqual(['OMNE_ONLY=x y', 'PATH=/usr/bin:/bin'])
      const handle = await started(command, request(cwd, '/bin/ps eww -o command= -p $PPID'))
      const parent = (await finished(handle)).text
      expect(parent).toContain('command-gate')
      expect(parent).not.toContain('OMNE_PROVIDER_SECRET_PROBE')
      // The reading itself shows a parent's environment when it has one.
      const { stdout } = await run('/bin/sh', ['-c', '/bin/ps eww -o command= -p $$'], {
        env: { PATH: '/usr/bin:/bin', OMNE_PROVIDER_SECRET_PROBE: 'leak-me' },
      })
      expect(stdout).toContain('OMNE_PROVIDER_SECRET_PROBE=leak-me')
    } finally {
      delete process.env['OMNE_PROVIDER_SECRET_PROBE']
    }
  })
})

describe('leftovers are stopped: StopTruth and the reasons', () => {
  it.for([
    ['uncontained', {}],
    ['policy', { policy: 'stop' as const }],
    ['unbound', { processes: false }],
    ['policy', { otherScope: true }],
  ] as const)(
    'answers stopping (%s), and every leftover is gone by pid before the stop is recorded',
    async ([reason, options], ctx) => {
      if (!enabled) return ctx.skip()
      const { cwd, own, command } = await bound(options)
      const handle = await started(command, request(cwd, leaveThree))
      const { outcome, text } = await finished(handle)
      const pids = await pidsIn(join(cwd, 'pids'))
      spawned.push(...pids)
      expect(text).toBe('left\n')
      expect(pids).toHaveLength(4)
      expect(outcome).toMatchObject({ kind: 'completed', residue: { kind: 'stopping', reason } })
      await eventually(() => own.stopped.length === 1)
      expect(own.stopped).toEqual([[own.plans[0]?.key, 'confirmed']])
      expect(pids.filter(alive)).toEqual([])
    },
  )

  it('answers closed when the retention scope closed before the exit', async ctx => {
    if (!enabled) return ctx.skip()
    const { cwd, released, command } = await bound()
    const handle = await started(command, request(cwd, `sleep 0.5; ${leaveThree}`))
    released.abort()
    const { outcome } = await finished(handle)
    spawned.push(...(await pidsIn(join(cwd, 'pids'))))
    expect(outcome).toMatchObject({
      kind: 'completed',
      residue: { kind: 'stopping', reason: 'closed' },
    })
    await eventually(async () => (await pidsIn(join(cwd, 'pids'))).every(pid => !alive(pid)))
  })
})

describe('stop, release and the provider going away', () => {
  it('a forced stop of a running command stops its whole session', async ctx => {
    if (!enabled) return ctx.skip()
    const { cwd, own, command } = await bound()
    const handle = await started(command, request(cwd, `${leaveThree}; exec /bin/sleep 303`))
    await eventually(async () => (await pidsIn(join(cwd, 'pids'))).length === 4)
    const pids = await pidsIn(join(cwd, 'pids'))
    spawned.push(...pids)
    expect(await handle.stop('forced')).toBe('confirmed')
    expect(pids.filter(alive)).toEqual([])
    expect(own.stopped).toEqual([[own.plans[0]?.key, 'confirmed']])
    expect((await handle.result).kind).toBe('failed')
    expect(await handle.stop('forced')).toBe('confirmed')
    expect(own.stopped).toHaveLength(1)
  })

  it('a graceful stop sends SIGTERM and confirms once the session is empty', async ctx => {
    if (!enabled) return ctx.skip()
    const { cwd, own, command } = await bound()
    const handle = await started(
      command,
      request(cwd, '', { executable: '/bin/sleep', args: ['30'] }),
    )
    expect(await handle.stop('graceful')).toBe('confirmed')
    expect(await handle.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'signal', signal: 'SIGTERM' },
    })
    expect(own.stopped).toContainEqual([own.plans[0]?.key, 'confirmed'])
  })

  it('a graceful stop past the grace answers unconfirmed and does not escalate', async ctx => {
    if (!enabled) return ctx.skip()
    const cwd = await workDirectory()
    const own = acquisitionLedger()
    const provider = hostProvider(undefined, { command: { graceMs: 300 } })
    const command = commandOf(await leaseOf(provider, own.ledger, { scope: freshScope() }))
    const handle = await started(
      command,
      request(cwd, 'trap "" TERM; echo $$ > pids; while :; do sleep 0.1; done'),
    )
    await eventually(async () => (await pidsIn(join(cwd, 'pids'))).length === 1)
    const [shell] = await pidsIn(join(cwd, 'pids'))
    if (shell === undefined) throw new Error('no shell pid')
    spawned.push(shell)
    expect(await handle.stop('graceful')).toBe('unconfirmed')
    expect(own.stopped).toEqual([[own.plans[0]?.key, 'unconfirmed']])
    expect(alive(shell)).toBe(true)
    expect(await handle.stop('forced')).toBe('confirmed')
    expect(alive(shell)).toBe(false)
    expect(own.stopped).toEqual([
      [own.plans[0]?.key, 'unconfirmed'],
      [own.plans[0]?.key, 'confirmed'],
    ])
  })

  it('the release of the acquisition stops what it still runs before it settles', async ctx => {
    if (!enabled) return ctx.skip()
    const { cwd, own, lease, command } = await bound()
    const handle = await started(command, request(cwd, `${leaveThree}; exec /bin/sleep 303`))
    await eventually(async () => (await pidsIn(join(cwd, 'pids'))).length === 4)
    const pids = await pidsIn(join(cwd, 'pids'))
    spawned.push(...pids)
    expect(await lease.release()).toEqual({ kind: 'released' })
    expect(pids.filter(alive)).toEqual([])
    expect(own.stopped).toEqual([[own.plans[0]?.key, 'confirmed']])
    expect(await handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
    expect(await command.start(request(cwd, 'exit 0'))).toMatchObject({
      kind: 'rejected',
      reason: 'closed',
    })
  })

  it('a provider killed with SIGKILL leaves nothing running; a fresh provider lists and recovers', async ctx => {
    if (!enabled) return ctx.skip()
    const cwd = await workDirectory()
    const state = await workDirectory('omne-macos-state-')
    const scope = freshScope()
    const script = join(cwd, 'provider.ts')
    const source = fileURLToPath(new URL('../../src/index.ts', import.meta.url))
    const fixture = fileURLToPath(new URL('./fixture.ts', import.meta.url))
    await writeFile(
      script,
      `import { createHostFilesProvider, createHostFilesDomain } from ${JSON.stringify(source)}
import { acquisitionLedger, leaseOf, commandOf, request, started, scopeOf } from ${JSON.stringify(fixture)}
const provider = createHostFilesProvider({ domain: createHostFilesDomain(), stateDirectory: ${JSON.stringify(state)} })
const lease = await leaseOf(provider, acquisitionLedger().ledger, { scope: scopeOf(${JSON.stringify(scope.ref)}) })
await started(commandOf(lease), request(${JSON.stringify(cwd)}, ${JSON.stringify(`${leaveThree}; exec /bin/sleep 304`)}))
console.log('running')
setInterval(() => {}, 1000)
`,
    )
    for (const killGate of [false, true]) {
      await writeFile(join(cwd, 'pids'), '')
      const child = spawn(
        process.execPath,
        ['--conditions=source', '--experimental-strip-types', script],
        {
          stdio: ['ignore', 'pipe', 'inherit'],
        },
      )
      if (child.pid !== undefined) spawned.push(child.pid)
      await new Promise<void>(resolve => child.stdout?.once('data', () => resolve()))
      await eventually(async () => (await pidsIn(join(cwd, 'pids'))).length === 4)
      const pids = await pidsIn(join(cwd, 'pids'))
      spawned.push(...pids)
      const reader = await sessionReader()
      if (reader.kind !== 'ready') throw new Error('no reader')
      const identity = await readIdentity({
        reader: reader.path,
        pid: pids[0] ?? 0,
        boundMs: 5_000,
      })
      if (identity?.kind !== 'alive') throw new Error('leftover not alive')
      const gate = identity.sid
      spawned.push(gate)
      child.kill('SIGKILL')
      if (killGate) process.kill(gate, 'SIGKILL')
      if (!killGate) {
        // The gate saw its control channel end and stopped its session.
        await eventually(() => pids.every(pid => !alive(pid)) && !alive(gate))
      } else expect(pids.filter(alive)).toHaveLength(4)
      const fresh = hostProvider(state)
      const listed = await fresh.listRecoveryResources?.(scope)
      if (listed?.kind !== 'listed')
        throw new Error(`expected a listing: ${JSON.stringify(listed)}`)
      expect(listed.resources).toHaveLength(1)
      const resource = listed.resources[0]
      if (resource === undefined) throw new Error('no resource')
      expect(await fresh.recover?.(resource)).toMatchObject({ status: 'confirmedStopped' })
      expect(pids.filter(alive)).toEqual([])
      expect(await readdir(join(state, 'macos-domains'))).toEqual([])
      expect(await fresh.listRecoveryResources?.(scope)).toEqual({ kind: 'listed', resources: [] })
    }
  })
})

describe('the cold listing without a state directory', () => {
  it('is unavailable, not empty', async ctx => {
    if (!enabled) return ctx.skip()
    const provider = hostProvider(undefined)
    expect(await provider.listRecoveryResources?.(freshScope())).toEqual({ kind: 'unavailable' })
  })
})

describe('a request that fails before any process', () => {
  it('answers unavailable for an image that does not start, and stops the gate', async ctx => {
    if (!enabled) return ctx.skip()
    const { cwd, own, command } = await bound()
    const answer = await command.start(request(cwd, '', { executable: '/nonexistent/omne' }))
    expect(answer).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
    expect(own.stopped).toEqual([[own.plans[0]?.key, 'confirmed']])
  })
})
