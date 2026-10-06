import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { openJsonlSessionLog, type JsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import type { LogEntryInput, SessionLog } from '@omne-harness-lite/session-log'
import { createSessionLogBacking } from '../src/log-backing.ts'
import { borrowedSessionLog, SessionLogBacking } from '../src/session-log-owner.ts'

const tenant = unwrap(parseTenantId({ organization: 'backing-org', account: 'backing-account' }))
const session = unwrap(parseOpaqueIdentifier('backing-session', 'SessionRef'))
const unfenced = { kind: 'unfenced' } as const
const unconditional = { kind: 'unconditional' } as const
const unavailable = { failure: 'unavailable' } as const
const rows = (): LogEntryInput[] => [
  { tenant, dedupeKey: 'one', readKeys: ['batch'], payload: { one: 1 } },
  { tenant, dedupeKey: 'two', readKeys: ['batch'], payload: { two: 2 } },
]
function latch() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { resolve, promise }
}
async function fixture(
  test: (log: JsonlSessionLog, options: Parameters<typeof openJsonlSessionLog>[0]) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), 'omne-log-backing-'))
  const options = {
    dir,
    processOwnership: { current: 'backing-tests', observeExit: async () => 'unknown' as const },
  }
  const log = await openJsonlSessionLog(options)
  try {
    await test(log, options)
  } finally {
    await log.close()
    await rm(dir, { recursive: true, force: true })
  }
}

it('borrows the real log, waits admitted IO, and closes cached references immediately on release', async () => {
  await fixture(async log => {
    const gate = latch(),
      entered = latch()
    const source: SessionLog = {
      ...log,
      async readSince(...args) {
        entered.resolve()
        await gate.promise
        return log.readSince(...args)
      },
    }
    const backing = createSessionLogBacking(source),
      borrow = backing.operations.borrow()
    const read = borrow.log.readSince(session, 0)
    await entered.promise
    let finished = false
    const release = borrow.release().then(() => {
      finished = true
    })
    expect(backing.retained).toBe(1)
    expect(await borrow.log.append(session, rows(), unfenced, unconditional)).toEqual(unavailable)
    expect(await borrow.log.readSince(session, 0)).toEqual(unavailable)
    expect(await borrow.log.readByKey(session, 'batch')).toEqual(unavailable)
    expect(finished).toBe(false)
    gate.resolve()
    await read
    await release
    expect(backing.retained).toBe(0)
    // Releasing a borrow does not close the application's physical writer.
    expect(await log.append(session, rows(), unfenced, unconditional)).toHaveProperty('tail', 2)
    await backing.drain()
    expect(() => backing.operations.borrow()).toThrow('stopped')
  })
})

it('keeps the physical generation through service replacement and changes it on a real reopen', async () => {
  await fixture(async (log, options) => {
    const backing = createSessionLogBacking(log)
    const firstContext = new Context()
    const first = new SessionLogBacking(firstContext, backing.operations)
    const generation = first.ownerGeneration
    expect(generation).not.toBe('')
    const a = first.borrow(),
      b = first.borrow()
    await a.release()
    await firstContext.fiber.dispose()
    const nextContext = new Context()
    const replacement = new SessionLogBacking(nextContext, backing.operations)
    expect(replacement.ownerGeneration).toBe(generation)
    await b.release()
    await backing.drain()
    await nextContext.fiber.dispose()
    await log.close()
    const successor = await openJsonlSessionLog(options)
    try {
      const fresh = createSessionLogBacking(successor)
      expect(fresh.operations.ownerGeneration).not.toBe(generation)
      expect(() => backing.operations.borrow()).toThrow('stopped')
      await fresh.drain()
    } finally {
      await successor.close()
    }
  })
})

it('recognizes a complete lost receipt without re-appending and coalesces concurrent releases', async () => {
  await fixture(async log => {
    const append = vi.fn(async (...args: Parameters<SessionLog['append']>) => {
      await log.append(...args)
      return unavailable
    })
    const backing = createSessionLogBacking({ ...log, append }),
      borrow = backing.operations.borrow()
    const input = rows()
    const write = borrow.log.append(session, input, unfenced, unconditional)
    input[0] = { tenant, dedupeKey: 'wrong', readKeys: [], payload: 'changed after call' }
    expect(await write).toEqual(unavailable)
    const a = borrow.release(),
      b = borrow.release()
    expect(a).toBe(b)
    await a
    await borrow.release()
    expect(append).toHaveBeenCalledTimes(1)
    expect(backing.retained).toBe(0)
    expect(await log.readSince(session, 0)).toHaveProperty('tail', 2)
  })
})

