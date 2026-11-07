// The diagnostics read face `ModelDiagnostics.list` over the Model records: the whitelist page of
// one call's dispatches, the qualification mapping `tenant-self`, the cursor, the retention adoption
// and the Cordis plugin that publishes `modelDiagnostics`. The call documents are written through
// the real participant on node:sqlite (fixture.ts); the read goes through the `model.diagnostics`
// handler loaded from the static materials. Nothing here proves the Worker or durability.
import { createHmac } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import {
  decodeDispatchId,
  decodeModelDiagnosticCursor,
  decodeModelDiagnosticId,
  decodeOutputCursor,
  decodeRevision,
  type ModelCallId,
  type ModelDiagnosticCursor,
  type ModelDiagnosticsPage,
  type ModelOperationId,
  type Termination,
} from '@omne-harness/model-contract'
import type { ModelCommandsAuthority } from '@omne-harness/model/commands'
import { modelDiagnosticsKey } from '@omne-harness/model-cordis-contract/cordis'
import type { Outcome } from '@omne-harness/operation-result'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { ReadPort, SqlValue } from '@omne-harness/sql-contract/worker'
import { afterEach, describe, expect, it } from 'vitest'
import {
  COMMAND_RESERVE_BYTES,
  DIAGNOSTICS_PAGE_MAX,
  createSqlModelDiagnostics,
  createSqlModelStorage,
  diagnosticsHandler,
  modelStorageMaterials,
  type CallDocument,
  type DispatchDocument,
  type SqlModelStorage,
} from '@omne-harness/model-storage-sql'
import { createSqlModelDiagnosticsPlugin } from '@omne-harness/model-storage-sql/cordis'
import {
  ADOPTION,
  DIGEST,
  MAX_CALL_BYTES,
  OWNER,
  REQUEST,
  callId,
  coreOptions,
  lookup,
  opId,
  sqliteStorage,
  tenantOf,
  textOf,
  unbox,
  type Principal,
} from './fixture.ts'

const A = tenantOf('a')
const B = tenantOf('b')
/** The vendor text of a failed dispatch. It must never reach a diagnostics page. */
const CANARY = 'upstream said: SECRET-CANARY-7f3a'
const UNKNOWN = { kind: 'unknown' } as const

const rev = (text: string) => unbox(decodeRevision(text))

function dispatchOf(
  seq: number,
  record: Pick<DispatchDocument['record'], 'send' | 'firstContent' | 'terminal'>,
  logicalTerminal: Termination | null = null,
): DispatchDocument {
  return {
    record: {
      dispatch: unbox(decodeDispatchId(`mdisp_${seq}`)),
      supplier: REQUEST.suppliers[0],
      intent: opId(`intent-${seq}`),
      account: null,
      materialization: null,
      ...record,
    },
    logicalTerminal,
    windows: new Map(),
    events: new Map(),
    assembly: null,
    blocks: [],
    nextSeq: new Map(),
    trims: new Map(),
    hadContent: new Set(),
    diagnostics: [],
  }
}

/** Four dispatches: completed, failed with a vendor text, interrupted by a logical terminal, pending. */
const DISPATCHES: readonly DispatchDocument[] = [
  dispatchOf(0, {
    send: 'started',
    firstContent: 'observed',
    terminal: { kind: 'completed', reason: 'stop' },
  }),
  dispatchOf(1, {
    send: 'started',
    firstContent: 'none-proven',
    terminal: {
      kind: 'failed',
      fault: { cause: 'upstream-unavailable', upstreamStatus: '504', diagnostic: CANARY },
    },
  }),
  dispatchOf(
    2,
    { send: 'prepared', firstContent: 'none-proven', terminal: null },
    { kind: 'interrupted', control: opId('control-2') },
  ),
  dispatchOf(3, { send: 'unknown', firstContent: 'uncertain', terminal: null }),
]

function callOf(
  call: ModelCallId,
  admission: ModelOperationId,
  dispatches: readonly DispatchDocument[],
): CallDocument {
  return {
    state: {
      call,
      revision: rev('1'),
      consumer: { owner: 'consumer', work: 'work', position: 'position', purpose: 'test' },
      control: { kind: 'none' },
      custody: { kind: 'producer' },
      phase: 'accepted',
    },
    request: REQUEST,
    requestDigest: DIGEST,
    capacity: { bytes: '1000', blocks: '10', attachmentBytes: '0' },
    initiator: { owner: 'identity', subject: 'trusted-0', revision: '1' },
    admission,
    owner: OWNER,
    execution: null,
    dispatches: dispatches.map(item => structuredClone(item)),
    retry: null,
    retryPosition: null,
    retrySource: null,
    cursor: unbox(decodeOutputCursor('0')),
    snapshots: new Map(),
    reads: new Map(),
    cleanupFailure: null,
    resultPaging: { resultPageParts: 10, resultPageTargetBytes: 1000 },
  }
}

