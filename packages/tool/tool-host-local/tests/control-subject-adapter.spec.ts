import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createToolLedger,
  type AccessVerdict,
  type ToolLedgerGuards,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import type { ToolFailure } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import {
  createLocalToolControlSubjects,
  type LocalToolControlSubject,
  type LocalToolControlSubjectsInput,
} from '../src/control-subject-adapter.ts'
import { callHostDomain } from '../src/host-domains.ts'
import {
  adoption,
  callId,
  evidence,
  instanceId,
  operationId,
  request,
  tenantA,
  tenantB,
} from './coordinator-values.ts'

type Principal = Readonly<{ session: string; revision: string }>
const call = callId('controlled-call')
const context = { tenant: tenantA, call }

function ok<T>(outcome: Outcome<T, ToolFailure>): T {
  if ('failure' in outcome) throw new Error(`fixture: ${outcome.failure.kind}`)
  return outcome.ok
}

function fixture(store: ToolLedgerStore = createMemoryToolLedgerStore()) {
  const trusted = new WeakSet<Principal>()
  const current = new Map<string, Principal>()
  const revoked = new Set<string>()
  const qualified: Principal[] = []
  const mint = (session: string, revision = '1') => {
    const principal = { session, revision }
    trusted.add(principal)
    current.set(session, principal)
    return principal
  }
  const a = mint('session-a')
  const b = mint('session-b')
  const input: LocalToolControlSubjectsInput<Principal> = {
    store,
    project: async principal =>
      trusted.has(principal)
        ? succeed({
            tenant: tenantA,
            kind: 'acting-for-tenant',
            actor: { component: 'sessionWorkPrincipals' },
            work: { owner: 'session', work: principal.session },
          })
        : fail({ kind: 'denied', action: 'control' }),
    resolveSessionWork: async ({ session }) => {
      const principal = current.get(session)
      return principal === undefined
        ? fail({ kind: 'unavailable', dependency: 'session', diagnostic: 'missing' })
        : succeed(principal)
    },
    qualify: async ({ principal }): Promise<AccessVerdict> => {
      qualified.push(principal)
      return revoked.has(principal.session)
        ? { kind: 'denied', reason: 'revoked' }
        : { kind: 'allowed' }
    },
    commitAttempts: 3,
  }
  const build = (overrides: Partial<typeof input> = {}) =>
    createLocalToolControlSubjects({ ...input, ...overrides })
  return { store, input, build, mint, current, revoked, qualified, a, b }
}

