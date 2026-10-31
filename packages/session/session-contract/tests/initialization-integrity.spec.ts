import { describe, expect, it } from 'vitest'
import {
  decide,
  reduce,
  INITIALIZATION_PROTOCOL,
  type GuardCommand,
  type InitializationGuardFacts,
  type InitializationGuardResult,
} from '@omne-harness/session-contract'
import {
  adoption,
  evidence,
  operationId,
  memoryOtherAccess,
  succeeded,
  refused,
  initializationFixtureGuard,
} from '@omne-harness/session-contract/testing'
import {
  initializationScenario,
  registrationSource,
  ready,
  rows,
} from './initialization-scenario.ts'
import { fromJsonValue, toJsonValue, SESSION_INTERPRETER } from '../src/entries.ts'

const execution = {
  kind: 'execution-adoption' as const,
  owner: 'execution',
  item: 'prepare',
  protocol: adoption('type-preparation'),
}
const withAdoption = (
  facts: InitializationGuardFacts,
  update: (value: NonNullable<InitializationGuardFacts['initialAdoption']>) => unknown,
) => ({
  ...facts,
  initialAdoption: facts.initialAdoption === null ? null : update(facts.initialAdoption),
})

it.each<readonly [string, (facts: InitializationGuardFacts) => unknown]>([
  ['unknown top-level field', facts => ({ ...facts, extra: true })],
  ['unknown version', facts => ({ ...facts, version: 2 })],
  ['unknown command', facts => ({ ...facts, command: 'ready' })],
  ['another tenant', facts => ({ ...facts, binding: { ...facts.binding, tenant: 'other' } })],
  ['another session', facts => ({ ...facts, binding: { ...facts.binding, session: 'other' } })],
  ['another operation', facts => ({ ...facts, binding: { ...facts.binding, operation: 'other' } })],
  [
    'another create operation',
    facts => ({ ...facts, binding: { ...facts.binding, createOperation: 'other' } }),
  ],
  ['different full input', facts => ({ ...facts, input: toJsonValue({ changed: true }) })],
  ['missing initial adoption', facts => ({ ...facts, initialAdoption: null })],
  ['missing requirements', facts => ({ ...facts, requirements: null })],
  [
    'unplanned requirement',
    facts => ({
      ...facts,
      requirements: [
        {
          kind: 'identity',
          key: 'missing',
          requirement: evidence('missing'),
          resolution: { kind: 'planned', owner: 'no', item: 'no' },
        },
      ],
    }),
  ],
  [
    'unknown requirement kind',
    facts => ({
      ...facts,
      requirements: [
        {
          kind: 'ambient',
          key: 'missing',
          requirement: evidence('missing'),
          resolution: { kind: 'satisfied', evidence: evidence('missing') },
        },
      ],
    }),
  ],
  [
    'different definition version',
    facts =>
      withAdoption(facts, value => ({
        ...value,
        adopted: { ...value.adopted, revision: 'other' },
      })),
  ],
  [
    'missing capability material',
    facts => withAdoption(facts, value => ({ ...value, capabilities: null })),
  ],
  [
    'string capabilities',
    facts => withAdoption(facts, value => ({ ...value, capabilities: ['not-material'] })),
  ],
  [
    'unknown nested material field',
    facts =>
      withAdoption(facts, value => ({
        ...value,
        capabilities: { ...value.capabilities, extra: true },
      })),
  ],
  [
    'empty evidence',
    facts => withAdoption(facts, value => ({ ...value, source: { ...value.source, digest: '' } })),
  ],
  [
    'unknown evidence field',
    facts =>
      withAdoption(facts, value => ({ ...value, boundary: { ...value.boundary, extra: true } })),
  ],
  [
    'different original item protocol',
    facts => ({
      ...facts,
      plan: facts.plan.map(item => ({ ...item, protocol: adoption('another') })),
    }),
  ],
  [
    'different original item input',
    facts => ({
      ...facts,
      plan: facts.plan.map(item => ({ ...item, originalInput: toJsonValue('another') })),
    }),
  ],
  ['duplicate plan item', facts => ({ ...facts, plan: [...facts.plan, ...facts.plan] })],
  ['duplicate result', facts => ({ ...facts, results: [...facts.results, ...facts.results] })],
  [
    'missing consequence',
    facts => ({
      ...facts,
      results: facts.results.map(result => ({ ...result, consequence: null })),
    }),
  ],
  [
    'different consequence evidence',
    facts => ({
      ...facts,
      results: facts.results.map(result => ({
        ...result,
        consequence: { kind: 'execution-ready', evidence: evidence('another'), adoption: null },
      })),
    }),
  ],
  [
    'unknown consequence field',
    facts => ({
      ...facts,
      results: facts.results.map(result => ({
        ...result,
        consequence: { ...result.consequence, extra: true },
      })),
    }),
  ],
  [
    'different result identity',
    facts => ({ ...facts, results: facts.results.map(result => ({ ...result, owner: 'other' })) }),
  ],
])('rejects %s without a candidate state or batch', (_name, edit) => {
  const s = initializationScenario({
    initialization: { sources: [execution], results: [ready('execution', 'prepare')] },
  })
  const guard: GuardCommand = {
    owner: 'session-initialization',
    participant: 'session-evidence',
    protocol: INITIALIZATION_PROTOCOL,
    facts: toJsonValue(edit(s.facts())),
  }
  expect(decide(null, s.command, [guard], null, { compaction: null })).toMatchObject({
    kind: 'rejected',
    failure: { kind: 'invalid' },
  })
})