/** One write through the storage port, as the core would do it: read, change, commit once. */
async function write(
  store: SqlModelStorage,
  tenant: string,
  call: ModelCallId,
  operation: ModelOperationId,
  change: (current: CallDocument | undefined) => CallDocument,
): Promise<void> {
  const result = await store.run(
    () => {
      const original = store.documents(tenant).calls.get(call)
      store.commit(tenant, {
        operation,
        expected: original,
        call: change(original === undefined ? undefined : structuredClone(original)),
        binding: {
          call,
          method: original === undefined ? 'admit' : 'control',
          fingerprint: `fp-${operation}`,
          revision: rev('1'),
          receipt: { kind: 'revision', revision: rev('1') },
        },
      })
      return { ok: 'written' }
    },
    { tenant, call, operation },
  )
  unbox(result)
}

function scene(registered: readonly string[] = [textOf(A), textOf(B)]) {
  const sqlite = sqliteStorage()
  const core = coreOptions([A, B])
  const domains = lookup(registered, 'shared')
  const store = createSqlModelStorage({
    storage: sqlite.storage,
    domains,
    combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
    limits: {
      tenantCapacity: core.options.limits.capacity,
      maxCallBytes: MAX_CALL_BYTES,
      maxCommandBytes: MAX_CALL_BYTES + COMMAND_RESERVE_BYTES,
    },
  })
  const dependencies = { storage: sqlite.storage, domains, authority: core.options.authority }
  const diagnostics = createSqlModelDiagnostics<Principal>({
    ...dependencies,
    diagnosticsRead: 'tenant-self',
    retention: ADOPTION,
  })
  const principalOf = (tenant: typeof A) => core.admitOf(tenant, callId('x'), opId('x')).principal
  const access = (tenant: typeof A, call: ModelCallId) => ({
    principal: principalOf(tenant),
    tenant,
    call,
  })
  const seeded = async (call: ModelCallId, dispatches = DISPATCHES, tenant = A) => {
    await write(store, textOf(tenant), call, opId(`admit-${call}`), () =>
      callOf(call, opId(`admit-${call}`), dispatches),
    )
  }
  return { sqlite, core, domains, store, dependencies, diagnostics, principalOf, access, seeded }
}

function page(result: Outcome<ModelDiagnosticsPage, unknown>): ModelDiagnosticsPage {
  return unbox(result)
}

describe('the whitelist page of one call', () => {
  it('projects every dispatch in seq order with send, first content and outcome as stored', async () => {
    const f = scene()
    const call = callId('one')
    await f.seeded(call)
    const got = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 10 }))
    expect(got.entries.map(e => [e.dispatch, e.send, e.firstContent, e.outcome])).toEqual([
      ['mdisp_0', 'sent', 'observed', { kind: 'completed', reason: 'stop' }],
      [
        'mdisp_1',
        'sent',
        'none-proven',
        { kind: 'failed', cause: 'upstream-unavailable', upstreamStatus: '504' },
      ],
      ['mdisp_2', 'not-sent', 'none-proven', { kind: 'interrupted' }],
      ['mdisp_3', 'unknown', 'uncertain', { kind: 'pending' }],
    ])
    for (const entry of got.entries) {
      expect(entry.call).toBe(call)
      expect(entry.revision).toBe('1')
      expect(entry.adapter).toEqual(ADOPTION)
      expect(decodeModelDiagnosticId(entry.id)).toHaveProperty('ok')
    }
    expect(new Set(got.entries.map(e => e.id)).size).toBe(4)
    expect(got.next).toBeNull()
    expect(got.retention).toEqual(ADOPTION)
    expect(got.coverage).toBe('complete-through-snapshot')
    expect(got.snapshot.record).toBe(call)
    expect(got.snapshot.revision).toBe('1')
  })

  it('does not carry the vendor diagnostic text, the recipient or the model name of a dispatch', async () => {
    const f = scene()
    const call = callId('whitelist')
    await f.seeded(call)
    const got = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 10 }))
    const text = JSON.stringify(got)
    expect(text).not.toContain('SECRET-CANARY')
    expect(text).not.toContain(REQUEST.suppliers[0].recipient)
    expect(text).not.toContain('"diagnostic"')
  })

  it('answers unknown for every timing, because the storage holds no phase times', async () => {
    const f = scene()
    const call = callId('timing')
    await f.seeded(call)
    const got = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 10 }))
    expect(got.entries).toHaveLength(4)
    for (const entry of got.entries)
      expect(entry.timing).toEqual({
        materialize: UNKNOWN,
        sendToFirstContent: UNKNOWN,
        execution: UNKNOWN,
      })
  })

  it('gives the same id for the same call and dispatch across two reads', async () => {
    const f = scene()
    const call = callId('stable')
    await f.seeded(call)
    const input = { ...f.access(A, call), after: null, limit: 10 }
    const first = page(await f.diagnostics.list(input))
    const second = page(await f.diagnostics.list(input))
    expect(second.entries.map(e => e.id)).toEqual(first.entries.map(e => e.id))
  })
})

