import { describe, expect, it } from 'vitest'
import {
  ask,
  declare,
  deployment,
  find,
  impact,
  list,
  report,
  standingOf,
  tree,
  type Contract,
  type Entry,
  type Registry,
  type Scope,
} from '../src/index.ts'
import { below, contract, entry, inst, pick, randomOf, registryOf } from './support.ts'

const ORG: Scope = ['org-a']
const TENANT: Scope = ['org-a', 'alice']
const OTHER: Scope = ['org-b', 'bob']
const SCOPES: readonly Scope[] = [[], ORG, TENANT, [...TENANT, 'skin'], OTHER, ['org-b']]
const CLOSED = {
  only: 'deployment',
  why: 'no-tenant',
  note: 'Nobody is signed in when it is drawn.',
} as const

const points = (over: Partial<Contract>) =>
  ['host', [declare(contract('memory.stores', over))]] as const
const put = (digest: string, over: Partial<Entry> = {}): Entry =>
  entry('memory.stores', 'graph', { digest, ...over })

/** What stands for one asker: the answer on one key and the whole list, without who is out. */
function stands(registry: Registry, asker: Scope): unknown {
  const answer = ask(registry, 'memory.stores', 'graph', asker)
  const read = list(registry, 'memory.stores', null, asker)
  return [
    answer.kind === 'one'
      ? answer.entry.digest
      : answer.kind === 'conflict'
        ? answer.entries.map(e => e.digest)
        : answer.kind,
    read.kind === 'read'
      ? [
          read.items.map(item => item.entry.digest),
          read.conflicts.map(group => group.map(e => e.digest)),
        ]
      : read.kind,
  ]
}

describe('开与关：规矩写着只认整个部署这一层的点', () => {
  it('租户放的条目出局，原因是关着并带规矩里的理由；整个部署这一层的照常', () => {
    const registry = registryOf(
      points({ scopes: CLOSED }),
      ['official', [put('official')]],
      ['plugin:rival', [put('rival', { scope: TENANT })]],
    )
    const answer = ask(registry, 'memory.stores', 'graph', TENANT)
    expect(answer.kind === 'one' && answer.entry.digest).toBe('official')
    expect(answer.kind === 'one' && answer.filtered).toEqual([
      expect.objectContaining({ reason: 'closed', detail: `no-tenant: ${CLOSED.note}` }),
    ])
    expect(report(registry, inst('plugin:rival')).map(one => [one.state, one.detail])).toEqual([
      ['closed', `no-tenant: ${CLOSED.note}`],
    ])
    expect(report(registry, inst('official')).map(one => one.state)).toEqual(['effective'])
  })

  it('不写或写 all 是开：租户的条目照规则算', () => {
    for (const scopes of [undefined, 'all'] as const) {
      const registry = registryOf(
        points({ resolve: 'most-specific', ...(scopes === undefined ? {} : { scopes }) }),
        ['official', [put('official')]],
        ['plugin:mine', [put('mine', { scope: TENANT })]],
      )
      expect(stands(registry, TENANT)).toEqual(['mine', [['mine'], []]])
    }
  })

  it('关着先于锁算：被锁住的键上，租户的条目读到的是关着', () => {
    const registry = registryOf(
      points({ scopes: CLOSED }),
      ['official', [put('official', { lock: true })]],
      ['plugin:rival', [put('rival', { scope: TENANT })]],
    )
    expect(report(registry, inst('plugin:rival')).map(one => one.state)).toEqual(['closed'])
  })

  it('关着先于合不合规矩：内容不合规矩的租户条目也读到关着', () => {
    const registry = registryOf(points({ scopes: CLOSED }), [
      'plugin:odd',
      [put('odd', { scope: TENANT, item: { label: 3 } })],
    ])
    expect(report(registry, inst('plugin:odd')).map(one => one.state)).toEqual(['closed'])
  })

  it('影响里看得见：往关着的点上放一项，影响写关着与理由', () => {
    const before = registryOf(points({ scopes: CLOSED }), ['official', [put('official')]])
    const after = registryOf(
      points({ scopes: CLOSED }),
      ['official', [put('official')]],
      ['plugin:rival', [put('rival', { scope: TENANT })]],
    )
    expect(
      impact(before, after).map(change => [change.before, change.after, change.detail]),
    ).toEqual([['absent', 'closed', `no-tenant: ${CLOSED.note}`]])
  })

  it('树上关着的点标 closed 与理由', () => {
    const registry = registryOf(points({ scopes: CLOSED }))
    expect(find(tree(registry, deployment).root, 'server/memory/memory.stores')?.note).toBe(
      'keyed-one, closed: no-tenant',
    )
  })

  it.each([
    ['only 不是 deployment', { only: 'tenant', why: 'no-tenant', note: 'x' }],
    ['why 不在那五个里', { only: 'deployment', why: 'because', note: 'x' }],
    ['note 是空的', { only: 'deployment', why: 'no-tenant', note: '' }],
    ['写成了别的字', 'none'],
  ])('别的写法的声明不算数：%s', (_name, scopes) => {
    const registry = registryOf(points({ scopes } as unknown as Partial<Contract>))
    expect(standingOf(registry, 'memory.stores', []).kind).toBe('undeclared')
  })
})

