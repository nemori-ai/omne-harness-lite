import { beforeEach, describe, expect, it } from 'vitest'
import type { ContextBlockKey, HolderDecision } from '@omne-harness/runtime-context-contract'
import { staticScopeOf, staticScopeTenant } from '@omne-harness/static-scope-holder'
import {
  KIND,
  MECHANISMS,
  block,
  commits,
  holderCalls,
  need,
  readWith,
  recoveries,
  supplied,
  supplyOf,
  tenantA,
  tenantB,
  trustOf,
  world,
} from './support.ts'

const BUDGET = block('test.budget')
const OTHER = block('test.other')
const KEY = BUDGET.declaration.key
const OTHER_KEY = OTHER.declaration.key
const READER = { consumer: 'coordinator', blocks: [KEY], needs: [] } as const

beforeEach(() => {
  supplied.clear()
  supplied.set(supplyOf(KEY, tenantA), 12)
})

async function issued(
  holder: ReturnType<typeof world>['holder'],
  tenant = tenantA,
  reader: Parameters<typeof holder.issue>[2] = READER,
) {
  const result = await holder.issue('holder', tenant, reader)
  if ('failure' in result) throw new Error(`issue: ${JSON.stringify(result.failure)}`)
  return result.ok.eligibility
}

describe('the reference of a static scope', () => {
  it('is the same for the same kind and tenant, and different for another tenant or kind', () => {
    expect(staticScopeOf(KIND, tenantA)).toEqual(staticScopeOf(KIND, tenantA))
    expect(staticScopeOf(KIND, tenantA).ref).not.toBe(staticScopeOf(KIND, tenantB).ref)
    expect(staticScopeOf('other', tenantA).ref).not.toBe(staticScopeOf(KIND, tenantA).ref)
    expect(staticScopeOf(KIND, tenantA).parent).toBeUndefined()
  })

  it('gives back its tenant, and nothing for a reference of another kind or shape', () => {
    const scope = staticScopeOf(KIND, tenantA)
    expect(staticScopeTenant(KIND, scope)).toEqual(tenantA)
    expect(staticScopeTenant('other', scope)).toBeUndefined()
    const forged = [`${scope.ref} `, 'static-scope:tenant:{}', 'session-scope:abc']
    for (const ref of forged)
      expect(staticScopeTenant(KIND, { ...scope, ref: ref as typeof scope.ref })).toBeUndefined()
  })
})