describe('qualification: tenant-self', () => {
  it('denies the whole read to another tenant, the same for an existing and a missing call', async () => {
    const f = scene()
    const call = callId('mine')
    await f.seeded(call)
    const denied = { failure: { kind: 'denied', action: 'diagnostics' } }
    const existing = await f.diagnostics.list({
      principal: f.principalOf(B),
      tenant: A,
      call,
      after: null,
      limit: 10,
    })
    const missing = await f.diagnostics.list({
      principal: f.principalOf(B),
      tenant: A,
      call: callId('never-admitted'),
      after: null,
      limit: 10,
    })
    expect(existing).toEqual(denied)
    expect(missing).toEqual(denied)
    expect(
      await f.diagnostics.list({
        ...f.access(A, call),
        principal: { subject: 'stranger' },
        after: null,
        limit: 10,
      }),
    ).toEqual(denied)
  })

  it('denies before it looks at the limit or the cursor', async () => {
    const f = scene()
    const call = callId('order')
    await f.seeded(call)
    const bad = { principal: f.principalOf(B), tenant: A, call }
    expect(await f.diagnostics.list({ ...bad, after: null, limit: 0 })).toEqual({
      failure: { kind: 'denied', action: 'diagnostics' },
    })
    expect(
      await f.diagnostics.list({
        ...bad,
        after: unbox(decodeModelDiagnosticCursor('mdcur_forged')),
        limit: 1,
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'diagnostics' } })
  })
})

describe('the cursor', () => {
  it('continues the page in seq order without a gap or a repeat', async () => {
    const f = scene()
    const call = callId('paged')
    await f.seeded(call)
    const first = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 3 }))
    expect(first.entries.map(e => e.dispatch)).toEqual(['mdisp_0', 'mdisp_1', 'mdisp_2'])
    expect(first.next).not.toBeNull()
    expect(decodeModelDiagnosticCursor(first.next)).toHaveProperty('ok')
    const second = page(
      await f.diagnostics.list({ ...f.access(A, call), after: first.next, limit: 3 }),
    )
    expect(second.entries.map(e => e.dispatch)).toEqual(['mdisp_3'])
    expect(second.next).toBeNull()
    expect(second.snapshot).toEqual(first.snapshot)
  })

  it('checks the qualification again on the next page', async () => {
    const f = scene()
    const call = callId('reauth')
    await f.seeded(call)
    const first = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 2 }))
    expect(
      await f.diagnostics.list({
        principal: f.principalOf(B),
        tenant: A,
        call,
        after: first.next,
        limit: 2,
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'diagnostics' } })
  })

  it('refuses a tampered cursor, a cursor of another call and a forged cursor as invalid', async () => {
    const f = scene()
    const call = callId('tamper')
    const other = callId('other')
    await f.seeded(call)
    await f.seeded(other)
    const first = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 2 }))
    const cursor = first.next
    if (cursor === null) throw new Error('no next page')
    const last = cursor.at(-1) === 'A' ? 'B' : 'A'
    const tampered = unbox(decodeModelDiagnosticCursor(cursor.slice(0, -1) + last))
    for (const after of [tampered, unbox(decodeModelDiagnosticCursor('mdcur_forged'))]) {
      const got = await f.diagnostics.list({ ...f.access(A, call), after, limit: 2 })
      expect(got).toMatchObject({ failure: { kind: 'invalid', field: 'after' } })
    }
    expect(
      await f.diagnostics.list({ ...f.access(A, other), after: cursor, limit: 2 }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'after' } })
  })

  it('refuses the cursor as invalid after the call changed, instead of a silent new snapshot', async () => {
    const f = scene()
    const call = callId('superseded')
    await f.seeded(call)
    const first = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 2 }))
    await write(f.store, textOf(A), call, opId('control-superseded'), current => {
      if (current === undefined) throw new Error('no document')
      return { ...current, cleanupFailure: 'changed' }
    })
    expect(
      await f.diagnostics.list({ ...f.access(A, call), after: first.next, limit: 2 }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'after' } })
  })

  it('refuses a limit that is not a positive safe integer within the page bound', async () => {
    const f = scene()
    const call = callId('limit')
    await f.seeded(call)
    for (const limit of [0, -1, 1.5, DIAGNOSTICS_PAGE_MAX + 1, Number.MAX_SAFE_INTEGER + 2])
      expect(await f.diagnostics.list({ ...f.access(A, call), after: null, limit })).toEqual({
        failure: { kind: 'invalid', field: 'limit', reason: 'out-of-range' },
      })
    expect(
      await f.diagnostics.list({ ...f.access(A, call), after: null, limit: DIAGNOSTICS_PAGE_MAX }),
    ).toHaveProperty('ok')
  })
})

describe('absence', () => {
  it('answers an empty complete page for a call that does not exist', async () => {
    const f = scene()
    const got = page(
      await f.diagnostics.list({ ...f.access(A, callId('absent')), after: null, limit: 5 }),
    )
    expect(got.entries).toEqual([])
    expect(got.next).toBeNull()
    expect(got.coverage).toBe('complete-through-snapshot')
    expect(got.retention).toEqual(ADOPTION)
  })

  it('answers the same empty page for a tenant whose domain is not registered', async () => {
    const f = scene([textOf(A)])
    const got = page(
      await f.diagnostics.list({ ...f.access(B, callId('absent')), after: null, limit: 5 }),
    )
    expect(got.entries).toEqual([])
    expect(got.next).toBeNull()
    expect(got.coverage).toBe('complete-through-snapshot')
  })
})