describe('persistent control subjects', () => {
  it('fixes caller scope before awaiting projection and stores no credential data', async () => {
    const f = fixture()
    const principal = f.mint('opaque/session:with separators', 'credential-secret')
    let release = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const adapter = f.build({
      project: async current => {
        await gate
        return f.input.project(current)
      },
    })
    const caller = { ...context, principal }
    const capture = adapter.capture(caller)
    caller.call = callId('changed-call')
    caller.tenant = tenantB
    release()
    const subject = ok(await capture)
    expect(await f.build().qualify({ ...context, subject })).toEqual({ kind: 'allowed' })
    expect(await f.build().qualify({ ...caller, subject })).toMatchObject({ kind: 'denied' })
    const read = await f.store.read(callHostDomain(tenantA, 'control', call))
    expect(JSON.stringify(read)).not.toContain('credential-secret')
    expect(JSON.stringify(read)).not.toContain('"principal"')
  })

  it('resolves the original B after rebuild and checks its current qualification', async () => {
    const f = fixture()
    const subject = ok(await f.build().capture({ ...context, principal: f.b }))
    f.current.clear()
    const fresh = f.mint(f.b.session, '2')
    f.revoked.add(f.b.session)
    const rebuilt = f.build()
    expect(await rebuilt.matches({ ...context, principal: fresh, subject })).toEqual({
      kind: 'allowed',
    })
    expect(await rebuilt.qualify({ ...context, subject })).toMatchObject({ kind: 'denied' })
    expect(f.qualified.at(-1)).toBe(fresh)
    expect(f.qualified).not.toContain(f.a)
  })

  it('rejects another Session and forged credentials with the same visible fields', async () => {
    const f = fixture()
    const adapter = f.build()
    const subject = ok(await adapter.capture({ ...context, principal: f.b }))
    for (const principal of [f.a, { ...f.b }]) {
      expect(await adapter.matches({ ...context, principal, subject })).toMatchObject({
        kind: 'denied',
      })
    }
    expect(await adapter.qualify({ tenant: tenantB, call, subject })).toMatchObject({
      kind: 'denied',
    })
    expect(
      await adapter.qualify({ ...context, call: callId('other-call'), subject }),
    ).toMatchObject({ kind: 'denied' })
  })

  it('keeps the first evidence across source revisions and unrelated host commits', async () => {
    const f = fixture()
    const adapter = f.build()
    const subject = ok(await adapter.capture({ ...context, principal: f.b }))
    ok(await adapter.capture({ ...context, principal: f.a }))
    const fresh = f.mint(f.b.session, '2')
    expect(ok(await f.build().capture({ ...context, principal: fresh }))).toEqual(subject)
    expect(await f.build().qualify({ ...context, subject })).toEqual({ kind: 'allowed' })
    expect(f.qualified.at(-1)).toBe(fresh)
  })

  it('persists one association when two adapters race', async () => {
    const f = fixture()
    const [first, second] = await Promise.all([
      f.build().capture({ ...context, principal: f.b }),
      f.build().capture({ ...context, principal: f.b }),
    ])
    expect(ok(first)).toEqual(ok(second))
    const read = await f.store.read(callHostDomain(tenantA, 'control', call))
    expect(read.kind === 'complete' && read.records.length).toBe(1)
  })

  it.each(['unknown-applied', 'unknown-dropped', 'throw-applied', 'throw-dropped'] as const)(
    'recognizes only a confirmed original association after %s',
    async fault => {
      const memory = createMemoryToolLedgerStore()
      let armed = true
      const keys: string[] = []
      const store: ToolLedgerStore = {
        ...memory,
        commit: async input => {
          const write = input.writes[0]
          if (write?.kind === 'put' && write.record.kind === 'host')
            keys.push(write.record.host.key)
          if (!armed) return memory.commit(input)
          armed = false
          if (fault.endsWith('applied')) await memory.commit(input)
          if (fault.startsWith('throw')) throw new Error('secret')
          return { kind: 'unknown', diagnostic: 'lost reply' }
        },
      }
      const f = fixture(store)
      const first = await f.build().capture({ ...context, principal: f.b })
      if (fault.endsWith('applied')) expect('ok' in first).toBe(true)
      else expect(first).toMatchObject({ failure: { kind: 'unavailable' } })
      const retry = ok(await f.build().capture({ ...context, principal: f.b }))
      if ('ok' in first) expect(retry).toEqual(first.ok)
      expect(new Set(keys).size).toBe(1)
      const read = await memory.read(callHostDomain(tenantA, 'control', call))
      expect(read.kind === 'complete' && read.records.length).toBe(1)
      expect(JSON.stringify(first)).not.toContain('secret')
    },
  )

  it('re-reads conflicts within its budget and cannot report an absent record as committed', async () => {
    const memory = createMemoryToolLedgerStore()
    let conflicts = 2
    let commits = 0
    const f = fixture({
      ...memory,
      commit: async input => {
        commits += 1
        if (conflicts-- > 0) return { kind: 'conflict', current: input.expected }
        return memory.commit(input)
      },
    })
    expect('ok' in (await f.build().capture({ ...context, principal: f.b }))).toBe(true)
    expect(commits).toBe(3)
    conflicts = 10
    expect(await f.build().capture({ ...context, principal: f.a })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(commits).toBe(6)
  })

  it.each(['project', 'resolveSessionWork', 'qualify'] as const)(
    'fails closed when %s is missing, throws, or returns a malformed answer',
    async name => {
      const f = fixture()
      const subject = ok(await f.build().capture({ ...context, principal: f.b }))
      for (const broken of [
        undefined,
        7,
        async () => {
          throw new Error('secret')
        },
        async () => null,
        async () => ({ kind: 'invalid' }),
      ]) {
        const overrides = { [name]: broken } as Partial<typeof f.input>
        const result = await f.build(overrides).qualify({ ...context, subject })
        expect(result).toMatchObject({ kind: 'unavailable' })
        expect(JSON.stringify(result)).not.toContain('secret')
      }
    },
  )

  it('denies a resolver that returns a different trusted Session or tenant', async () => {
    const f = fixture()
    const subject = ok(await f.build().capture({ ...context, principal: f.b }))
    expect(
      await f
        .build({ resolveSessionWork: async () => succeed(f.a) })
        .qualify({ ...context, subject }),
    ).toMatchObject({ kind: 'denied' })
    const projection = ok(await f.input.project(f.b))
    for (const changed of [
      { ...projection, tenant: tenantB },
      { ...projection, actor: { component: 'different-actor' } },
      { ...projection, work: { owner: 'other-owner', work: f.b.session } },
    ]) {
      const adapter = f.build({ project: async () => succeed(changed as LocalToolControlSubject) })
      expect(await adapter.qualify({ ...context, subject })).toMatchObject({ kind: 'denied' })
      expect(await adapter.matches({ ...context, principal: f.b, subject })).toMatchObject({
        kind: 'denied',
      })
    }
  })

  it('rejects malformed projections and forged tenants without writing', async () => {
    const f = fixture()
    const projection = ok(await f.input.project(f.b))
    for (const changed of [
      null,
      {},
      { ...projection, work: { owner: 'session', work: '' } },
      { ...projection, tenant: { ...tenantA } },
    ]) {
      expect(
        await f
          .build({ project: async () => succeed(changed as LocalToolControlSubject) })
          .capture({ ...context, principal: f.b }),
      ).toMatchObject({ failure: { kind: 'unavailable' } })
    }
    expect(
      await f.build().capture({ ...context, tenant: { ...tenantA }, principal: f.b }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    const read = await f.store.read(callHostDomain(tenantA, 'control', call))
    expect(read.kind === 'complete' && read.records.length).toBe(0)
  })

  it('does not persist when capture qualification denies or is unavailable', async () => {
    const f = fixture()
    for (const verdict of [
      { kind: 'denied', reason: 'revoked' },
      { kind: 'unavailable', diagnostic: 'down' },
    ] satisfies AccessVerdict[]) {
      expect(
        await f.build({ qualify: async () => verdict }).capture({ ...context, principal: f.b }),
      ).toMatchObject({ failure: { kind: verdict.kind } })
    }
    const read = await f.store.read(callHostDomain(tenantA, 'control', call))
    expect(read.kind === 'complete' && read.records.length).toBe(0)
  })

  it('detects reference tampering and never repairs missing or corrupt stored bindings', async () => {
    const f = fixture()
    const subject = ok(await f.build().capture({ ...context, principal: f.b }))
    for (const changed of [
      { ...subject, owner: 'other-owner' },
      { ...subject, revision: '2' },
      { ...subject, digest: `sha256:${'0'.repeat(64)}` },
      { ...subject, record: 'control-subjects:bad-json' },
    ])
      expect(await f.build().qualify({ ...context, subject: changed })).toMatchObject({
        kind: 'denied',
      })
    expect(
      await fixture()
        .build()
        .qualify({ ...context, subject }),
    ).toMatchObject({ kind: 'unavailable' })
    const domain = callHostDomain(tenantA, 'control', call)
    const read = await f.store.read(domain)
    if (read.kind !== 'complete') throw new Error('fixture read')
    const record = read.records[0]
    if (record?.kind !== 'host') throw new Error('fixture binding')
    const next = decodeToolRevision(String(BigInt(read.revision) + 1n))
    if ('failure' in next) throw new Error('fixture revision')
    await f.store.commit({
      domain,
      expected: read.revision,
      revision: next.ok,
      writes: [{ kind: 'put', record: { kind: 'host', host: { ...record.host, value: {} } } }],
    })
    expect(await f.build().qualify({ ...context, subject })).toMatchObject({ kind: 'unavailable' })
    expect(await f.build().capture({ ...context, principal: f.b })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it.each(['throws', 'unavailable'] as const)('fails closed when the store read %s', async kind => {
    const f = fixture()
    const subject = ok(await f.build().capture({ ...context, principal: f.b }))
    const store: typeof f.store = {
      ...f.store,
      readRecord: async () => {
        if (kind === 'throws') throw new Error('secret')
        return { kind: 'unavailable', diagnostic: 'down' }
      },
    }
    const adapter = f.build({ store })
    expect(await adapter.capture({ ...context, principal: f.b })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(await adapter.matches({ ...context, principal: f.b, subject })).toMatchObject({
      kind: 'unavailable',
    })
    expect(await adapter.qualify({ ...context, subject })).toMatchObject({ kind: 'unavailable' })
  })

  it('rejects an invalid retry budget at construction', () => {
    const f = fixture()
    for (const commitAttempts of [0, -1, 1.1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() => f.build({ commitAttempts })).toThrow(TypeError)
  })

  it.each(['schema', 'tenant', 'call', 'subject', 'evidence', 'extra'] as const)(
    'refuses a stored record with a corrupt %s field',
    async field => {
      const f = fixture()
      const subject = ok(await f.build().capture({ ...context, principal: f.b }))
      const damaged: typeof f.store = {
        ...f.store,
        readRecord: async (domain, key) => {
          const read = await f.store.readRecord(domain, key)
          if (read.kind !== 'complete' || read.record?.kind !== 'host') return read
          const value = read.record.host.value
          if (typeof value !== 'object' || value === null) throw new Error('fixture record')
          return {
            ...read,
            record: {
              ...read.record,
              host: { ...read.record.host, value: { ...value, [field]: 'corrupt' } },
            },
          }
        },
      }
      const adapter = f.build({ store: damaged })
      expect(await adapter.qualify({ ...context, subject })).toMatchObject({ kind: 'unavailable' })
      expect(await adapter.capture({ ...context, principal: f.b })).toMatchObject({
        failure: { kind: 'unavailable' },
      })
    },
  )

  it('answers a commit the store rejects as a definite failure without another attempt', async () => {
    const memory = createMemoryToolLedgerStore()
    let commits = 0
    const f = fixture({
      ...memory,
      commit: async () => {
        commits += 1
        return { kind: 'rejected', reason: 'command_limit' }
      },
    })
    expect(await f.build().capture({ ...context, principal: f.b })).toEqual({
      failure: { kind: 'invalid', field: 'storage', reason: 'command_limit' },
    })
    expect(commits).toBe(1)
  })

  it('does not retry a commit that the store reports as unavailable', async () => {
    const memory = createMemoryToolLedgerStore()
    let commits = 0
    const f = fixture({
      ...memory,
      commit: async () => {
        commits += 1
        return { kind: 'unavailable', diagnostic: 'offline' }
      },
    })
    expect(await f.build().capture({ ...context, principal: f.b })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(commits).toBe(1)
  })
})

/** The real ledger runs over memory; identity and external providers below are test doubles. */
function ledgerFor(f: ReturnType<typeof fixture>) {
  const never = () => {
    throw new Error('unused fixture provider')
  }
  const guards: ToolLedgerGuards<Principal, ContentBlock> = {
    access: { qualify: f.input.qualify },
    sources: { verify: async () => ({ kind: 'trusted' }) },
    factAcknowledgements: { verify: async () => ({ kind: 'trusted' }) },
    grants: new Map([['scope-owner', { verifyGrant: async () => ({ kind: 'granted' as const }) }]]),
    starts: { qualifyStart: async () => ({ kind: 'allowed' }) },
    results: { text: never },
    policy: { adoption: adoption('policy'), judge: succeed, judgeResult: succeed },
    budgets: {
      arguments: {
        maxBytes: 4096,
        maxDepth: 16,
        maxItems: 256,
        maxMembers: 64,
        maxStringLength: 1024,
        maxNumberLength: 32,
      },
    },
  }
  return createToolLedger(
    f.store,
    guards,
    createMemoryToolClock(),
    {
      resultPageBytes: 4096,
      ledgerCommitAttempts: 3,
      authorBufferBytes: 65_536,
      authorBufferItems: 128,
      queueCapacity: 10,
      readResultArguments: {
        maxBytes: 65_536,
        maxDepth: 32,
        maxItems: 4096,
        maxMembers: 256,
        maxStringLength: 32_768,
        maxNumberLength: 64,
      },
      offloading: {
        maxInlineUtf8Bytes: 65_536,
        maxRetentionMs: 86_400_000,
        maxBodyBytes: 16_777_216,
        previewUtf8Bytes: 1_024,
        maxPageBytes: 65_536,
        maxPageLeaseMs: 30_000,
        permitMs: 30_000,
        clockSkewMs: 1_000,
        orphanGraceMs: 60_000,
        maxWriterMetadataBytes: 1_048_576,
        jsonDocument: {
          maxBytes: 1_048_576,
          maxDepth: 64,
          maxItems: 65_536,
          maxMembers: 65_536,
          maxStringLength: 1_048_576,
          maxNumberLength: 64,
        },
        jsonRecord: {
          maxBytes: 65_536,
          maxDepth: 32,
          maxItems: 4096,
          maxMembers: 4096,
          maxStringLength: 65_536,
          maxNumberLength: 64,
        },
      },
    },
    {
      controlSubjects: f.build(),
      content: null,
      releaseInspection: { adoption: adoption('environment'), inspectRelease: never },
    },
  )
}

it('the rebuilt real ledger saves B rejection while A can advance, without dispatching a stop', async () => {
  const f = fixture()
  const ledger = ledgerFor(f)
  const access = { ...context, principal: f.a }
  const fixed = request()
  ok(await ledger.commands.admit({ ...access, operation: operationId('admit'), request: fixed }))
  const write = async (operation: string) => ({
    ...access,
    operation: operationId(operation),
    instance: instanceId,
    generation: '1',
    expected: ok(await ledger.commands.loadRecovery(access)).state.revision,
  })
  const preparation = ok(
    await ledger.commands.planPreparation({
      ...(await write('plan')),
      request: fixed,
      purpose: 'initial',
      environmentAdoption: adoption('environment'),
    }),
  )
  ok(
    await ledger.commands.prepared({
      ...(await write('prepared')),
      preparation,
      resources: evidence('resources'),
    }),
  )
  ok(await ledger.commands.enqueue(await write('enqueue')))
  const { start } = ok(await ledger.commands.prepareStart(await write('start')))
  ok(
    await ledger.commands.recordStart({
      ...(await write('record-start')),
      invocation: start,
      outcome: { kind: 'started', acceptance: evidence('accepted') },
    }),
  )
  const input = {
    ...context,
    principal: f.b,
    operation: operationId('control-b'),
    intent: { kind: 'stop' as const },
  }
  const receipt = ok(await ledger.commands.control(input))
  f.current.clear()
  const fresh = f.mint(f.b.session, '2')
  const rebuilt = ledgerFor(f)
  expect(ok(await rebuilt.commands.control({ ...input, principal: fresh }))).toEqual(receipt)
  f.revoked.add(f.b.session)
  f.qualified.length = 0
  const control = ok(await rebuilt.commands.loadRecovery(access)).controls[0]
  if (control === undefined) throw new Error('fixture control')
  const authorized = ok(
    await rebuilt.controls.prepareDispatch({
      ...access,
      control: control.operation,
      source: control.source,
    }),
  )
  let dispatches = 0
  if (authorized.progress.kind === 'pending') dispatches += 1
  expect(dispatches).toBe(0)
  expect(authorized.progress).toMatchObject({
    kind: 'rejected',
    reason: 'control-qualification-denied',
  })
  expect(f.qualified).toContain(f.a)
  expect(f.qualified).toContain(fresh)
  const recovery = ok(await ledgerFor(f).commands.loadRecovery(access))
  expect(recovery.controls[0]?.progress.kind).toBe('rejected')
  expect(recovery.tasks.some(task => task.kind === 'stop')).toBe(false)
  expect(recovery.state.execution.kind).toBe('live')
})
