import { createRequire, syncBuiltinESMExports } from 'node:module'
import type { ExactUse, OwnerPublication, PendingAdmission } from '@omne-harness-lite/admission'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeStack,
  createStack,
  operation,
  prepareAdmission,
  removeStack,
  turn,
  useBinding,
  type Stack,
} from './fixtures.js'

const journalFault = vi.hoisted(() => ({
  path: '',
  mode: 'none' as 'none' | 'block_sync' | 'fail_sync',
  armed: false,
  triggered: false,
  releaseSync: null as null | (() => void),
  opened: [] as string[],
  syncCalls: 0,
  blockAt: 1,
}))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      const openedPath = String(args[0])
      journalFault.opened.push(openedPath)
      if (!openedPath.endsWith('/journal.jsonl')) return handle
      const originalSync = handle.sync.bind(handle)
      vi.spyOn(handle, 'sync').mockImplementation(async () => {
        if (openedPath !== journalFault.path || !journalFault.armed) {
          return originalSync()
        }
        journalFault.syncCalls += 1
        if (journalFault.syncCalls !== journalFault.blockAt || journalFault.triggered) {
          return originalSync()
        }
        journalFault.triggered = true
        if (journalFault.mode === 'fail_sync') {
          throw Object.assign(new Error('injected journal sync failure'), { code: 'EIO' })
        }
        if (journalFault.mode === 'block_sync') {
          await new Promise<void>(resolveSync => {
            journalFault.releaseSync = resolveSync
          })
        }
        return originalSync()
      })
      return handle
    },
  }
})

const nodeFs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs')
type FlexibleWrite = (...args: unknown[]) => unknown
const stacks = new Set<Stack>()

afterEach(async () => {
  journalFault.releaseSync?.()
  journalFault.path = ''
  journalFault.mode = 'none'
  journalFault.armed = false
  journalFault.triggered = false
  journalFault.releaseSync = null
  journalFault.opened.length = 0
  journalFault.syncCalls = 0
  journalFault.blockAt = 1
  vi.restoreAllMocks()
  syncBuiltinESMExports()
  await Promise.allSettled([...stacks].map(closeStack))
  await Promise.all([...stacks].map(removeStack))
  stacks.clear()
})

function pending(
  result: ReturnType<Stack['admission']['coordinator']['submit']>,
): PendingAdmission {
  expect(result.status).toBe('pending_durability')
  if (result.status !== 'pending_durability') {
    throw new Error(`expected pending durability, got ${result.status}`)
  }
  return result
}

async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  do {
    if (predicate()) return
    await new Promise<void>(resolveWait => setTimeout(resolveWait, 5))
  } while (Date.now() < deadline)
  throw new Error(
    `timed out waiting for ${description}; opened=${JSON.stringify(journalFault.opened)}`,
  )
}

async function waitUntilDiagnosticsIdle(stack: Stack): Promise<void> {
  await waitFor(
    () => stack.diagnosticRuntime.inspect().writeProgress === 'idle',
    'diagnostics idle',
  )
}

function failNextDiagnosticWrite(): Readonly<{ calls: () => number }> {
  const originalWrite = nodeFs.write as unknown as FlexibleWrite
  let calls = 0
  vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
    calls += 1
    if (calls > 1) return originalWrite(...args)
    const callback = args.at(-1)
    if (typeof callback !== 'function') throw new Error('unexpected fs.write signature')
    process.nextTick(() =>
      callback(Object.assign(new Error('diagnostic sink unavailable'), { code: 'EIO' }), 0),
    )
    return undefined
  }) as typeof nodeFs.write)
  syncBuiltinESMExports()
  return { calls: () => calls }
}

function noEffectUntilReady(completion: PendingAdmission['completion'], effect: () => void) {
  return completion.then(result => {
    if (result.status === 'committed' && result.publication === 'ready') effect()
    return result
  })
}

describe('A08 durability gating on the actual journal', () => {
  it('publishes logical state before I/O but exposes no completion or effect while fsync is blocked', async () => {
    const stack = await createStack('blocked-sync-', ['authorization'])
    stacks.add(stack)
    const logical: string[] = []
    const durable: string[] = []
    let effects = 0
    const prepared = prepareAdmission(stack.admission, 'blocked-sync', [
      {
        owner: 'authorization',
        publishLogical: position => {
          logical.push(position.seq)
          return undefined
        },
        publishDurable: receipt => {
          durable.push(receipt.position.seq)
          return undefined
        },
      },
    ])
    journalFault.path = `${stack.recordDirectory}/journal.jsonl`
    journalFault.mode = 'block_sync'
    journalFault.armed = true

    const submission = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, prepared),
      ),
    )
    let completed = false
    const observed = noEffectUntilReady(submission.completion, () => {
      effects += 1
    }).finally(() => {
      completed = true
    })
    await waitFor(() => journalFault.triggered, 'journal sync interception')

    expect(logical).toEqual(['2'])
    expect(durable).toEqual([])
    expect(completed).toBe(false)
    expect(effects).toBe(0)
    journalFault.releaseSync?.()
    await expect(observed).resolves.toMatchObject({ status: 'committed', publication: 'ready' })
    expect(durable).toEqual(['2'])
    expect(effects).toBe(1)
  })
})