describe('the retention adoption', () => {
  it('makes the whole read face unavailable when the deployment adopted none', async () => {
    const f = scene()
    const call = callId('retention')
    await f.seeded(call)
    const without = createSqlModelDiagnostics<Principal>({
      ...f.dependencies,
      diagnosticsRead: 'tenant-self',
      retention: null,
    })
    const unavailable = {
      failure: { kind: 'unavailable', dependency: 'model-records' },
    }
    expect(await without.list({ ...f.access(A, call), after: null, limit: 5 })).toMatchObject(
      unavailable,
    )
    expect(
      await without.list({ principal: f.principalOf(B), tenant: A, call, after: null, limit: 5 }),
    ).toMatchObject(unavailable)
  })
})

describe('the Cordis plugin', () => {
  const contexts: Context[] = []
  afterEach(async () => {
    await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  })

  it('publishes modelDiagnostics over the resolved storage, domains and authority', async () => {
    const f = scene()
    const call = callId('plugin')
    await f.seeded(call)
    const ctx = new Context()
    contexts.push(ctx)
    const Plugin = createSqlModelDiagnosticsPlugin<Principal>({
      inject: [],
      resolve: () => f.dependencies,
    })
    await ctx.plugin(Plugin, { diagnosticsRead: 'tenant-self', retention: ADOPTION })
    const got = page(
      await ctx.modelDiagnostics.list({ ...f.access(A, call), after: null, limit: 10 }),
    )
    expect(got.entries).toHaveLength(4)
    expect(got.retention).toEqual(ADOPTION)
  })

  it('rejects a mapping other than tenant-self and a malformed retention adoption', async () => {
    const f = scene()
    const ctx = new Context()
    contexts.push(ctx)
    const Plugin = createSqlModelDiagnosticsPlugin<Principal>({
      inject: [],
      resolve: () => f.dependencies,
    })
    for (const config of [
      undefined,
      {},
      { diagnosticsRead: 'everyone' },
      { diagnosticsRead: 'tenant-self', retention: { owner: 'x' } },
    ]) {
      const loaded = Reflect.apply(ctx.plugin, ctx, [Plugin, config])
      await expect(loaded).rejects.toThrow()
      expect(ctx.get(modelDiagnosticsKey)).toBeUndefined()
      await loaded.dispose()
    }
  })

  it('rejects modelDiagnostics as its own static dependency', () => {
    expect(() =>
      createSqlModelDiagnosticsPlugin({
        inject: [modelDiagnosticsKey],
        resolve: () => {
          throw new Error('unused')
        },
      }),
    ).toThrow(/modelDiagnostics/)
  })
})

// --- Pages, qualification and absence in detail -------------------------------------------------

type Scene = ReturnType<typeof scene>
type AuthorityQuestion = Parameters<ModelCommandsAuthority<Principal>['authorize']>[0]

const SHARED = 'shared'
const UNAVAILABLE = { failure: { kind: 'unavailable', dependency: 'model-records' } }
const INVALID_AFTER = { failure: { kind: 'invalid', field: 'after' } }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A face over the scene's storage with the dependencies or options a case replaces. */
function faceOf(
  f: Scene,
  replaced: Partial<Parameters<typeof createSqlModelDiagnostics<Principal>>[0]> = {},
) {
  return createSqlModelDiagnostics<Principal>({
    ...f.dependencies,
    diagnosticsRead: 'tenant-self',
    retention: ADOPTION,
    ...replaced,
  })
}

