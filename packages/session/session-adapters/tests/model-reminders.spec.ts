import { describe, expect, it } from 'vitest'
import { accountCodec, organizationCodec, tenant as mintTenant } from '@omne-harness/legal-identity'
import type {
  BindResult,
  BlockEntry,
  ChangesResult,
  ContextReader,
  ReaderEligibilityResult,
  ScopeRef,
  SnapshotResult,
} from '@omne-harness/runtime-context-contract'
import { createModelReminders } from '@omne-harness/session-adapters/cordis'

const org = organizationCodec.parse(`org_${'1'.repeat(26)}`)
const acc = accountCodec.parse(`acc_${'1'.repeat(26)}`)
if (!org.ok || !acc.ok) throw new Error('fixture identity')
const tenant = mintTenant(org.value, acc.value)
const scope = { ref: 'session-scope:1' } as ScopeRef

function block(revision: number, value: unknown): BlockEntry {
  const key = 'session.modes' as BlockEntry['key']
  return {
    key,
    revision: revision as BlockEntry['revision'],
    state: value === undefined ? { kind: 'none' } : { kind: 'value', value },
    evidence: { key, revision: revision as BlockEntry['revision'], scope, generation: null },
    volatility: 'stable',
  }
}
const registration = { issued: 1, current: 1 } as never

function snapshotOf(view: number, blocks: readonly BlockEntry[]): SnapshotResult {
  return {
    kind: 'success',
    registration,
    value: {
      scope,
      viewRevision: view as never,
      cursor: { cursor: `c${view}` },
      blocks,
      missing: [],
      perRead: [],
    },
  }
}
function changesOf(from: number, to: number, entries: readonly BlockEntry[]): ChangesResult {
  return {
    kind: 'success',
    registration,
    value: {
      scope,
      from: from as never,
      to: to as never,
      cursor: { cursor: `c${to}` },
      entries: entries.map(({ volatility: _volatility, ...entry }) => entry),
      missing: [],
      perRead: [],
    },
  }
}

function world() {
  const reads: string[] = []
  let snapshot: SnapshotResult = snapshotOf(1, [block(1, { permission: 'ask' })])
  let changes: ChangesResult = changesOf(1, 1, [])
  let eligibility: ReaderEligibilityResult = { kind: 'current', eligibility: { eligibility: 'e1' } }
  const asked: unknown[] = []
  let ended = 0
  let binds = 0
  let refusal: Exclude<BindResult, { kind: 'bound' }> | null = null
  const reader: ContextReader = {
    consumer: 'model',
    scope,
    snapshot: async () => {
      reads.push('snapshot')
      return snapshot
    },
    changes: async cursor => {
      reads.push(`changes:${cursor.cursor}`)
      return changes
    },
    read: async () => ({ kind: 'refused', reason: 'closed' }),
    end: async () => {
      ended++
    },
  }
  const reminders = createModelReminders<string>({
    eligibility: {
      current: async request => {
        asked.push(request)
        return eligibility
      },
    },
    runtimeContext: {
      bind: async () => {
        binds++
        return refusal ?? { kind: 'bound', reader }
      },
    },
    descriptors: {
      get: key =>
        key === 'session.modes'
          ? ({ key, consumers: ['model', 'coordinator'], carriesPrevious: false } as never)
          : undefined,
    },
  })
  return {
    reminders,
    reads,
    binds: () => binds,
    asked,
    ended: () => ended,
    setSnapshot: (next: SnapshotResult) => (snapshot = next),
    setChanges: (next: ChangesResult) => (changes = next),
    setEligibility: (next: ReaderEligibilityResult) => (eligibility = next),
    refuseBind: (next: typeof refusal) => (refusal = next),
    prepare: (at = '7') => reminders.prepare({ principal: 'coordinator', tenant, scope, at }),
  }
}

const texts = (prepared: Awaited<ReturnType<ReturnType<typeof world>['prepare']>>) => {
  if (!('ok' in prepared)) throw new Error(`expected reminders, got ${JSON.stringify(prepared)}`)
  return prepared.ok.messages.map(message =>
    message.blocks.map(item => (item.kind === 'text' ? item.text : '')).join(''),
  )
}