describe('O09/O10 simultaneous business and diagnostic failures', () => {
  it('keeps a sync-failed operation unknown and effectless while the real diagnostic sink reports a gap', async () => {
    const stack = await createStack('storage-diagnostic-failure-', ['session'])
    stacks.add(stack)
    await waitUntilDiagnosticsIdle(stack)
    const diagnosticWrite = failNextDiagnosticWrite()
    let effects = 0
    const prepared = prepareAdmission(stack.admission, 'sync-and-diagnostic-failure', [
      {
        owner: 'session',
        publishLogical: () => undefined,
        publishDurable: () => undefined,
      },
    ])
    journalFault.path = `${stack.recordDirectory}/journal.jsonl`
    journalFault.mode = 'fail_sync'
    journalFault.armed = true

    const submission = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, prepared),
      ),
    )
    const completion = await noEffectUntilReady(submission.completion, () => {
      effects += 1
    })

    expect(completion).toMatchObject({
      status: 'unknown',
      operation: operation('sync-and-diagnostic-failure'),
    })
    expect(effects).toBe(0)
    expect(stack.admission.coordinator.status()).toMatchObject({ phase: 'quarantined' })
    await waitFor(
      () => stack.diagnosticRuntime.inspect().writeProgress === 'failed',
      'diagnostic EIO',
    )
    expect(diagnosticWrite.calls()).toBeGreaterThan(0)
    expect(stack.diagnosticRuntime.inspect()).toMatchObject({
      phase: 'degraded',
      lastErrorCode: 'EIO',
      resource: 'held',
      gaps: expect.arrayContaining([
        expect.objectContaining({ reason: 'write_unavailable', quality: 'unknown' }),
      ]),
    })
    await expect(stack.diagnosticRuntime.close({ deadlineMs: 1_000 })).resolves.toMatchObject({
      status: 'closed',
      state: { resource: 'released' },
    })
  })

  it('preserves committed publication-blocked and the claimed use when durable publication and diagnostics fail', async () => {
    const stack = await createStack('publication-diagnostic-failure-', ['action-owner'])
    stacks.add(stack)
    await waitUntilDiagnosticsIdle(stack)
    const diagnosticWrite = failNextDiagnosticWrite()
    const release = vi.fn(async () => ({ status: 'released' as const }))
    const retainAt = vi.fn(() => undefined)
    const use: ExactUse = stack.admission.createUseIssuer('execution-owner').capture(useBinding(), {
      retainAt,
      release,
    })
    const publication: OwnerPublication = {
      owner: 'action-owner',
      publishLogical: () => undefined,
      publishDurable: () => {
        throw new Error('durable publication failed')
      },
    }
    const prepared = prepareAdmission(
      stack.admission,
      'publication-and-diagnostic-failure',
      [publication],
      { uses: [use] },
    )

    const submission = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, prepared),
      ),
    )
    expect(retainAt).toHaveBeenCalledOnce()
    expect(diagnosticWrite.calls()).toBe(0)
    await expect(submission.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
      receipt: { operation: operation('publication-and-diagnostic-failure') },
    })
    expect(release).not.toHaveBeenCalled()
    expect(stack.admission.coordinator.status()).toMatchObject({ phase: 'quarantined' })
    await turn()
    await waitFor(
      () => stack.diagnosticRuntime.inspect().writeProgress === 'failed',
      'publication diagnostic EIO',
    )
    expect(diagnosticWrite.calls()).toBeGreaterThan(0)
    expect(stack.diagnosticRuntime.inspect().gaps).toContainEqual(
      expect.objectContaining({ reason: 'write_unavailable' }),
    )
    await expect(use.release('not_admitted')).resolves.toMatchObject({ status: 'retained' })
    expect(release).not.toHaveBeenCalled()
  })
})

describe('A08 close cannot reopen a quarantined publication gap', () => {
  it('keeps B blocked when close starts after A publication fails while B fsync is in flight', async () => {
    const stack = await createStack('close-publication-gap-', ['session'])
    stacks.add(stack)
    const durableB = vi.fn(() => undefined)
    const operationA = prepareAdmission(
      stack.admission,
      'publication-gap-a',
      [
        {
          owner: 'session',
          publishLogical: () => undefined,
          publishDurable: () => {
            throw new Error('A durable publication failed')
          },
        },
      ],
      { expectedRevision: '0' },
    )
    const operationB = prepareAdmission(
      stack.admission,
      'publication-gap-b',
      [
        {
          owner: 'session',
          publishLogical: () => undefined,
          publishDurable: durableB,
        },
      ],
      { expectedRevision: '1' },
    )
    journalFault.path = `${stack.recordDirectory}/journal.jsonl`
    journalFault.mode = 'block_sync'
    journalFault.blockAt = 2
    journalFault.armed = true

    const first = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, operationA),
      ),
    )
    const second = pending(
      stack.admission.coordinator.enter(frame =>
        stack.admission.coordinator.submit(frame, operationB),
      ),
    )
    await waitFor(() => journalFault.triggered, 'second journal sync interception')
    await expect(first.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    expect(stack.admission.coordinator.status().phase).toBe('quarantined')

    const closing = stack.admission.coordinator.close()
    expect(stack.admission.coordinator.status().phase).toBe('closing')
    journalFault.releaseSync?.()

    await expect(second.completion).resolves.toMatchObject({
      status: 'committed',
      publication: 'blocked',
    })
    expect(durableB).not.toHaveBeenCalled()
    await expect(closing).resolves.toMatchObject({ status: 'blocked' })
  })
})