describe('pages in detail', () => {
  it('signs the snapshot as model-records evidence of the call at its row version', async () => {
    const f = scene()
    const call = callId('snapshot')
    const other = callId('snapshot-other')
    await f.seeded(call)
    await f.seeded(other)
    const first = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 10 }))
    const beside = page(await f.diagnostics.list({ ...f.access(A, other), after: null, limit: 10 }))
    expect(first.snapshot).toMatchObject({ owner: 'model-records', record: call, revision: '1' })
    expect(first.snapshot.digest).toMatch(/^[0-9a-f]{64}$/u)
    expect(beside.snapshot.digest).not.toBe(first.snapshot.digest)
    await write(f.store, textOf(A), call, opId('control-snapshot'), current => {
      if (current === undefined) throw new Error('no document')
      return { ...current, cleanupFailure: 'changed' }
    })
    const later = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 10 }))
    expect(later.snapshot.owner).toBe('model-records')
    expect(later.snapshot.revision).not.toBe('1')
    expect(later.snapshot.digest).not.toBe(first.snapshot.digest)
    for (const entry of later.entries) expect(entry.revision).toBe(later.snapshot.revision)
  })

  it('projects a stored not-sent and a failure without an upstream status as such', async () => {
    const f = scene()
    const call = callId('not-sent')
    await f.seeded(call, [
      dispatchOf(0, {
        send: 'not-sent',
        firstContent: 'none-proven',
        terminal: {
          kind: 'failed',
          fault: { cause: 'credential', upstreamStatus: null, diagnostic: CANARY },
        },
      }),
    ])
    const got = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 10 }))
    expect(got.entries.map(e => [e.send, e.outcome])).toEqual([
      ['not-sent', { kind: 'failed', cause: 'credential', upstreamStatus: null }],
    ])
    expect(JSON.stringify(got)).not.toContain('SECRET-CANARY')
  })

  it('walks one dispatch per page with limit 1, starting from the cursor after seq 0', async () => {
    const f = scene()
    const call = callId('one-by-one')
    await f.seeded(call)
    const seen: string[] = []
    let after: ModelDiagnosticCursor | null = null
    for (const expected of ['mdisp_0', 'mdisp_1', 'mdisp_2', 'mdisp_3']) {
      const got = page(await f.diagnostics.list({ ...f.access(A, call), after, limit: 1 }))
      expect(got.entries.map(e => e.dispatch)).toEqual([expected])
      seen.push(expected)
      after = got.next
      if (seen.length < 4) expect(after).not.toBeNull()
    }
    expect(after).toBeNull()
  })

  it('gives no next cursor when the page holds exactly the remaining dispatches', async () => {
    const f = scene()
    const call = callId('exact')
    await f.seeded(call)
    const got = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 4 }))
    expect(got.entries).toHaveLength(4)
    expect(got.next).toBeNull()
  })

  it('serves the largest page of a call with more dispatches than the page bound', async () => {
    const f = scene()
    const call = callId('large')
    const many = Array.from({ length: DIAGNOSTICS_PAGE_MAX + 1 }, (_, seq) =>
      dispatchOf(seq, { send: 'started', firstContent: 'observed', terminal: null }),
    )
    await f.seeded(call, many)
    const first = page(
      await f.diagnostics.list({ ...f.access(A, call), after: null, limit: DIAGNOSTICS_PAGE_MAX }),
    )
    expect(first.entries).toHaveLength(DIAGNOSTICS_PAGE_MAX)
    const rest = page(
      await f.diagnostics.list({
        ...f.access(A, call),
        after: first.next,
        limit: DIAGNOSTICS_PAGE_MAX,
      }),
    )
    expect(rest.entries.map(e => e.dispatch)).toEqual([`mdisp_${DIAGNOSTICS_PAGE_MAX}`])
    expect(rest.next).toBeNull()
  })

  it('answers revision 0 for the snapshot of a call that does not exist', async () => {
    const f = scene()
    const call = callId('never')
    const got = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 5 }))
    expect(got.snapshot).toMatchObject({ owner: 'model-records', record: call, revision: '0' })
  })

  it('answers unavailable when the tenant domain lookup is unavailable', async () => {
    const f = scene()
    const call = callId('no-directory')
    await f.seeded(call)
    const face = faceOf(f, {
      domains: { lookup: () => Promise.resolve({ kind: 'unavailable', diagnostic: 'down' }) },
    })
    expect(await face.list({ ...f.access(A, call), after: null, limit: 5 })).toMatchObject(
      UNAVAILABLE,
    )
  })

  it('answers unavailable when the read is cancelled', async () => {
    const f = scene()
    const call = callId('cancelled')
    await f.seeded(call)
    const storage: SqlStorage = {
      ...f.sqlite.storage,
      read: () => Promise.resolve({ kind: 'cancelled', requestKey: null }),
    }
    expect(
      await faceOf(f, { storage }).list({ ...f.access(A, call), after: null, limit: 5 }),
    ).toMatchObject(UNAVAILABLE)
  })
})

describe('qualification in detail', () => {
  it('asks the records authority one tenant-level inspect question that never names the call', async () => {
    const f = scene()
    const call = callId('question')
    await f.seeded(call)
    const asked: AuthorityQuestion[] = []
    const face = faceOf(f, {
      authority: {
        authorize: question => {
          asked.push(question)
          return f.core.options.authority.authorize(question)
        },
      },
    })
    page(await face.list({ ...f.access(A, call), after: null, limit: 10 }))
    expect(asked).toEqual([
      {
        action: 'inspect',
        access: { principal: f.principalOf(A), tenant: A },
        resource: { kind: 'tenant' },
      },
    ])
    expect(JSON.stringify(asked)).not.toContain(call)
  })

  it('returns an unavailable authority answer as it is, not as denied', async () => {
    const f = scene()
    const call = callId('authority-down')
    await f.seeded(call)
    const down = { kind: 'unavailable', dependency: 'identity', diagnostic: 'down' } as const
    const face = faceOf(f, { authority: { authorize: () => ({ failure: down }) } })
    expect(await face.list({ ...f.access(A, call), after: null, limit: 10 })).toEqual({
      failure: down,
    })
  })

  it('denies a tenant value that does not encode, before it asks the authority', async () => {
    const f = scene()
    const call = callId('forged-tenant')
    await f.seeded(call)
    const asked: AuthorityQuestion[] = []
    const face = faceOf(f, {
      authority: {
        authorize: question => {
          asked.push(question)
          return { ok: { owner: 'identity', subject: 'anyone', revision: '1' } }
        },
      },
    })
    const got = await face.list({
      principal: f.principalOf(A),
      tenant: structuredClone(A),
      call,
      after: null,
      limit: 10,
    })
    expect(got).toEqual({ failure: { kind: 'denied', action: 'diagnostics' } })
    expect(asked).toEqual([])
  })
})

// --- Cursors signed with a known key ------------------------------------------------------------

const CURSOR_KEY = new Uint8Array(32).fill(7)

/** A cursor signed as SPEC 诊断读面「游标」 describes, over any payload. */
function signedCursor(call: ModelCallId, body: unknown): ModelDiagnosticCursor {
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url')
  const mac = createHmac('sha256', CURSOR_KEY)
    .update(`${textOf(A)}\n${call}\n${ADOPTION.digest}\n${payload}`)
    .digest('base64url')
  return unbox(decodeModelDiagnosticCursor(`mdcur_${payload}${mac}`))
}