it.each(['owner', 'name', 'revision', 'digest'] as const)(
  'requires the exact registered protocol %s',
  key => {
    const s = initializationScenario()
    const guard = initializationFixtureGuard(s.facts())
    expect(
      decide(
        null,
        s.command,
        [{ ...guard, protocol: { ...guard.protocol, [key]: 'other' } }],
        null,
        { compaction: null },
      ),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid' } })
  },
)

it('checks current ownership before disclosing results and rejects guard reuse for another full input', async () => {
  const s = initializationScenario({ initialization: { sources: [execution], results: [] } })
  await s.create()
  const state = await s.read()
  const command = s.complete(ready('execution', 'prepare'))
  const guards = await s.prepare(command, s.facts(command, state))
  succeeded(await s.port.commit({ access: s.access, command, guards }), 'ready')
  const other = memoryOtherAccess('other')
  const foreign = { ...command, input: { ...command.input, tenant: other.tenant } }
  expect(
    refused(await s.port.commit({ access: s.access, command: foreign, guards }), 'foreign').kind,
  ).toBe('denied')
  expect(decide(await s.read(), foreign, guards, null, { compaction: null })).toMatchObject({
    kind: 'rejected',
    failure: { kind: 'denied' },
  })
  const changed = { ...command, input: { ...command.input, operation: operationId('other') } }
  expect(
    refused(
      await s.port.commit({ access: s.access, command: changed, guards }),
      'rebound credential',
    ).kind,
  ).toBe('invalid')
  s.source.controls.eligible(false)
  expect(
    refused(await s.port.commit({ access: s.access, command, guards }), 'revoked recall').kind,
  ).toBe('denied')
})

it('rejects duplicate registration identities, wrong scope, changed input, unsafe revisions and post-prepare edits', async () => {
  const s = initializationScenario({
    initialization: {
      sources: [registrationSource('a'), registrationSource('b')],
      results: [ready('context', 'a'), ready('context', 'b')],
    },
  })
  const a = s.registration('a', 0)
  const b = s.registration('b', 1)
  if (
    a.consequence?.kind !== 'context-registration' ||
    b.consequence?.kind !== 'context-registration'
  )
    throw new Error('registration fixture missing')
  const second = b.consequence
  for (const changed of [
    { key: a.consequence.decision.key },
    { scope: 'foreign-scope' },
    { tenant: 'foreign-tenant' },
    { commit: 'different-commit' },
    { need: { ...second.decision.need, value: toJsonValue('other') } },
    { basedOn: 0, revision: 1 },
    { basedOn: Number.MAX_SAFE_INTEGER, revision: Number.MAX_SAFE_INTEGER + 1 },
    { creating: false },
    { required: false },
  ]) {
    const bad = {
      ...b,
      consequence: { ...second, decision: { ...second.decision, ...changed } },
    } as InitializationGuardResult
    const decision = decide(
      null,
      s.command,
      [initializationFixtureGuard(s.facts(s.command, null, [a, bad]))],
      null,
      { compaction: null },
    )
    expect(decision).toMatchObject({ kind: 'rejected' })
  }
  const guards = await s.prepare(s.command, s.facts(s.command, null, [a, b]))
  const guard = guards[0]
  if (guard === undefined) throw new Error('missing prepared guard')
  Object.assign(guard, { facts: toJsonValue(s.facts(s.command, null, [b, a])) })
  expect(
    refused(
      await s.port.commit({ access: s.access, command: s.command, guards }),
      'edited after prepare',
    ).kind,
  ).toBe('invalid')
  expect(refused(await s.port.readWork(s.access), 'no partial state').kind).toBe('denied')
})

it('treats source and result reordering as changed creation input, not same-operation retry', async () => {
  const s = initializationScenario({
    initialization: {
      sources: [
        execution,
        {
          ...execution,
          kind: 'context-registration',
          item: 'register',
          input: registrationSource('register').input,
        },
      ],
      results: [ready('execution', 'prepare')],
    },
  })
  await s.create()
  const original = s.command.input.creation.initialization
  if (original === undefined) throw new Error('missing sources')
  const changed = {
    ...s.command,
    input: {
      ...s.command.input,
      creation: {
        ...s.command.input.creation,
        initialization: { ...original, sources: [...original.sources].reverse() },
      },
    },
  }
  expect(
    refused(
      await s.port.commit({
        access: s.access,
        command: changed,
        guards: await s.prepare(changed, s.facts(changed)),
      }),
      'source reorder',
    ).kind,
  ).toBe('conflict')
})

describe('exact interpreter and replay evidence', () => {
  const batch = () => {
    const s = initializationScenario({
      initialization: { sources: [registrationSource('a')], results: [ready('context', 'a')] },
    })
    return rows(s.command, s.facts(s.command, null, [s.registration('a', 0)]))
  }
  it('replays an identical batch and rejects same-revision edited facts', () => {
    const original = batch()
    const result = reduce(null, original)
    if (result.kind !== 'reduced') throw new Error(result.diagnostic)
    expect(reduce(result.snapshot, original)).toEqual(result)
    const changed = {
      ...original,
      entries: original.entries.map((row, index) =>
        index === 0
          ? { ...row, origin: { ...row.origin, source: evidence('tampered-origin') } }
          : row,
      ),
    }
    expect(reduce(result.snapshot, changed)).toMatchObject({ kind: 'quarantined' })
  })
  it.each([
    'missing adoption',
    'missing registration',
    'wrong ordinal',
    'changed registration',
    'wrong plan',
    'mixed schema',
    'wrong revision metadata',
  ])('quarantines %s before exposing partial initialization', scenario => {
    const original = batch()
    const entries = original.entries.flatMap(row => {
      if (scenario === 'missing adoption' && row.kind === 'session.adoption') return []
      if (
        scenario === 'missing registration' &&
        row.kind === 'session.context-registration-changed'
      )
        return []
      if (scenario === 'mixed schema' && row.kind === 'session.initialization-item')
        return [{ ...row, schema: { ...SESSION_INTERPRETER, digest: 'sha256:other' } }]
      if (scenario === 'wrong revision metadata' && row.kind === 'session.initialization-item')
        return [{ ...row, revision: '9' as typeof row.revision }]
      const value = fromJsonValue(row.payload)
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('not an entry')
      if (scenario === 'wrong ordinal' && row.kind === 'session.initialization-item')
        return [
          { ...row, payload: toJsonValue({ ...value, facts: [{ kind: 'batch', ordinal: 1 }] }) },
        ]
      if (
        scenario === 'changed registration' &&
        row.kind === 'session.context-registration-changed'
      )
        return [{ ...row, payload: toJsonValue({ ...value, scope: 'another' }) }]
      if (scenario === 'wrong plan' && row.kind === 'session.created')
        return [{ ...row, payload: toJsonValue({ ...value, plan: [] }) }]
      return [row]
    })
    expect(reduce(null, { ...original, entries })).toMatchObject({ kind: 'quarantined' })
  })
  it('reports revision 2 as unsupported adoption, without judging missing new fields as malformed', () => {
    const original = batch()
    const v2 = {
      ...original,
      entries: original.entries.map(row => ({
        ...row,
        schema: { ...row.schema, revision: '2', digest: 'sha256:old-release' },
      })),
    }
    const result = reduce(null, v2)
    expect(result).toMatchObject({
      kind: 'quarantined',
      diagnostic: expect.stringContaining('unsupported interpreter'),
    })
    if (result.kind === 'quarantined') expect(result.diagnostic).not.toContain('malformed')
  })
})

it('ignores object field order while preserving the ordered creation results', async () => {
  const results = [ready('login', 'one'), ready('login', 'two')]
  const s = initializationScenario({
    requiredIdentities: [
      { capability: 'login', name: 'one' },
      { capability: 'login', name: 'two' },
    ],
    initialization: { sources: [], results },
  })
  await s.create()
  const reorderedFields = {
    ...s.command,
    input: {
      ...s.command.input,
      creation: Object.fromEntries(
        Object.entries(s.command.input.creation).reverse(),
      ) as typeof s.command.input.creation,
    },
  }
  const same = succeeded(
    await s.port.commit({
      access: s.access,
      command: reorderedFields,
      guards: succeeded(await s.source.prepare(reorderedFields), 'same source'),
    }),
    'same fields',
  )
  expect(same.receipt.recovered).toBe(true)
  const reorderedResults = {
    ...s.command,
    input: {
      ...s.command.input,
      creation: {
        ...s.command.input.creation,
        initialization: { sources: [], results: [...results].reverse() },
      },
    },
  }
  expect(
    refused(
      await s.port.commit({
        access: s.access,
        command: reorderedResults,
        guards: await s.prepare(reorderedResults, s.facts(reorderedResults)),
      }),
      'result reorder',
    ).kind,
  ).toBe('conflict')
})

it('publishes completion facts, result index and operation answer together after retry', async () => {
  const s = initializationScenario({
    initialization: { sources: [registrationSource('a')], results: [] },
  })
  await s.create()
  const state = await s.read()
  const log = await s.history()
  const command = s.complete(ready('context', 'a'))
  const guards = await s.prepare(command, s.facts(command, state, [s.registration('a', 0, state)]))
  s.port.controls.failNextInitializationCommit()
  expect(
    refused(await s.port.commit({ access: s.access, command, guards }), 'before publication').kind,
  ).toBe('unavailable')
  expect(await s.history()).toEqual(log)
  expect(await s.read()).toEqual(state)
  const query = { ...s.access, operation: command.input.operation }
  expect(succeeded(await s.port.queryOperation(query), 'unpublished operation')).toEqual({
    kind: 'unknown',
  })
  s.port.controls.loseNextInitializationReply()
  expect(
    refused(await s.port.commit({ access: s.access, command, guards }), 'after publication'),
  ).toEqual({
    kind: 'commit-unknown',
    operation: command.input.operation,
  })
  expect((await s.read()).initialization?.registrations).toHaveLength(1)
  const current = await s.history()
  expect(current.slice(log.length).map(row => row.kind)).toEqual([
    'session.context-registration-changed',
    'session.initialization-item',
  ])
  const committed = succeeded(await s.port.queryOperation(query), 'committed completion')
  expect(committed.kind).toBe('committed')
  if (committed.kind !== 'committed') throw new Error('the original completion was not committed')
  expect(committed.receipt).toMatchObject({
    operation: command.input.operation,
    recovered: false,
    first: current[log.length]?.id,
    last: current.at(-1)?.id,
  })
  const completed = await s.read()
  expect(
    succeeded(await s.port.commit({ access: s.access, command, guards }), 'same-operation recall'),
  ).toEqual({
    ...committed.receipt,
    recovered: true,
  })
  expect(await s.history()).toEqual(current)
  expect(await s.read()).toEqual(completed)
  expect(succeeded(await s.port.queryOperation(query), 'unchanged original answer')).toEqual(
    committed,
  )
  s.source.controls.eligible(false)
  expect(
    refused(await s.port.commit({ access: s.access, command, guards }), 'revoked retry').kind,
  ).toBe('denied')
  expect(await s.history()).toEqual(current)
})

it('reports absent or conflicting version metadata as missing interpretation basis', () => {
  const s = initializationScenario()
  const batch = rows(s.command, s.facts())
  const missing = {
    ...batch,
    entries: batch.entries.map((row, index) =>
      index === 0 ? { ...row, schema: undefined as never } : row,
    ),
  }
  const conflicting = {
    ...batch,
    entries: batch.entries.map((row, index) =>
      index === 0 ? { ...row, schema: { ...row.schema, revision: '2' } } : row,
    ),
  }
  for (const invalid of [missing, conflicting])
    expect(reduce(null, invalid)).toMatchObject({
      kind: 'quarantined',
      diagnostic: expect.stringContaining('missing interpretation basis'),
    })
})

it('does not count a repeated resident definition as new actual adoption', () => {
  const resident = {
    capability: 'tool.one',
    version: '1',
    shape: toJsonValue('shape'),
    admitted: evidence('first'),
  }
  const key = { capability: resident.capability, key: 'key-one' as never }
  const s = initializationScenario({
    residentAdoption: { residents: [resident], keys: [key] },
    initialization: { sources: [execution], results: [ready('execution', 'prepare')] },
  })
  const facts = s.facts(s.command, null, [])
  if (facts.initialAdoption === null) throw new Error('missing initial adoption')
  const { candidate: _candidate, ...initial } = facts.initialAdoption
  const outcome: InitializationGuardResult = {
    owner: 'execution',
    item: 'prepare',
    result: ready('execution', 'prepare'),
    consequence: {
      kind: 'execution-ready',
      evidence: evidence('ready/execution/prepare'),
      adoption: { ...initial, newResidents: [resident] },
    },
  }
  expect(
    decide(
      null,
      s.command,
      [initializationFixtureGuard(s.facts(s.command, null, [outcome]))],
      null,
      { compaction: null },
    ),
  ).toMatchObject({ kind: 'rejected', failure: { kind: 'invalid' } })
})
