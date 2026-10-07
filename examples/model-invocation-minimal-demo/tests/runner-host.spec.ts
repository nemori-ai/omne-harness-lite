import { mkdir, mkdtemp, open, type FileHandle } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { judgeDefinition, judgePositionedSubject } from '@omne-harness-lite/loop-extension'
import { judgeMessage } from '@omne-harness-lite/messages'
import { prepareRunnerConclusion } from '@omne-harness-lite/loop-extension-runner'
import {
  openJsonlSessionLog,
  type JsonlSessionLog,
  type SessionLogOptions,
} from '@omne-harness-lite/session-log-jsonl'
import {
  readSettlementPrefix,
  interpretCallHistory,
  type SettlementLogBinding,
} from '@omne-harness-lite/model-request-runtime'
import { createDemoRunnerHost, type DemoRunnerRequest } from '../src/runner-host.ts'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createRequestOwner } from '../src/model-request-owner.ts'
import { messagePrefix } from '../src/model-request-text.ts'
import { actor, deployment, latch } from './support.ts'

function identity<K extends string>(text: string, kind: K) {
  const result = parseOpaqueIdentifier(text, kind)
  if (!('ok' in result)) throw new Error('invalid identity')
  return result.ok
}
const at = '2026-09-29T12:00:00Z'
const session = identity('runner-session', 'SessionRef')
const parsedTenant = parseTenantId({ organization: 'runner-org', account: 'runner-account' })
if (!('ok' in parsedTenant)) throw new Error('invalid tenant')
const tenant = parsedTenant.ok

function request(id = 'message'): DemoRunnerRequest {
  const subject = judgePositionedSubject({
    position: 'before_persist_message',
    subject: {
      message: { id, type: 'user', blocks: [], createdAt: at },
      producer: 'user',
    },
  })
  const piece = judgeDefinition({
    name: 'extension',
    position: 'before_persist_message',
    power: 'rewrite',
    implementation: { kind: 'builtin', builtinName: 'extension' },
  })
  if (!('ok' in subject) || !('ok' in piece)) throw new Error('invalid fixture')
  return {
    pass: { initial: subject.ok, anchor: id, execution: { kind: 'noRun' } },
    chain: [{ definition: piece.ok, power: 'rewrite' }],
    subjectForCandidate: () => subject.ok,
    ports: {
      readAskState: async () => ({ kind: 'unavailable' }),
      presence: async () => 'present',
      openHandles: async () => ({
        log: identity('log', 'LogHandle'),
        environment: identity('environment', 'EnvironmentHandle'),
        release() {},
      }),
      invoke: async () => ({ kind: 'output', value: { kind: 'observed' } }),
      verifyFailure: async () => ({ kind: 'unavailable' }),
      judgeCapabilities: async () => ({ kind: 'accepted' }),
      now: () => at,
      mintReminder: () => 'error-reminder',
      isActive: () => true,
      fallbackNeedsProjection: async () => false,
      reminders: { nestedChain: async () => [] },
    },
  }
}
async function fixture(label: string, wrap?: (log: JsonlSessionLog) => JsonlSessionLog) {
  const root = resolve(process.cwd(), '../../tmp/runner-host-completion/files')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const dir = await mkdtemp(join(root, `${label}-`))
  const options: SessionLogOptions = {
    dir,
    processOwnership: { current: label, observeExit: async () => 'unknown' },
  }
  const original = await openJsonlSessionLog(options)
  const log = wrap?.(original) ?? original
  const generation = Object.freeze({})
  const binding: SettlementLogBinding = {
    session,
    tenant,
    log,
    generation,
    currentGeneration: () => generation,
  }
  return { dir, options, original, log, binding, host: createDemoRunnerHost(log, options) }
}

