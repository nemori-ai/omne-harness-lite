import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { narrow, StorageUnavailable, type StorageUnit } from '@omne-harness-lite/storage'
import { parseTenantId, parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type {
  ModelRuntimeExecutionSource,
  ModelRuntimeExecutionCapture,
  ModelRuntimeCapturedExecution,
  SessionRuntimeBinding,
  OriginalIssueIdentity,
} from '@omne-harness-lite/model-request-runtime'
import type { ModelResultInput } from '@omne-harness-lite/session-runtime-local'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { createSessionModelResultSource } from '@omne-harness-lite/session-runtime-local'
import { originalPending } from './model-result-fixture.ts'

const now = '2026-10-08T00:00:00Z'
const tenant = unwrap(
  parseTenantId({ organization: 'result-source-org', account: 'result-source-owner' }),
)
const scope = {
  tenant,
  session: unwrap(parseOpaqueIdentifier('result-source-session', 'SessionRef')),
}
const sourceToken = { ...scope, journalGeneration: 'original-log-generation', tail: 0 }
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function fixture(maxCaptures = 2, waitForReply?: Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'omne-original-result-source-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'state.sqlite'),
    synchronous: 'full',
  })
  cleanup.push(() => storage.close())
  const pending = originalPending()
  if (pending.call.runId === undefined || pending.attemptId === undefined)
    throw new Error('fixture needs original Run')
  const generation = Object.freeze({})
  const unused = async (): Promise<never> => {
    throw new Error('unexpected controlled provider operation')
  }
  const log = {
    session: scope.session,
    tenant,
    generation: Object.freeze({}),
    currentGeneration: () => log.generation,
    log: { append: unused, readByKey: unused, readSince: unused },
    readPrefix: async () => ({ entries: [], tail: sourceToken.tail, source: sourceToken }),
  }
  const catalog = { readProfile: unused, listProfiles: unused, credentialPresent: unused }
  const inputs = { read: unused }
  const session: SessionRuntimeBinding = {
    log,
    sourceVersions: { fixture: 'controlled-source-v1' },
    catalog,
    credentials: { value: unused },
    tools: { lookup: unused },
    currentEvaluationInputs: inputs,
    selection: {
      binding: log,
      concurrent: 1,
      owner: {
        name: 'controlled',
        admission: () => 'open',
        acquire: () => ({ unavailable: true }),
        opened: () => ({ confirmed: true }),
        unresolvedWrites: () => [],
      },
      sessionTenancy: { holdingTenant: async () => ({ tenant }) },
      catalog,
      currentEvaluationInputs: inputs,
      projection: unused,
      compatible: () => ({ ok: true }),
      now: async () => now,
      diagnostic() {},
      onDiagnosticFailure() {},
    },
  }
  // Deliberately controlled producer. These tests cover the bridge and actual Units, not model IO.
  const execution: ModelRuntimeCapturedExecution = {
    key: { session: scope.session, callId: pending.call.callId },
    session,
    owner: session.selection.owner,
    executionGeneration: generation,
    registered: true,
    released: false,
    copyReleased: false,
    invocation: {
      outcome: waitForReply
        ? waitForReply.then(() => ({ replyPending: pending }))
        : Promise.resolve({ replyPending: pending }),
      snapshot: () => {
        throw new Error('unused snapshot')
      },
      observedFacts: () => ({ unavailable: true }),
      abort() {},
      interrupt() {},
      borrowControl: () => ({ unavailable: true }),
      settleReply: unused,
      finishReady: unused,
      close: unused,
    },
  }
  let available = true,
    recognized = true,
    copiesReleased = false
  const released = vi.fn()
  const capture = vi.fn(() => {
    let observations: readonly ModelRuntimeCapturedExecution[] = [execution]
    const frame: ModelRuntimeExecutionCapture = {
      get executions() {
        return observations
      },
      release() {
        observations = []
        released()
      },
    }
    return { capture: frame }
  })
  const originalSource: ModelRuntimeExecutionSource = {
    capture,
    lookup: () =>
      recognized
        ? { execution: { ...execution, copyReleased: copiesReleased } }
        : { unknown: true },
    snapshot: () => [execution],
    release: () => ({ unavailable: true }),
  }
  const retain = vi.fn(
    async (_unit: StorageUnit, _scope: SessionScope, _pending: ModelResultInput['pending']) =>
      'retained' as 'retained' | 'unavailable',
  )
  const bridge = createSessionModelResultSource({
    storage,
    tenant,
    executionSource: () => (available ? originalSource : undefined),
    maxCaptures,
    retainReferencesIn: retain,
  })
  const original: OriginalIssueIdentity = {
    ...scope,
    call: pending.call.callId,
    run: pending.call.runId,
    attempt: pending.attemptId,
    dispatch: pending.dispatch,
    executionGeneration: 'original-issue-string-generation',
    originalPosition: 'original-dispatch-position',
  }
  return {
    storage,
    bridge,
    pending,
    original,
    capture,
    released,
    retain,
    execution,
    unavailable() {
      available = false
    },
    unknown() {
      recognized = false
    },
    acknowledged() {
      copiesReleased = true
    },
  }
}
it('verifies the complete original pending under the actual tenant Unit and stages required references there', async () => {
  const f = await fixture()
  const result = await f.bridge.capture(scope, f.pending.call.callId)
  if ('failure' in result) throw new Error('original capture unavailable')
  expect(result.captured.pending).toEqual(f.pending)
  const verified = await f.storage.atomic(unit =>
    unit.run(() => f.bridge.source.verifyIn(unit, scope, f.original, f.pending)),
  )
  expect(verified).toBe('verified')
  expect(f.retain).toHaveBeenCalledTimes(1)
  expect(await f.bridge.release(result.captured)).toEqual({ released: true })
  expect(f.released).toHaveBeenCalledTimes(1)
})
it('refuses foreign tenant captures before entering the execution source', async () => {
  const f = await fixture()
  const foreign: SessionScope = {
    ...scope,
    tenant: unwrap(parseTenantId({ ...tenant, organization: 'foreign' })),
  }
  expect(await f.bridge.capture(foreign, f.pending.call.callId)).toEqual({
    failure: 'invalidSource',
  })
  expect(f.capture).not.toHaveBeenCalled()
})
it('refuses a caller-altered result or a different original attempt without retaining references', async () => {
  const f = await fixture()
  const captured = await f.bridge.capture(scope, f.pending.call.callId)
  if ('failure' in captured) throw new Error('capture unavailable')
  expect(
    await f.storage.atomic(unit =>
      unit.run(() =>
        f.bridge.source.verifyIn(unit, scope, f.original, { ...f.pending, id: 'replacement' }),
      ),
    ),
  ).toBe('invalidSource')
  expect(
    await f.storage.atomic(unit =>
      unit.run(() =>
        f.bridge.source.verifyIn(unit, scope, { ...f.original, attempt: 2 }, f.pending),
      ),
    ),
  ).toBe('invalidSource')
  expect(f.retain).not.toHaveBeenCalled()
  await f.bridge.release(captured.captured)
})
it('holds observation ownership through actual Unit completion and refuses copied release capabilities', async () => {
  const f = await fixture()
  const captured = await f.bridge.capture(scope, f.pending.call.callId)
  if ('failure' in captured) throw new Error('capture unavailable')
  await expect(f.bridge.release({ ...captured.captured })).rejects.toThrow('capture')
  let resolve!: () => void
  const gate = new Promise<void>(done => {
    resolve = done
  })
  let entered!: () => void
  const ready = new Promise<void>(done => {
    entered = done
  })
  const work = f.storage.atomic(unit =>
    unit.run(async () => {
      expect(await f.bridge.source.verifyIn(unit, scope, f.original, f.pending)).toBe('verified')
      entered()
      await gate
    }),
  )
  await ready
  let returned = false
  const releasing = f.bridge.release(captured.captured).then(value => {
    returned = true
    return value
  })
  await new Promise(done => setImmediate(done))
  expect(returned).toBe(false)
  expect(f.released).not.toHaveBeenCalled()
  resolve()
  await work
  expect(await releasing).toEqual({ released: true })
})
it('stops capture admission but retains an owned original result until its frame is returned', async () => {
  const f = await fixture(1)
  const captured = await f.bridge.capture(scope, f.pending.call.callId)
  if ('failure' in captured) throw new Error('capture unavailable')
  expect(await f.bridge.capture(scope, f.pending.call.callId)).toEqual({ failure: 'unavailable' })
  expect(f.bridge.close()).toEqual({ pending: true })
  expect(await f.bridge.capture(scope, 'new-call')).toEqual({ failure: 'unavailable' })
  expect(
    await f.storage.atomic(unit =>
      unit.run(() => f.bridge.source.verifyIn(unit, scope, f.original, f.pending)),
    ),
  ).toBe('verified')
  await f.bridge.release(captured.captured)
  expect(f.bridge.close()).toEqual({ released: true })
})
it('rejects lost or acknowledged original execution metadata without trusting only matching JSON', async () => {
  const f = await fixture()
  const captured = await f.bridge.capture(scope, f.pending.call.callId)
  if ('failure' in captured) throw new Error('capture unavailable')
  f.unknown()
  expect(
    await f.storage.atomic(unit =>
      unit.run(() => f.bridge.source.verifyIn(unit, scope, f.original, f.pending)),
    ),
  ).toBe('invalidSource')
  expect(f.retain).not.toHaveBeenCalled()
  await f.bridge.release(captured.captured)
})
it('refuses an acknowledged original copy even while its metadata and capture remain readable', async () => {
  const f = await fixture()
  const captured = await f.bridge.capture(scope, f.pending.call.callId)
  if ('failure' in captured) throw new Error('capture unavailable')
  f.acknowledged()
  expect(
    await f.storage.atomic(unit =>
      unit.run(() => f.bridge.source.verifyIn(unit, scope, f.original, f.pending)),
    ),
  ).toBe('invalidSource')
  expect(f.retain).not.toHaveBeenCalled()
  await f.bridge.release(captured.captured)
})
it('keeps an unavailable source unavailable without allocating an execution frame', async () => {
  const f = await fixture()
  f.unavailable()
  expect(await f.bridge.capture(scope, f.pending.call.callId)).toEqual({ failure: 'unavailable' })
  expect(f.capture).not.toHaveBeenCalled()
  expect(f.bridge.close()).toEqual({ released: true })
})
it('keeps an already allocated capture alive when close races its pending original outcome', async () => {
  let complete!: () => void
  const gate = new Promise<void>(resolve => {
    complete = resolve
  })
  const f = await fixture(1, gate)
  const capturing = f.bridge.capture(scope, f.pending.call.callId)
  expect(f.capture).toHaveBeenCalledTimes(1)
  expect(f.bridge.close()).toEqual({ pending: true })
  expect(await f.bridge.capture(scope, 'another-call')).toEqual({ failure: 'unavailable' })
  complete()
  const captured = await capturing
  if ('failure' in captured) throw new Error('close cancelled allocated capture')
  expect(f.bridge.close()).toEqual({ pending: true })
  await f.bridge.release(captured.captured)
  expect(f.bridge.close()).toEqual({ released: true })
})
it('rejects a Unit from another actual SQLite owner before any reference transfer', async () => {
  const f = await fixture(),
    foreign = await fixture()
  const captured = await f.bridge.capture(scope, f.pending.call.callId)
  if ('failure' in captured) throw new Error('capture unavailable')
  await expect(
    foreign.storage.atomic(unit =>
      unit.run(() => f.bridge.source.verifyIn(unit, scope, f.original, f.pending)),
    ),
  ).rejects.toThrow('different instance')
  expect(f.retain).not.toHaveBeenCalled()
  await f.bridge.release(captured.captured)
})
it('retains the original frame after a real commit loses its return observation', async () => {
  const f = await fixture()
  const captured = await f.bridge.capture(scope, f.pending.call.callId)
  if ('failure' in captured) throw new Error('capture unavailable')
  const write = f.storage.write.bind(f.storage)
  const lost = new StorageUnavailable('original commit return lost')
  const fault = vi.spyOn(f.storage, 'write').mockImplementationOnce(async callback => {
    await write(callback)
    throw lost
  })
  await expect(
    f.storage.atomic(unit =>
      unit.run(() => f.bridge.source.verifyIn(unit, scope, f.original, f.pending)),
    ),
  ).rejects.toBe(lost)
  fault.mockRestore()
  expect(await f.bridge.release(captured.captured)).toEqual({ pending: true })
  expect(f.released).not.toHaveBeenCalled()
  expect(f.bridge.close()).toEqual({ pending: true })
  // Unknown completion has no authority to ACK or return this controlled frame.
})
it('propagates a reference-owner defect and returns the frame only after the actual rollback', async () => {
  const f = await fixture()
  const captured = await f.bridge.capture(scope, f.pending.call.callId)
  if ('failure' in captured) throw new Error('capture unavailable')
  const defect = new Error('actual reference-owner defect')
  f.retain.mockRejectedValueOnce(defect)
  await expect(
    f.storage.atomic(unit =>
      unit.run(() => f.bridge.source.verifyIn(unit, scope, f.original, f.pending)),
    ),
  ).rejects.toBe(defect)
  expect(await f.bridge.release(captured.captured)).toEqual({ released: true })
  expect(f.released).toHaveBeenCalledTimes(1)
})
it('keeps an unavailable real reference transfer unavailable and lets actual transaction rollback remove its staging', async () => {
  const f = await fixture()
  await f.storage.write(tx =>
    tx.db.schema
      .createTable('fixture_model_reference')
      .addColumn('id', 'text', col => col.primaryKey())
      .execute(),
  )
  const captured = await f.bridge.capture(scope, f.pending.call.callId)
  if ('failure' in captured) throw new Error('capture unavailable')
  f.retain.mockImplementation(async unit => {
    await unit.mutate(tx =>
      narrow<{ fixture_model_reference: { id: string } }>(tx)
        .insertInto('fixture_model_reference')
        .values({ id: 'original' })
        .execute(),
    )
    return 'unavailable'
  })
  await expect(
    f.storage.atomic(unit =>
      unit.run(async () => {
        if ((await f.bridge.source.verifyIn(unit, scope, f.original, f.pending)) !== 'verified')
          throw new Error('transfer unavailable')
      }),
    ),
  ).rejects.toThrow('transfer unavailable')
  expect(
    await f.storage.read(tx => tx.db.selectFrom('fixture_model_reference').selectAll().execute()),
  ).toEqual([])
  await f.bridge.release(captured.captured)
})