describe.each(MECHANISMS)('the static scope holder over %s', (_name, factory) => {
  const fresh = (content = { blocks: [BUDGET], needs: [] as ReturnType<typeof need>[] }) =>
    world(factory, content)

  it('registers the current content, and a reader it issues reads what the owner supplies at that read', async () => {
    const w = fresh()
    expect(await w.holder.ensure('holder', tenantA)).toEqual({ ok: w.holder.scopeOf(tenantA) })
    const reader = await issued(w.holder)
    expect(await readWith(w.rc, reader)).toEqual({ values: { [KEY]: 12 }, missing: {} })
    supplied.set(supplyOf(KEY, tenantA), 3)
    expect(await readWith(w.rc, reader)).toEqual({ values: { [KEY]: 3 }, missing: {} })
  })

  it('reads a block its owner cannot supply as missing, and a block without a value as missing: never as empty', async () => {
    const w = fresh()
    const reader = await issued(w.holder)
    supplied.set(supplyOf(KEY, tenantA), 'unavailable')
    expect(await readWith(w.rc, reader)).toEqual({
      values: {},
      missing: { [KEY]: 'source-unavailable' },
    })
    supplied.delete(supplyOf(KEY, tenantA))
    expect(await readWith(w.rc, reader)).toEqual({ values: {}, missing: { [KEY]: 'no-value' } })
  })

  it('finds its registration again: a second ensure asks nothing, and a second holder with the same content changes nothing (CX-45)', async () => {
    const w = fresh({ blocks: [BUDGET, OTHER], needs: [] })
    await w.holder.ensure('holder', tenantA)
    const before = await issued(w.holder)
    expect([recoveries(w.ports), commits(w.ports)]).toEqual([1, 0])
    expect(await w.holder.ensure('holder', tenantA)).toEqual({ ok: w.holder.scopeOf(tenantA) })
    expect([recoveries(w.ports), commits(w.ports)]).toEqual([1, 0])
    expect(await w.another().ensure('holder', tenantA)).toEqual({ ok: w.holder.scopeOf(tenantA) })
    // The scope kept its readers: the mechanism found the same recovery again.
    expect(await readWith(w.rc, before)).toEqual({ values: { [KEY]: 12 }, missing: {} })
    const next = await w.rc.applyCommit('holder', {
      kind: 'registration',
      commit: { commit: 'a third registration' },
      after: null,
      change: {
        kind: 'add',
        scope: w.holder.scopeOf(tenantA),
        tenant: tenantA,
        key: 'test.third' as ContextBlockKey,
        basedOn: 2,
        creating: false,
        bindings: [],
        parameters: undefined,
        required: false,
      },
    })
    expect(next).toMatchObject({ kind: 'applied', registrationRevision: 3 })
  })

  it('serves no reader of the process before: after a rebuild a reader has to be issued again (CX-45)', async () => {
    const first = fresh()
    const old = await issued(first.holder)
    await first.rc.close()
    const second = fresh()
    expect(await readWith(second.rc, old)).toMatch(/^bind:(refused|unknown)$/)
    expect(await second.holder.ensure('holder', tenantA)).toEqual({
      ok: first.holder.scopeOf(tenantA),
    })
    expect(await readWith(second.rc, await issued(second.holder))).toEqual({
      values: { [KEY]: 12 },
      missing: {},
    })
  })

  it('keeps tenants apart: each tenant reads what is supplied for it, and no eligibility crosses', async () => {
    const w = fresh()
    supplied.set(supplyOf(KEY, tenantB), 99)
    expect(await readWith(w.rc, await issued(w.holder, tenantA))).toMatchObject({
      values: { [KEY]: 12 },
    })
    expect(await readWith(w.rc, await issued(w.holder, tenantB))).toMatchObject({
      values: { [KEY]: 99 },
    })
    const crossing = await w.rc.issueEligibility('holder', {
      supersedes: null,
      scope: w.holder.scopeOf(tenantA),
      consumer: 'coordinator',
      principal: 'holder',
      tenant: tenantB,
      keys: [KEY],
      bindings: [],
      registrationRevision: 1,
    })
    expect(crossing).toMatchObject({ kind: 'refused' })
  })

  it('follows the content: a withdrawn block is removed and reported missing, never read as empty; a new block is added', async () => {
    const w = fresh({ blocks: [BUDGET, OTHER], needs: [] })
    supplied.set(supplyOf(OTHER_KEY, tenantA), 5)
    await w.holder.ensure('holder', tenantA)
    w.content.current = { blocks: [OTHER], needs: [] }
    const gone = await w.holder.issue('holder', tenantA, {
      consumer: 'coordinator',
      blocks: [KEY, OTHER_KEY],
      needs: ['absent-need'],
    })
    expect(gone).toMatchObject({ ok: { missing: { blocks: [KEY], needs: ['absent-need'] } } })
    if ('failure' in gone) return
    expect(await readWith(w.rc, gone.ok.eligibility)).toEqual({
      values: { [OTHER_KEY]: 5 },
      missing: {},
    })
    expect(commits(w.ports)).toBe(1)
    w.content.current = { blocks: [BUDGET, OTHER], needs: [] }
    const back = await w.holder.issue('holder', tenantA, READER)
    expect(back).toMatchObject({ ok: { missing: { blocks: [], needs: [] } } })
    expect(await readWith(w.rc, await issued(w.holder))).toMatchObject({ values: { [KEY]: 12 } })
    expect(commits(w.ports)).toBe(2)
  })

  it('supplies through the contribution that is there now: a replaced contribution of the same block takes over', async () => {
    const w = fresh()
    const reader = await issued(w.holder)
    const replaced = { ...BUDGET, supply: async () => ({ kind: 'value', value: 77 }) as const }
    w.content.current = { blocks: [replaced], needs: [] }
    await w.holder.ensure('holder', tenantA)
    expect(await readWith(w.rc, reader)).toEqual({ values: { [KEY]: 77 }, missing: {} })
    expect(commits(w.ports)).toBe(0)
  })

  it('updates the bindings of a block when a need is contributed later, and hands the reader what its needs give it', async () => {
    const w = fresh()
    await w.holder.ensure('holder', tenantA)
    w.content.current = {
      blocks: [BUDGET, OTHER],
      needs: [
        need('plain', KEY),
        need('translated', OTHER_KEY, { translated: true }),
        need('unasked', OTHER_KEY),
        need('of-another-consumer', OTHER_KEY, { consumer: 'extension' }),
      ],
    }
    const needs = ['plain', 'translated', 'of-another-consumer']
    const granted = await w.holder.issue('holder', tenantA, {
      consumer: 'coordinator',
      blocks: [],
      needs,
    })
    expect(granted).toMatchObject({ ok: { missing: { needs: ['of-another-consumer'] } } })
    expect(holderCalls(w.ports, 'issue').at(-1)?.action).toMatchObject({
      material: {
        keys: [KEY],
        bindings: [{ need: 'translated', key: OTHER_KEY }],
        registrationRevision: 3,
      },
    })
    expect(commits(w.ports)).toBe(2)
  })

  it('ignores a need bound to a block that nobody declares, and reports it missing', async () => {
    const w = fresh({ blocks: [BUDGET], needs: [need('orphan', 'test.absent')] })
    const granted = await w.holder.issue('holder', tenantA, { ...READER, needs: ['orphan'] })
    expect(granted).toMatchObject({ ok: { missing: { blocks: [], needs: ['orphan'] } } })
    expect(holderCalls(w.ports, 'issue').at(-1)?.action).toMatchObject({
      material: { keys: [KEY], bindings: [] },
    })
    expect([recoveries(w.ports), commits(w.ports)]).toEqual([1, 0])
  })

  it('registers once when two callers ensure the same tenant together', async () => {
    const w = fresh({ blocks: [BUDGET, OTHER], needs: [] })
    const both = await Promise.all([
      w.holder.ensure('holder', tenantA),
      w.holder.ensure('holder', tenantA),
      w.holder.issue('holder', tenantA, READER),
    ])
    expect(both.every(result => 'ok' in result)).toBe(true)
    expect([recoveries(w.ports), commits(w.ports)]).toEqual([1, 0])
    expect(w.ports.calls.filter(call => call.face === 'producer')).toHaveLength(2)
  })

  it('answers unavailable for a block declared twice with different declarations, and registers nothing', async () => {
    const w = fresh({ blocks: [BUDGET, block(KEY, { required: false })], needs: [] })
    expect(await w.holder.ensure('holder', tenantA)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining(KEY) },
    })
    expect(w.ports.calls).toEqual([])
    w.content.current = { blocks: [BUDGET, BUDGET], needs: [] }
    expect(await w.holder.ensure('holder', tenantA)).toHaveProperty('ok')
    expect([recoveries(w.ports), commits(w.ports)]).toEqual([1, 0])
  })

  describe.each([
    ['register', 'registerProducer'],
    ['begin-replay', 'beginReplay'],
    ['finish-replay', 'finishReplay'],
    ['commit', 'applyCommit'],
    ['issue', 'issueEligibility'],
  ] as const)('when the authority of %s', (action, operation) => {
    // A commit happens only when the content changes after the recovery.
    const scripted = async (answer: HolderDecision<string>) => {
      const w = fresh()
      if (action === 'commit') await w.holder.ensure('holder', tenantA)
      w.content.current = { blocks: [BUDGET, OTHER], needs: [] }
      let once = true
      w.ports.script(call => {
        if (call.face === 'reader' || call.action.kind !== action || !once) return undefined
        once = false
        return answer
      })
      return w
    }

    it('is unavailable, the answer is unavailable with the operation named, and the next call finishes the work', async () => {
      const w = await scripted({ kind: 'unavailable' })
      expect(await w.holder.issue('holder', tenantA, READER)).toMatchObject({
        failure: { kind: 'unavailable', diagnostic: expect.stringContaining(operation) },
      })
      const reader = await w.holder.issue('holder', tenantA, {
        ...READER,
        blocks: [KEY, OTHER_KEY],
      })
      expect(reader).toMatchObject({ ok: { missing: { blocks: [] } } })
      expect(await readWith(w.rc, await issued(w.holder))).toMatchObject({ values: { [KEY]: 12 } })
      expect(commits(w.ports)).toBe(action === 'commit' ? 2 : 0)
    })

    it('is unknown, the answer is unavailable: never a success and never a denial', async () => {
      const w = await scripted({ kind: 'unknown' })
      expect(await w.holder.issue('holder', tenantA, READER)).toMatchObject({
        failure: { kind: 'unavailable' },
      })
    })

    it('refuses, the answer is denied', async () => {
      const w = await scripted({ kind: 'refused' })
      expect(await w.holder.issue('holder', tenantA, READER)).toEqual({
        failure: { kind: 'denied' },
      })
    })
  })

  describe('a read', () => {
    const entriesOf = async (
      w: ReturnType<typeof world>,
      request: Parameters<ReturnType<typeof world>['holder']['read']>[2] = READER,
    ) => {
      const read = await w.holder.read('holder', tenantA, request)
      if ('failure' in read) return read.failure
      return {
        entries: read.ok.entries.map(entry => [
          entry.key,
          entry.kind === 'value' ? entry.value : entry.kind,
        ]),
        missing: read.ok.missing,
      }
    }

    it('ensures, then gives an entry for each registered block and lists what is not registered', async () => {
      const w = fresh()
      const request = {
        consumer: 'coordinator',
        blocks: [KEY, OTHER_KEY],
        needs: ['absent'],
      } as const
      expect(await entriesOf(w, request)).toEqual({
        entries: [[KEY, 12]],
        missing: { blocks: [OTHER_KEY], needs: ['absent'] },
      })
      supplied.delete(supplyOf(KEY, tenantA))
      expect(await entriesOf(w, request)).toMatchObject({ entries: [[KEY, 'missing']] })
    })

    it('keeps the reader of a request object, and keeps the readers of two request objects apart', async () => {
      const w = fresh()
      for (const _ of [1, 2, 3]) expect(await entriesOf(w)).toMatchObject({ entries: [[KEY, 12]] })
      expect(holderCalls(w.ports, 'issue')).toHaveLength(1)
      expect(await entriesOf(w, { ...READER })).toMatchObject({ entries: [[KEY, 12]] })
      expect(holderCalls(w.ports, 'issue')).toHaveLength(2)
    })

    it('issues a reader again when the registration of its block changed under it', async () => {
      const w = fresh()
      expect(await entriesOf(w)).toMatchObject({ entries: [[KEY, 12]] })
      w.content.current = { blocks: [], needs: [] }
      expect(await entriesOf(w)).toEqual({ entries: [], missing: { blocks: [KEY], needs: [] } })
      w.content.current = { blocks: [BUDGET], needs: [] }
      expect(await entriesOf(w)).toMatchObject({ entries: [[KEY, 12]], missing: { blocks: [] } })
      expect(commits(w.ports)).toBe(2)
    })

    it.each([
      ['unavailable', { kind: 'unavailable', diagnostic: 'snapshot answered unknown' }],
      ['refused', { kind: 'denied' }],
    ] as const)(
      'answers unavailable while the authority of the reader is %s, and reads again afterwards',
      async (kind, failure) => {
        const w = fresh()
        expect(await entriesOf(w)).toMatchObject({ entries: [[KEY, 12]] })
        w.ports.script(call => (call.face === 'reader' ? { kind } : undefined))
        expect(await entriesOf(w)).toEqual(failure)
        w.ports.script(undefined)
        expect(await entriesOf(w)).toMatchObject({ entries: [[KEY, 12]] })
      },
    )

    it('answers the failure of the ensure, and of the bind, without reading', async () => {
      const w = fresh()
      w.ports.script(call =>
        call.face === 'holder' && call.action.kind === 'begin-replay'
          ? { kind: 'refused' }
          : undefined,
      )
      expect(await entriesOf(w)).toEqual({ kind: 'denied' })
      w.ports.script(undefined)
      await w.holder.ensure('holder', tenantA)
      await w.rc.close()
      expect(await entriesOf(w)).toMatchObject({ kind: 'unavailable' })
    })
  })

  it('answers unavailable when the mechanism throws, with what it threw', async () => {
    const ports = trustOf()
    const w = world(factory, { blocks: [BUDGET], needs: [] }, ports)
    ports.script(() => {
      throw new Error('the authority is down')
    })
    const failed = await w.holder.ensure('holder', tenantA)
    expect(failed).toMatchObject({ failure: { kind: 'unavailable' } })
    ports.script(undefined)
    expect(await w.holder.ensure('holder', tenantA)).toHaveProperty('ok')
  })

  it('answers unavailable when the mechanism is closed', async () => {
    const w = fresh()
    await w.rc.close()
    expect(await w.holder.ensure('holder', tenantA)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('closed') },
    })
  })

  it('answers unavailable when a second holder brings different content to a scope that is already registered', async () => {
    const w = fresh()
    await w.holder.ensure('holder', tenantA)
    w.content.current = { blocks: [OTHER], needs: [] }
    expect(await w.another().ensure('holder', tenantA)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('finishReplay') },
    })
  })
})