describe('the cursor in detail', () => {
  it('names the refusal of a cursor taken before the call changed snapshot-superseded', async () => {
    const f = scene()
    const call = callId('superseded-reason')
    await f.seeded(call)
    const first = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 2 }))
    await write(f.store, textOf(A), call, opId('control-superseded-reason'), current => {
      if (current === undefined) throw new Error('no document')
      return { ...current, cleanupFailure: 'changed' }
    })
    expect(await f.diagnostics.list({ ...f.access(A, call), after: first.next, limit: 2 })).toEqual(
      { failure: { kind: 'invalid', field: 'after', reason: 'snapshot-superseded' } },
    )
  })

  it('refuses a correctly signed cursor whose payload is not two non-negative safe integers', async () => {
    const f = scene()
    const call = callId('payload')
    await f.seeded(call)
    const face = faceOf(f, { cursorKey: CURSOR_KEY })
    const first = page(await face.list({ ...f.access(A, call), after: null, limit: 2 }))
    // The signer must reproduce the cursor the face issued, else the cases below prove nothing.
    expect(signedCursor(call, [1, 1])).toBe(first.next)
    for (const body of [
      null,
      'text',
      [1],
      [1, 1, 1],
      [1, -1],
      [-1, 1],
      [1, 1.5],
      [1, '1'],
      ['1', 1],
      { 0: 1, 1: 1, length: 2 },
    ])
      expect(
        await face.list({ ...f.access(A, call), after: signedCursor(call, body), limit: 2 }),
      ).toMatchObject(INVALID_AFTER)
    const resumed = page(
      await face.list({ ...f.access(A, call), after: signedCursor(call, [1, 0]), limit: 2 }),
    )
    expect(resumed.entries.map(e => e.dispatch)).toEqual(['mdisp_1', 'mdisp_2'])
  })
})

// --- Stored rows that do not parse ------------------------------------------------------------

/** Writes one column of one stored dispatch row, as a damaged or foreign writer would leave it. */
function rewriteDispatch(
  f: Scene,
  call: ModelCallId,
  seq: number,
  column: string,
  value: SqlValue,
): void {
  f.sqlite.seed(
    SHARED,
    `UPDATE md_dispatch SET ${column} = ? WHERE tenant = ? AND call = ? AND seq = ?`,
    [value, textOf(A), call, BigInt(seq)],
  )
}

/** Changes the stored record of one dispatch with `edit` and writes it back as JSON. */
function rewriteRecord(
  f: Scene,
  call: ModelCallId,
  seq: number,
  edit: (record: Record<string, unknown>) => unknown,
): void {
  const [row] = f.sqlite.rows(
    SHARED,
    'SELECT record FROM md_dispatch WHERE tenant = ? AND call = ? AND seq = ?',
    [textOf(A), call, BigInt(seq)],
  )
  const text = row?.[0]
  if (typeof text !== 'string') throw new Error('no stored record')
  const record: unknown = JSON.parse(text)
  if (!isRecord(record)) throw new Error('the stored record is not an object')
  rewriteDispatch(f, call, seq, 'record', JSON.stringify(edit(record)))
}

const supplierWith = (record: Record<string, unknown>, change: Record<string, unknown>) => ({
  ...record,
  supplier: { ...(isRecord(record['supplier']) ? record['supplier'] : {}), ...change },
})

const withoutKey = (record: Record<string, unknown>, name: string) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => key !== name))