describe('DY-17：关着的点上，任取作用域不空的条目加进来或拿走，对任何发问者的答案不变', () => {
  it('随机的登记表、随机开关的点、随机加减的更深层条目', () => {
    const random = randomOf(17)
    const seen = new Set<string>()
    let closedRuns = 0
    let openChanged = 0
    for (let run = 0; run < 3000; run += 1) {
      const closed = random() < 0.5
      const resolve = pick(random, ['conflict', 'most-specific'] as const)
      const arity = pick(random, ['keyed-one', 'keyed-list'] as const)
      const declared = points({ resolve, arity, ...(closed ? { scopes: CLOSED } : {}) })
      const base: Entry[] = []
      const extras: Entry[] = []
      for (let n = 1 + below(random, 6); n > 0; n -= 1) {
        const scope = pick(random, SCOPES)
        const made = put(`e${String(n)}-${String(below(random, 3))}`, {
          scope,
          id: arity === 'keyed-list' ? pick(random, ['', 'a', 'b']) : '',
          ...(random() < 0.2 ? { lock: true as const } : {}),
        })
        ;(scope.length > 0 ? extras : base).push(made)
      }
      const without = registryOf(
        declared,
        ...base.map((each, n) => [`b${String(n)}`, [each]] as const),
      )
      const withThem = registryOf(
        declared,
        ...base.map((each, n) => [`b${String(n)}`, [each]] as const),
        ...extras.map((each, n) => [`x${String(n)}`, [each]] as const),
      )
      seen.add(JSON.stringify([closed, resolve, arity, base, extras]))
      if (!closed) {
        if (
          SCOPES.some(
            asker =>
              JSON.stringify(stands(withThem, asker)) !== JSON.stringify(stands(without, asker)),
          )
        )
          openChanged += 1
        continue
      }
      if (extras.length > 0) closedRuns += 1
      for (const asker of SCOPES) expect(stands(withThem, asker)).toEqual(stands(without, asker))
      extras.forEach((_each, n) =>
        expect(report(withThem, inst(`x${String(n)}`)).map(one => one.state)).toEqual(['closed']),
      )
    }
    console.log(
      `closed property: ${String(seen.size)} distinct inputs of 3000, ${String(closedRuns)} closed with deeper entries, ${String(openChanged)} open runs where they changed the answer`,
    )
    expect(seen.size).toBeGreaterThan(2000)
    expect(closedRuns).toBeGreaterThan(1000)
    expect(openChanged).toBeGreaterThan(300)
  })
})