async function fault(dir: string, repairFails: boolean, delayed = false) {
  const probe = await open(join(dirname(dir), `${basename(dir)}.probe`), 'w')
  const prototype = Object.getPrototypeOf(probe) as Pick<FileHandle, 'datasync' | 'truncate'>
  const sync = prototype.datasync,
    truncate = prototype.truncate
  const reached = latch(),
    release = latch()
  let armed = false,
    failures = 0,
    repaired = 0
  const error = () => Object.assign(new Error('runner host injected I/O fault'), { code: 'EIO' })
  const syncSpy = vi.spyOn(prototype, 'datasync').mockImplementation(async function (
    this: FileHandle,
  ) {
    if (armed && delayed) {
      reached.resolve()
      await release.promise
    }
    if (armed && !delayed && (repairFails || failures === 0)) {
      failures++
      throw error()
    }
    return sync.call(this)
  })
  const truncateSpy = vi.spyOn(prototype, 'truncate').mockImplementation(async function (
    this: FileHandle,
    size?: number,
  ) {
    if (armed && repairFails) throw error()
    await truncate.call(this, size)
    if (armed) repaired++
  })
  return {
    reached,
    release,
    arm() {
      armed = true
    },
    clear() {
      armed = false
    },
    stats: () => ({ failures, repaired }),
    async dispose() {
      armed = false
      release.resolve()
      syncSpy.mockRestore()
      truncateSpy.mockRestore()
      await probe.close()
    },
  }
}