it('retains the real lock while an unknown old write is absent, then recognizes its late arrival', async () => {
  await fixture(async (log, options) => {
    const gate = latch()
    let late: Promise<unknown> | undefined
    const source: SessionLog = {
      ...log,
      async append(...args) {
        late = gate.promise.then(() => log.append(...args))
        return unavailable
      },
    }
    const backing = createSessionLogBacking(source),
      borrow = backing.operations.borrow()
    expect(await borrow.log.append(session, rows(), unfenced, unconditional)).toEqual(unavailable)
    try {
      await expect(borrow.release()).rejects.toThrow('unresolved')
      expect(backing.retained).toBe(1)
      await expect(openJsonlSessionLog(options)).rejects.toThrow()
      expect(await borrow.log.readSince(session, 0)).toEqual(unavailable)
    } finally {
      gate.resolve()
      await late
    }
    await backing.drain()
    await borrow.release()
    expect(backing.retained).toBe(0)
    expect(await log.readSince(session, 0)).toHaveProperty('tail', 2)
  })
})

it.each(['absent', 'partial', 'different', 'noncontiguous', 'readUnavailable', 'noKey'] as const)(
  'keeps unresolved ownership for %s',
  async kind => {
    await fixture(async log => {
      const input = kind === 'noKey' ? rows().map(({ dedupeKey: _key, ...entry }) => entry) : rows()
      const source: SessionLog = {
        ...log,
        async append(...args) {
          if (kind === 'partial') await log.append(session, [rows()[0]!], unfenced, unconditional)
          else if (kind === 'different')
            await log.append(
              session,
              rows().map(entry => ({ ...entry, payload: 'different' })),
              unfenced,
              unconditional,
            )
          else if (kind === 'noncontiguous')
            await log.append(
              session,
              [rows()[0]!, { tenant, readKeys: [], payload: 'between' }, rows()[1]!],
              unfenced,
              unconditional,
            )
          else if (kind === 'readUnavailable' || kind === 'noKey') await log.append(...args)
          return unavailable
        },
        readSince: kind === 'readUnavailable' ? async () => unavailable : log.readSince,
      }
      const backing = createSessionLogBacking(source),
        borrow = backing.operations.borrow()
      await borrow.log.append(session, input, unfenced, unconditional)
      await expect(backing.drain()).rejects.toThrow('unresolved')
      await expect(borrow.release()).rejects.toThrow('unresolved')
      expect(backing.retained).toBe(1)
      expect(await borrow.log.append(session, rows(), unfenced, unconditional)).toEqual(unavailable)
      // Test cleanup closes the real owner; the backing itself never took that right.
    })
  },
)

it('retains an append that throws after committing and resolves it from the exact prefix', async () => {
  await fixture(async log => {
    const defect = new Error('lost completion')
    const backing = createSessionLogBacking({
      ...log,
      async append(...args) {
        await log.append(...args)
        throw defect
      },
    })
    const borrow = backing.operations.borrow()
    await expect(borrow.log.append(session, rows(), unfenced, unconditional)).rejects.toBe(defect)
    await backing.drain()
    expect(backing.retained).toBe(0)
  })
})

it('uses the declared Cordis dependency and keeps failed disposal responsibility in the application', async () => {
  await fixture(async (log, options) => {
    const ctx = new Context()
    const fiber = ctx.plugin(borrowedSessionLog, {})
    await new Promise(resolve => setImmediate(resolve))
    expect(ctx.get('sessionLog')).toBeUndefined()
    const backing = createSessionLogBacking({
      ...log,
      async append() {
        return unavailable
      },
    })
    new SessionLogBacking(ctx, backing.operations)
    await fiber
    const old = ctx.sessionLog
    expect(await old.append(session, rows(), unfenced, unconditional)).toEqual(unavailable)
    // Cordis can hide the service even when its cleanup fails. The controller remains owned.
    await fiber.dispose().catch(() => undefined)
    expect(ctx.get('sessionLog')).toBeUndefined()
    expect(backing.retained).toBe(1)
    await expect(backing.drain()).rejects.toThrow('unresolved')
    await expect(openJsonlSessionLog(options)).rejects.toThrow()
    expect(await old.readSince(session, 0)).toEqual(unavailable)
    await log.append(session, rows(), unfenced, unconditional)
    await backing.drain()
    await ctx.fiber.dispose().catch(() => undefined)
    expect(backing.retained).toBe(0)
  })
})