const DAMAGED: readonly (readonly [string, (f: Scene, call: ModelCallId) => void])[] = [
  ['a record that is not JSON', (f, call) => rewriteDispatch(f, call, 0, 'record', 'not json')],
  ['a record that is JSON null', (f, call) => rewriteRecord(f, call, 0, () => null)],
  [
    'a record of another dispatch',
    (f, call) => rewriteRecord(f, call, 0, r => ({ ...r, dispatch: 'mdisp_99' })),
  ],
  [
    'a dispatch column that is no dispatch id, beside a record that names none',
    (f, call) => {
      rewriteRecord(f, call, 0, r => withoutKey(r, 'dispatch'))
      rewriteDispatch(f, call, 0, 'dispatch', 'not-a-dispatch')
    },
  ],
  [
    'a record without a supplier',
    (f, call) => rewriteRecord(f, call, 0, r => withoutKey(r, 'supplier')),
  ],
  [
    'a record without a terminal',
    (f, call) => rewriteRecord(f, call, 0, r => withoutKey(r, 'terminal')),
  ],
  [
    'a supplier that is text',
    (f, call) => rewriteRecord(f, call, 0, r => ({ ...r, supplier: 'text' })),
  ],
  [
    'an adapter adoption that is null',
    (f, call) => rewriteRecord(f, call, 0, r => supplierWith(r, { adoption: null })),
  ],
  [
    'an adapter adoption whose owner is a number',
    (f, call) =>
      rewriteRecord(f, call, 0, r => supplierWith(r, { adoption: { ...ADOPTION, owner: 5 } })),
  ],
  [
    'a send outside the stored values',
    (f, call) => rewriteRecord(f, call, 0, r => ({ ...r, send: 'delivered' })),
  ],
  [
    'a first content outside the stored values',
    (f, call) => rewriteRecord(f, call, 0, r => ({ ...r, firstContent: 'maybe' })),
  ],
  [
    'a terminal that is a number',
    (f, call) => rewriteRecord(f, call, 0, r => ({ ...r, terminal: 5 })),
  ],
  [
    'a terminal without a kind',
    (f, call) => rewriteRecord(f, call, 0, r => ({ ...r, terminal: { reason: CANARY } })),
  ],
  [
    'a terminal whose kind is not text',
    (f, call) => rewriteRecord(f, call, 0, r => ({ ...r, terminal: { kind: 7, reason: CANARY } })),
  ],
  [
    'a terminal of a kind the projection does not know',
    (f, call) =>
      rewriteRecord(f, call, 0, r => ({
        ...r,
        terminal: { kind: 'aborted', fault: { cause: 'unclassified', diagnostic: CANARY } },
      })),
  ],
  [
    'a failed terminal without a fault',
    (f, call) => rewriteRecord(f, call, 1, r => ({ ...r, terminal: { kind: 'failed' } })),
  ],
  [
    'a failed terminal whose cause is not text',
    (f, call) =>
      rewriteRecord(f, call, 1, r => ({
        ...r,
        terminal: { kind: 'failed', fault: { cause: 5, upstreamStatus: null, diagnostic: CANARY } },
      })),
  ],
  [
    'a failed terminal whose upstream status is a number',
    (f, call) =>
      rewriteRecord(f, call, 1, r => ({
        ...r,
        terminal: {
          kind: 'failed',
          fault: { cause: 'upstream-unavailable', upstreamStatus: 504, diagnostic: CANARY },
        },
      })),
  ],
  [
    'a logical terminal that is not JSON',
    (f, call) => rewriteDispatch(f, call, 2, 'logical_terminal', 'not json'),
  ],
  [
    'a logical terminal of a kind the projection does not know',
    (f, call) =>
      rewriteDispatch(
        f,
        call,
        2,
        'logical_terminal',
        JSON.stringify({ kind: 'aborted', fault: { cause: 'unclassified', diagnostic: CANARY } }),
      ),
  ],
  ['a seq beyond the safe integers', (f, call) => rewriteDispatch(f, call, 3, 'seq', 2n ** 60n)],
]

describe('a stored row outside the contract shape', () => {
  it('copies only the reason of a completed terminal that carries more fields', async () => {
    const f = scene()
    const call = callId('completed-extra')
    await f.seeded(call)
    rewriteRecord(f, call, 0, r => ({
      ...r,
      terminal: { kind: 'completed', reason: 'stop', note: CANARY },
    }))
    const got = page(await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 1 }))
    expect(got.entries.map(e => e.outcome)).toEqual([{ kind: 'completed', reason: 'stop' }])
    expect(JSON.stringify(got)).not.toContain('SECRET-CANARY')
  })

  for (const [name, damage] of DAMAGED)
    it(`answers unavailable, without the stored text, for ${name}`, async () => {
      const f = scene()
      const call = callId('damaged')
      await f.seeded(call)
      damage(f, call)
      const got = await f.diagnostics.list({ ...f.access(A, call), after: null, limit: 10 })
      expect(got).toMatchObject(UNAVAILABLE)
      expect(JSON.stringify(got)).not.toContain('SECRET-CANARY')
    })
})

// --- A provider that answers rows the handler would not -----------------------------------------

type Forge = (output: Record<string, unknown>, after: JsonValue | undefined) => JsonValue

/** A face whose storage passes the real `model.diagnostics` output through `forge` first. */
function forgedFace(f: Scene, forge: Forge, cursorKey?: Uint8Array) {
  const storage: SqlStorage = {
    ...f.sqlite.storage,
    async read(request) {
      const result = await f.sqlite.storage.read(request)
      if (result.kind !== 'read' || !isRecord(result.output) || !isRecord(request.input))
        return result
      const input: Record<string, JsonValue | undefined> = request.input
      return { ...result, output: forge(structuredClone(result.output), input['after']) }
    },
  }
  return faceOf(f, cursorKey === undefined ? { storage } : { storage, cursorKey })
}

function dispatchRows(output: Record<string, unknown>): Record<string, unknown>[] {
  const rows = output['dispatches']
  if (!Array.isArray(rows) || !rows.every(isRecord)) throw new Error('no dispatch rows')
  return rows
}

function withFirstRow(change: Record<string, JsonValue>): Forge {
  return output => {
    const [first, ...rest] = dispatchRows(output)
    return { ...output, dispatches: [{ ...first, ...change }, ...rest] } as JsonValue
  }
}