describe('actual shared runner JSONL host', () => {
  for (const outcome of ['same', 'winner', 'absent'] as const)
    it(`closes the actual writer before recovering ${outcome} and draining`, async () => {
      let appended = 0,
        closed = false
      const f = await fixture(outcome, real => ({
        ...real,
        async append(s, entries, fence, condition) {
          appended++
          if (outcome === 'same') await real.append(s, entries, fence, condition)
          else if (outcome === 'winner') {
            const winner = prepareRunnerConclusion({
              session,
              tenant,
              execution: { kind: 'noRun' },
              anchor: 'message',
              occurrence: { kind: 'final' },
              value: {
                extension: 'extension',
                position: 'before_persist_message',
                power: 'rewrite',
                at: '2026-09-29T12:00:01Z',
                output: { kind: 'observed' },
              },
              reminders: [],
            })
            if (!('entry' in winner)) throw new Error('invalid winner')
            await real.append(s, [winner.entry], fence, condition)
          }
          return { failure: 'unavailable' }
        },
        async close() {
          await real.close()
          closed = true
        },
      }))
      try {
        expect(await f.host.run(f.binding, request())).toEqual({ failure: 'unavailable' })
        expect(await f.host.run(f.binding, request())).toEqual({ failure: 'unavailable' })
        expect(appended).toBe(1)
        const ended = await f.host.close()
        expect(closed).toBe(true)
        expect(ended).toMatchObject({ complete: true, recovered: [{ kind: outcome }] })
        expect(await f.host.run(f.binding, request())).toEqual({ failure: 'unavailable' })
        expect(await f.host.close()).toEqual(ended)
      } finally {
        await f.original.close()
      }
    })

  it('rejects another physical binding and invalidated generation without invoking', async () => {
    const f = await fixture('generation'),
      other = await fixture('other')
    const r = request(),
      invoke = vi.fn(r.ports.invoke)
    try {
      expect(
        await f.host.run({ ...f.binding, log: other.log }, { ...r, ports: { ...r.ports, invoke } }),
      ).toEqual({ failure: 'unavailable' })
      expect(
        await f.host.run(
          { ...f.binding, currentGeneration: () => null },
          { ...r, ports: { ...r.ports, invoke } },
        ),
      ).toEqual({ failure: 'unavailable' })
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      await f.host.close()
      await other.host.close()
    }
  })

  it('waits for a real delayed datasync and resolves the retained receipt after physical stop', async () => {
    const f = await fixture('delay'),
      io = await fault(f.dir, false, true)
    try {
      // Load the resident before arming; the fault controls the actual commit datasync.
      await f.log.append(
        session,
        [{ tenant, payload: 'warmup', readKeys: [] }],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      io.arm()
      const sending = f.host.run(f.binding, request())
      await io.reached.promise
      let closed = false
      const closing = f.host.close().then(result => {
        closed = true
        return result
      })
      await new Promise(resolve => setImmediate(resolve))
      expect(closed).toBe(false)
      io.clear()
      io.release.resolve()
      await sending
      expect(await closing).toMatchObject({ complete: true })
    } finally {
      await io.dispose()
      await f.host.close()
    }
  })

  it('recovers authoritative absence only after real datasync failure and successful repair', async () => {
    const f = await fixture('rollback'),
      io = await fault(f.dir, false)
    try {
      await f.log.append(
        session,
        [{ tenant, payload: 'warmup', readKeys: [] }],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      io.arm()
      expect(await f.host.run(f.binding, request())).toEqual({ failure: 'unavailable' })
      expect(io.stats()).toEqual({ failures: 1, repaired: 1 })
      io.clear()
      expect(await f.host.close()).toMatchObject({
        complete: true,
        recovered: [{ kind: 'absent' }],
      })
    } finally {
      await io.dispose()
      await f.original.close()
    }
  })

  for (const exit of ['alive', 'unknown'] as const)
    it(`keeps unknown responsibility when the old process is ${exit}`, async () => {
      const f = await fixture(`untrusted-${exit}`),
        io = await fault(f.dir, true)
      const host = createDemoRunnerHost(f.log, {
        ...f.options,
        processOwnership: { current: `recovery-${exit}`, observeExit: async () => exit },
      })
      try {
        await f.log.append(
          session,
          [{ tenant, payload: 'warmup', readKeys: [] }],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        )
        io.arm()
        expect(await host.run(f.binding, request())).toEqual({ failure: 'unavailable' })
        io.clear()
        expect(await host.close()).toEqual({ complete: false, recovered: [] })
        expect(await host.close()).toEqual({ complete: false, recovered: [] })
        expect(await host.run(f.binding, request())).toEqual({ failure: 'unavailable' })
      } finally {
        await io.dispose()
        await f.original.close()
      }
    })

  it('holds an actual invocation until it stops, even after the pass reports cancellation', async () => {
    const f = await fixture('invocation'),
      started = latch(),
      stopped = latch(),
      r = request()
    let closeDone = false
    const sending = f.host.run(f.binding, {
      ...r,
      ports: {
        ...r.ports,
        async invoke(_piece, _input, signal) {
          started.resolve()
          await stopped.promise
          expect(signal.aborted).toBe(true)
          return { kind: 'output', value: { kind: 'observed' } }
        },
      },
    })
    await started.promise
    const closing = f.host.close().then(result => {
      closeDone = true
      return result
    })
    expect(await sending).toEqual({ failure: 'cancelled' })
    expect(closeDone).toBe(false)
    stopped.resolve()
    expect(await closing).toMatchObject({ complete: true })
  })

  it('runs through the authenticated application, persists a reminder after a conclusion, replays and reopens', async () => {
    const base = await deployment('runner-app'),
      dir = join(dirname(base.databaseFile), 'logs')
    await mkdir(dir, { mode: 0o700 })
    const config = {
      ...base,
      sessionLog: {
        dir,
        policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
        processOwnership: { current: 'runner-app', observeExit: async () => 'unknown' as const },
      },
    }
    const app = createAcceptanceApplication(config, {
      stage: 'sessionLog',
      diagnostics: { record() {} },
    })
    await app.ready
    try {
      const who = await actor(app)
      await app.prepareSession(who, session)
      expect(await app.runExtensionPass(who, session, request())).toMatchObject({
        effect: { kind: 'proceed' },
      })
      const reminder = judgeMessage({
        id: 'reminder',
        type: 'system_reminder',
        blocks: [],
        createdAt: at,
        nature: 'event',
        source: { kind: 'extension', extension: 'extension' },
      })
      if (!('ok' in reminder)) throw new Error('bad reminder')
      const r = request('message-two'),
        invoke = vi.fn(async () => ({
          kind: 'output' as const,
          value: { kind: 'inject', message: reminder.ok },
        }))
      const injected = { ...r, ports: { ...r.ports, invoke } }
      expect(await app.runExtensionPass(who, session, injected)).toMatchObject({
        effect: { kind: 'proceed' },
      })
      expect(await app.runExtensionPass(who, session, injected)).toMatchObject({
        effect: { kind: 'proceed' },
      })
      expect(invoke).toHaveBeenCalledTimes(1)
      expect(await app.readSessionLog(who, session)).toMatchObject({ tail: 3 })
      expect(await app.close()).toMatchObject({ complete: true })
      const reopened = await openJsonlSessionLog(config.sessionLog)
      const generation = {},
        owner = createRequestOwner('read-reopened'),
        acquired = owner.owner.acquire(1)
      if ('unavailable' in acquired) throw new Error('read owner unavailable')
      try {
        const prefix = await readSettlementPrefix({
          binding: {
            session,
            tenant: who.tenant,
            log: reopened,
            generation,
            currentGeneration: () => generation,
          },
          registration: acquired.registration,
        })
        if (!('prefix' in prefix)) throw new Error('prefix unavailable')
        expect(messagePrefix(prefix.prefix)).toMatchObject({ messages: [{ id: 'reminder' }] })
        expect(
          interpretCallHistory({
            prefix: prefix.prefix,
            callId: identity('not-opened', 'ModelCallId'),
          }),
        ).not.toHaveProperty('unavailable')
      } finally {
        acquired.registration.release()
        owner.release()
        await reopened.close()
      }
    } finally {
      await app.close()
    }
  })

  it('application close recovers its own unknown append without awaiting drain first', async () => {
    const base = await deployment('runner-app-unknown')
    const dir = join(dirname(base.databaseFile), 'logs')
    await mkdir(dir, { mode: 0o700 })
    const config = {
      ...base,
      sessionLog: {
        dir,
        policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
        processOwnership: {
          current: 'runner-app-unknown',
          observeExit: async () => 'unknown' as const,
        },
      },
    }
    const app = createAcceptanceApplication(config, {
      stage: 'sessionLog',
      diagnostics: { record() {} },
    })
    const io = await fault(dir, false)
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, session)
      expect(await app.runExtensionPass(who, session, request('warmup'))).toMatchObject({
        effect: { kind: 'proceed' },
      })
      io.arm()
      expect(await app.runExtensionPass(who, session, request('unknown'))).toEqual({
        failure: 'unavailable',
      })
      io.clear()
      expect(io.stats()).toEqual({ failures: 1, repaired: 1 })
      expect(await app.close()).toMatchObject({ complete: true })
      expect(await app.runExtensionPass(who, session, request())).toEqual({
        failure: 'stageClosed',
      })
      const reopened = await openJsonlSessionLog(config.sessionLog)
      try {
        expect(await reopened.readSince(session, 0)).toMatchObject({ tail: 1 })
      } finally {
        await reopened.close()
      }
    } finally {
      await io.dispose()
      await app.close()
    }
  })

  it('never hides malformed entries claiming the runner domain in model history', async () => {
    const f = await fixture('malformed-runner')
    const owner = createRequestOwner('malformed-reader'),
      acquired = owner.owner.acquire(1)
    if ('unavailable' in acquired) throw new Error('read registration unavailable')
    try {
      await f.log.append(
        session,
        [{ tenant, payload: { format: 'runner/1', category: 'conclusion' }, readKeys: [] }],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      const prefix = await readSettlementPrefix({
        binding: f.binding,
        registration: acquired.registration,
      })
      if (!('prefix' in prefix)) throw new Error('prefix unavailable')
      expect(messagePrefix(prefix.prefix)).toEqual({ unavailable: true })
    } finally {
      acquired.registration.release()
      owner.release()
      await f.host.close()
    }
  })
})