describe('the reminders of the model (T4)', () => {
  it('nothing told and a block with a value: one snapshot reminder with the value', async () => {
    const w = world()
    const prepared = await w.prepare()
    const [text] = texts(prepared)
    expect(text).toContain('Runtime context: the current values.')
    expect(text).toContain('{"permission":"ask"}')
    expect('ok' in prepared && prepared.ok.messages[0]?.role).toBe('system_reminder')
    expect(w.reads).toEqual(['snapshot'])
  })

  it('nothing told and no block with a value: no reminder, and after the commit nothing is told again', async () => {
    const w = world()
    w.setSnapshot(snapshotOf(1, [block(1, undefined)]))
    const first = await w.prepare()
    expect(texts(first)).toEqual([])
    if ('ok' in first) first.ok.advance()
    expect(texts(await w.prepare())).toEqual([])
    expect(w.reads).toEqual(['snapshot', 'changes:c1'])
  })

  it('told and a changed block: one change reminder; told and nothing changed: none', async () => {
    const w = world()
    const first = await w.prepare()
    if ('ok' in first) first.ok.advance()
    w.setChanges(changesOf(1, 2, [block(2, { permission: 'auto' })]))
    const second = await w.prepare()
    const [text] = texts(second)
    expect(text).toContain('Runtime context: these values changed.')
    expect(text).toContain('from="1" to="2"')
    expect(text).toContain('{"permission":"auto"}')
    if ('ok' in second) second.ok.advance()
    w.setChanges(changesOf(2, 2, []))
    expect(texts(await w.prepare())).toEqual([])
    expect(w.reads).toEqual(['snapshot', 'changes:c1', 'changes:c2'])
  })

  it('a reminder that was not committed is told again in full, and so after forget', async () => {
    const w = world()
    await w.prepare()
    expect(texts(await w.prepare())).toHaveLength(1)
    const told = await w.prepare()
    if ('ok' in told) told.ok.advance()
    w.reminders.forget({ tenant, scope })
    expect(texts(await w.prepare())[0]).toContain('the current values')
    expect(w.reads).toEqual(['snapshot', 'snapshot', 'snapshot', 'snapshot'])
  })

  it('an invalidated cursor or a reissued eligibility reads a new full snapshot', async () => {
    const w = world()
    const first = await w.prepare()
    if ('ok' in first) first.ok.advance()
    w.setChanges({ kind: 'cursor-invalidated' })
    expect(texts(await w.prepare())[0]).toContain('the current values')
    const again = await w.prepare()
    if ('ok' in again) again.ok.advance()
    w.setEligibility({ kind: 'current', eligibility: { eligibility: 'e2' } })
    expect(texts(await w.prepare())[0]).toContain('the current values')
    expect(w.binds()).toBe(2)
  })

  it('a refused, missing or unknown read fails and is never read as no change', async () => {
    const w = world()
    w.setSnapshot({ kind: 'refused', reason: 'unauthorized' })
    expect(await w.prepare()).toEqual({ failure: { kind: 'denied' } })
    w.setSnapshot({
      kind: 'missing',
      items: [{ key: 'session.modes' as never, cause: 'source-unavailable', revision: null }],
    })
    expect(await w.prepare()).toMatchObject({ failure: { kind: 'unavailable' } })
    w.setSnapshot(snapshotOf(1, [block(1, { permission: 'ask' })]))
    const first = await w.prepare()
    if ('ok' in first) first.ok.advance()
    w.setChanges({ kind: 'unknown', cause: 'source-unknown' })
    expect(await w.prepare()).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('source-unknown') },
    })
    w.setEligibility({ kind: 'refused' })
    expect(await w.prepare()).toEqual({ failure: { kind: 'denied' } })
  })

  it('an eligibility the holder cannot give and a reader Runtime Context will not bind are failures', async () => {
    const w = world()
    w.setEligibility({ kind: 'absent' })
    expect(await w.prepare()).toEqual({
      failure: {
        kind: 'unavailable',
        diagnostic: 'the model has no reader eligibility in this scope',
      },
    })
    w.setEligibility({ kind: 'unknown' })
    expect(await w.prepare()).toEqual({
      failure: {
        kind: 'unavailable',
        diagnostic: 'the reader eligibility of the model is unknown',
      },
    })
    w.setEligibility({ kind: 'unavailable', diagnostic: 'holder stopped' })
    expect(await w.prepare()).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'holder stopped' },
    })
    expect(w.binds()).toBe(0)
    w.setEligibility({ kind: 'current', eligibility: { eligibility: 'e1' } })
    w.refuseBind({ kind: 'refused', reason: 'unauthorized' })
    expect(await w.prepare()).toEqual({ failure: { kind: 'denied' } })
    w.refuseBind({ kind: 'refused', reason: 'scope-ended' })
    expect(await w.prepare()).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('scope-ended') },
    })
    w.refuseBind({ kind: 'unknown', cause: 'replay-unknown' })
    expect(await w.prepare()).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('replay-unknown') },
    })
  })

  it('asks the holder for the eligibility of the model in this scope, for this principal and tenant', async () => {
    const w = world()
    await w.prepare()
    expect(w.asked).toEqual([{ principal: 'coordinator', tenant, scope, consumer: 'model' }])
  })

  it('a read refused for another reason than authority, or a read with missing blocks, is unavailable with the cause', async () => {
    const w = world()
    w.setSnapshot({ kind: 'refused', reason: 'closed' })
    expect(await w.prepare()).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'runtime context refused the read: closed' },
    })
    const missing = [{ key: 'session.modes' as never, cause: 'no-value' as const, revision: null }]
    w.setSnapshot({
      kind: 'missing',
      items: missing,
    })
    expect(await w.prepare()).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'runtime context is missing session.modes' },
    })
    const success = snapshotOf(1, [block(1, { permission: 'ask' })])
    if (success.kind !== 'success') throw new Error('fixture')
    w.setSnapshot({ ...success, value: { ...success.value, missing } })
    expect(await w.prepare()).toMatchObject({ failure: { kind: 'unavailable' } })
    w.setSnapshot(success)
    const first = await w.prepare()
    if ('ok' in first) first.ok.advance()
    const changed = changesOf(1, 2, [block(2, { permission: 'auto' })])
    if (changed.kind !== 'success') throw new Error('fixture')
    w.setChanges({ ...changed, value: { ...changed.value, missing } })
    expect(await w.prepare()).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('tells each change from the revision told before it', async () => {
    const w = world()
    const told = async () => {
      const prepared = await w.prepare()
      if ('ok' in prepared) prepared.ok.advance()
      return texts(prepared)
    }
    await told()
    w.setChanges(changesOf(1, 2, [block(2, { permission: 'auto' })]))
    expect((await told())[0]).toContain('from="1" to="2"')
    w.setChanges(changesOf(2, 3, [block(3, { permission: 'never' })]))
    expect((await told())[0]).toContain('from="2" to="3"')
  })

  it('keeps what was told apart by scope', async () => {
    const w = world()
    const other = { ref: 'session-scope:2' } as ScopeRef
    const first = await w.prepare()
    if ('ok' in first) first.ok.advance()
    const elsewhere = await w.reminders.prepare({
      principal: 'coordinator',
      tenant,
      scope: other,
      at: '7',
    })
    expect(texts(elsewhere)[0]).toContain('the current values')
  })

  it('ends the reader it no longer uses when the eligibility is reissued', async () => {
    const w = world()
    const first = await w.prepare()
    if ('ok' in first) first.ok.advance()
    expect(w.ended()).toBe(0)
    w.setEligibility({ kind: 'current', eligibility: { eligibility: 'e2' } })
    await w.prepare()
    expect(w.ended()).toBe(1)
  })

  it('gives the same message id for the same read at the same Session revision, another at another', async () => {
    const w = world()
    const one = await w.prepare('7')
    const two = await w.prepare('7')
    const three = await w.prepare('8')
    const id = (prepared: typeof one) => ('ok' in prepared ? prepared.ok.messages[0]?.id : null)
    expect(id(one)).toBe(id(two))
    expect(id(three)).not.toBe(id(one))
  })
})
