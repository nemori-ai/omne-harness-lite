import { describe, expect, it } from 'vitest'
import type { ContextBlockKey, HolderDecision } from '@omne-harness/runtime-context-contract'
import { staticScopeOf, staticScopeTenant } from '@omne-harness/static-scope-holder'
import {
  KIND,
  MECHANISMS,
  block,
  commits,
  holderCalls,
  need,
  publish,
  readWith,
  recoveries,
  tenantA,
  tenantB,
  trustOf,
  world,
} from './support.ts'

const BUDGET = block('test.budget')
const OTHER = block('test.other')
const KEY = BUDGET.key
const READER = { consumer: 'coordinator', blocks: [KEY], needs: [] } as const

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

  it('registers the current content, so a reader it issues reads what the producer published', async () => {
    const w = fresh()
    const ensured = await w.holder.ensure('holder', tenantA)
    expect(ensured).toEqual({ ok: w.holder.scopeOf(tenantA) })
    await publish(w, tenantA, BUDGET, 12)
    expect(await readWith(w.rc, await issued(w.holder))).toEqual({
      values: { [KEY]: 12 },
      missing: {},
    })
  })

  it('finds its registration again: a second ensure asks nothing, and a second holder with the same content changes nothing (CX-45)', async () => {
    const w = fresh({ blocks: [BUDGET, OTHER], needs: [] })
    await w.holder.ensure('holder', tenantA)
    await publish(w, tenantA, BUDGET, 12)
    const before = await issued(w.holder)
    expect([recoveries(w.ports), commits(w.ports)]).toEqual([1, 0])
    expect(await w.holder.ensure('holder', tenantA)).toEqual({ ok: w.holder.scopeOf(tenantA) })
    expect([recoveries(w.ports), commits(w.ports)]).toEqual([1, 0])
    expect(await w.another().ensure('holder', tenantA)).toEqual({ ok: w.holder.scopeOf(tenantA) })
    // The scope kept its readers and its values: the mechanism found the same recovery again.
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
    await first.holder.ensure('holder', tenantA)
    await publish(first, tenantA, BUDGET, 12)
    const old = await issued(first.holder)
    await first.rc.close()
    const second = fresh()
    expect(await readWith(second.rc, old)).toMatch(/^bind:(refused|unknown)$/)
    expect(await second.holder.ensure('holder', tenantA)).toEqual({
      ok: first.holder.scopeOf(tenantA),
    })
    await publish(second, tenantA, BUDGET, 13)
    expect(await readWith(second.rc, await issued(second.holder))).toEqual({
      values: { [KEY]: 13 },
      missing: {},
    })
  })

  it('keeps tenants apart: the reader of another tenant reads its own scope, and no eligibility crosses', async () => {
    const w = fresh()
    await w.holder.ensure('holder', tenantA)
    await publish(w, tenantA, BUDGET, 12)
    const other = await readWith(w.rc, await issued(w.holder, tenantB))
    expect(other).not.toMatchObject({ values: { [KEY]: 12 } })
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
    await w.holder.ensure('holder', tenantA)
    await publish(w, tenantA, BUDGET, 12)
    await publish(w, tenantA, OTHER, 5)
    w.content.current = { blocks: [OTHER], needs: [] }
    const gone = await w.holder.issue('holder', tenantA, {
      consumer: 'coordinator',
      blocks: [KEY, OTHER.key],
      needs: ['absent-need'],
    })
    expect(gone).toMatchObject({ ok: { missing: { blocks: [KEY], needs: ['absent-need'] } } })
    if ('failure' in gone) return
    const view = await readWith(w.rc, gone.ok.eligibility)
    expect(view).toMatchObject({ values: { [OTHER.key]: 5 } })
    expect(view).not.toHaveProperty(['values', KEY])
    expect(commits(w.ports)).toBe(1)
    w.content.current = { blocks: [BUDGET, OTHER], needs: [] }
    await w.holder.ensure('holder', tenantA)
    await publish(w, tenantA, BUDGET, 14)
    const back = await w.holder.issue('holder', tenantA, READER)
    expect(back).toMatchObject({ ok: { missing: { blocks: [], needs: [] } } })
    expect(await readWith(w.rc, await issued(w.holder))).toMatchObject({ values: { [KEY]: 14 } })
    expect(commits(w.ports)).toBe(2)
  })

  it('updates the bindings of a block when a need is contributed later, and hands the reader what its needs give it', async () => {
    const w = fresh()
    await w.holder.ensure('holder', tenantA)
    w.content.current = {
      blocks: [BUDGET, OTHER],
      needs: [
        need('plain', KEY),
        need('translated', OTHER.key, { translated: true }),
        need('unasked', OTHER.key),
        need('of-another-consumer', OTHER.key, { consumer: 'extension' }),
      ],
    }
    const needs = ['plain', 'translated', 'of-another-consumer']
    await issued(w.holder, tenantA, { consumer: 'coordinator', blocks: [], needs })
    const issue = holderCalls(w.ports, 'issue').at(-1)
    expect(issue?.action).toMatchObject({
      material: {
        keys: [KEY],
        bindings: [{ need: 'translated', key: OTHER.key }],
        registrationRevision: 3,
      },
    })
    expect(commits(w.ports)).toBe(2)
  })

  it('ignores a need bound to a block that nobody declares', async () => {
    const w = fresh({ blocks: [BUDGET], needs: [need('orphan', 'test.absent')] })
    await issued(w.holder, tenantA, { consumer: 'coordinator', blocks: [], needs: ['orphan'] })
    const issue = holderCalls(w.ports, 'issue').at(-1)
    expect(issue?.action).toMatchObject({ material: { keys: [], bindings: [] } })
    expect(await w.holder.issue('holder', tenantA, { ...READER, needs: ['orphan'] })).toMatchObject(
      { ok: { missing: { blocks: [], needs: ['orphan'] } } },
    )
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
  })

  it('answers unavailable for a block declared twice with different declarations, and registers nothing', async () => {
    const w = fresh({ blocks: [BUDGET, block(KEY, { required: true })], needs: [] })
    expect(await w.holder.ensure('holder', tenantA)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining(KEY) },
    })
    expect(w.ports.calls).toEqual([])
    w.content.current = { blocks: [BUDGET, BUDGET], needs: [] }
    expect(await w.holder.ensure('holder', tenantA)).toHaveProperty('ok')
    expect([recoveries(w.ports), commits(w.ports)]).toEqual([1, 0])
  })

  describe.each([
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
        if (call.face !== 'holder' || call.action.kind !== action || !once) return undefined
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
        blocks: [KEY, OTHER.key],
      })
      expect(reader).toMatchObject({ ok: { missing: { blocks: [] } } })
      await publish(w, tenantA, BUDGET, 12)
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

  it('reads a registered block that no producer ever declared as a refusal, never as an empty value', async () => {
    const w = fresh()
    expect(await readWith(w.rc, await issued(w.holder))).toBe('snapshot:refused')
  })
})