const FORGED: readonly (readonly [string, Forge])[] = [
  ['an output that is not an object', () => 'rows'],
  ['an output without the dispatch rows', output => ({ call: output['call'] }) as JsonValue],
  ['an output without the call row', output => ({ dispatches: output['dispatches'] }) as JsonValue],
  [
    'dispatch rows under a call that does not exist',
    output => ({ ...output, call: null }) as JsonValue,
  ],
  [
    'a call row version as text',
    output => ({ ...output, call: { row_version: '1' } }) as JsonValue,
  ],
  ['a call row version of 0', output => ({ ...output, call: { row_version: 0 } }) as JsonValue],
  ['a row of another tenant', withFirstRow({ tenant: 'another-tenant' })],
  ['a row of another call', withFirstRow({ call: 'mcall_another' })],
  ['a row that is null', output => ({ ...output, dispatches: [null] }) as JsonValue],
  [
    'rows out of seq order',
    output => ({ ...output, dispatches: dispatchRows(output).reverse() }) as JsonValue,
  ],
  [
    'two rows with the same seq',
    output => {
      const [first, second, ...rest] = dispatchRows(output)
      return {
        ...output,
        dispatches: [first, { ...second, seq: first?.['seq'] }, ...rest],
      } as JsonValue
    },
  ],
]

describe('a read output that the projection cannot trust', () => {
  for (const [name, forge] of FORGED)
    it(`answers unavailable for ${name}`, async () => {
      const f = scene()
      const call = callId('forged')
      await f.seeded(call)
      expect(
        await forgedFace(f, forge).list({ ...f.access(A, call), after: null, limit: 10 }),
      ).toMatchObject(UNAVAILABLE)
    })

  it('answers unavailable for a next page whose rows are not after the cursor', async () => {
    const f = scene()
    const call = callId('forged-after')
    await f.seeded(call)
    const face = forgedFace(f, (output, after) => {
      if (after === null) return output as JsonValue
      // The continuation repeats the last row of the first page.
      const rows = dispatchRows(output)
      return { ...output, dispatches: [{ ...rows[0], seq: after }, ...rows.slice(1)] } as JsonValue
    })
    const first = page(await face.list({ ...f.access(A, call), after: null, limit: 2 }))
    expect(first.next).not.toBeNull()
    expect(await face.list({ ...f.access(A, call), after: first.next, limit: 2 })).toMatchObject(
      UNAVAILABLE,
    )
  })
})

// --- The worker half ----------------------------------------------------------------------------

/** A read port over the scene's database that counts the rows it hands out. */
function portOf(f: Scene, counted: { rows: number } = { rows: 0 }): ReadPort {
  return {
    execute: (sql, params) => {
      const result = f.sqlite.seed(SHARED, sql, params)
      counted.rows += result.rows.length
      return result
    },
  }
}

describe('the read handler model.diagnostics', () => {
  it('is a read handler material of the records under its contract name', () => {
    expect(diagnosticsHandler.handler).toBe('model.diagnostics')
    expect(modelStorageMaterials().readHandlers.map(item => item.handler)).toContain(
      'model.diagnostics',
    )
  })

  it('reads the rows after the given seq, one more than the limit', async () => {
    const f = scene()
    const call = callId('handler-after')
    await f.seeded(call)
    const read = diagnosticsHandler.read({ tenant: textOf(A), call, after: 0, limit: 1 }, portOf(f))
    expect(read).toMatchObject({
      kind: 'read',
      output: { call: { row_version: 1 }, dispatches: [{ seq: 1 }, { seq: 2 }] },
    })
  })

  it('refuses an input outside its shape as failed', async () => {
    const f = scene()
    const call = callId('handler-input')
    await f.seeded(call)
    const tenant = textOf(A)
    const valid = { tenant, call, after: null, limit: 1 }
    expect(diagnosticsHandler.read(valid, portOf(f))).toMatchObject({ kind: 'read' })
    const refused: readonly JsonValue[] = [
      null,
      'input',
      [],
      { ...valid, tenant: '' },
      { ...valid, tenant: 5 },
      { tenant, after: null, limit: 1 },
      { tenant, call, limit: 1 },
      { ...valid, after: -1 },
      { ...valid, after: 1.5 },
      { ...valid, after: '0' },
      { ...valid, limit: 0 },
      { ...valid, limit: 1.5 },
      { ...valid, limit: DIAGNOSTICS_PAGE_MAX + 1 },
    ]
    for (const input of refused)
      expect(diagnosticsHandler.read(input, portOf(f))).toMatchObject({ kind: 'failed' })
  })

  it('stays within its declared row and output bounds on the largest page', async () => {
    const f = scene()
    const call = callId('handler-bounds')
    const many = Array.from({ length: DIAGNOSTICS_PAGE_MAX + 1 }, (_, seq) =>
      dispatchOf(seq, { send: 'started', firstContent: 'observed', terminal: null }),
    )
    await f.seeded(call, many)
    const declared = modelStorageMaterials().readHandlers.find(
      item => item.handler === 'model.diagnostics',
    )
    if (declared === undefined) throw new Error('no declared handler')
    const counted = { rows: 0 }
    const read = diagnosticsHandler.read(
      { tenant: textOf(A), call, after: null, limit: DIAGNOSTICS_PAGE_MAX },
      portOf(f, counted),
    )
    if (read.kind !== 'read') throw new Error(`the largest page failed: ${read.diagnostic}`)
    // One call row and one more dispatch row than the page.
    expect(counted.rows).toBe(DIAGNOSTICS_PAGE_MAX + 2)
    expect(counted.rows).toBeLessThanOrEqual(declared.maxRowsRead)
    expect(Buffer.byteLength(JSON.stringify(read.output))).toBeLessThanOrEqual(
      declared.maxOutputBytes,
    )
  })
})
