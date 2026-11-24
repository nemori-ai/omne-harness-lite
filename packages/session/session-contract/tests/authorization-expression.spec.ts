import { describe, expect, it } from 'vitest'
import {
  EMPTY_AUTHORIZATIONS,
  decide,
  onceAuthorizationOf,
  reduce,
  reduceAuthorizations,
  retireOnce,
  type AuthorizationExpression,
  type CommittedBatch,
  type Decision,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { initializationScenario } from './initialization-scenario.ts'

const consumer = {
  owner: '@omne-harness/agent',
  work: 'run_1/execution',
  position: 'step-1/tool/0',
}
const once = (
  overrides: Partial<Extract<AuthorizationExpression['scope'], { kind: 'once' }>> = {},
  direction: AuthorizationExpression['direction'] = 'grant',
): AuthorizationExpression => ({
  scope: {
    kind: 'once',
    consumer,
    target: 'Shell#1',
    argumentsDigest: 'sha256:args',
    ...overrides,
  },
  direction,
  source: evidence('card-decision'),
})
const session = (gate: string, basis: string, direction: 'grant' | 'revoke' = 'grant') =>
  ({
    scope: { kind: 'session', capabilityId: gate, enforcementKey: 'tool.invoke', basis },
    direction,
    source: evidence(`card-decision/${gate}`),
  }) as const

const sessionWith = (
  blank: Partial<Record<'capabilityId' | 'enforcementKey' | 'basis', string>>,
) => {
  const whole = session('Shell', 'rev-1')
  return { ...whole, scope: { ...whole.scope, ...blank } }
}

function expressing(snapshot: WorkSnapshot, expression: AuthorizationExpression, name = 'grant') {
  return {
    kind: 'change',
    input: {
      tenant: snapshot.tenant,
      session: snapshot.session,
      operation: operationId(name),
      declaration: {
        kind: 'authorization-expression',
        expression,
        authorization: evidence('authorization-expression-policy'),
      },
    },
  } satisfies SessionCommand
}

function committed(snapshot: WorkSnapshot, decision: Decision): WorkSnapshot {
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const revision = String(BigInt(snapshot.revision) + 1n) as CommittedBatch['revision']
  const result = reduce(snapshot, {
    revision,
    entries: decision.entries.map((entry, index) => ({
      ...entry,
      revision,
      id: `${revision}/${index}` as CommittedBatch['entries'][number]['id'],
    })),
  })
  if (result.kind !== 'reduced') throw new Error(result.diagnostic)
  return result.snapshot
}

const reads = { compaction: null } as const

describe('an authorization expression in the session log', () => {
  it('is kept as its own entry and does not move the permission revision', () => {
    const before = initializationScenario().preview()
    const decision = decide(before, expressing(before, once()), [], null, reads)
    expect(decision).toMatchObject({
      kind: 'entries',
      entries: [{ kind: 'session.authorization-expressed' }],
    })
    const after = committed(before, decision)
    expect(after.permissions.revision).toBe(before.permissions.revision)
    expect(after.revision).not.toBe(before.revision)
  })

  it('is reduced into the authorizations the session holds now, each change moving their revision', () => {
    const before = initializationScenario().preview()
    expect(before.authorizations).toEqual(EMPTY_AUTHORIZATIONS)
    const granted = committed(before, decide(before, expressing(before, once()), [], null, reads))
    expect(granted.authorizations).toMatchObject({ revision: '1', once: [{ consumer }] })
    const both = committed(
      granted,
      decide(
        granted,
        expressing(granted, session('Shell', 'rev-1'), 'for-session'),
        [],
        null,
        reads,
      ),
    )
    expect(both.authorizations).toMatchObject({
      revision: '2',
      once: [{ consumer }],
      session: [{ capabilityId: 'Shell', basis: 'rev-1' }],
    })
  })

  it.each([
    ['a direction that is neither grant nor revoke', { ...once(), direction: 'lend' }, 'direction'],
    ['a session scope with no capability', sessionWith({ capabilityId: '' }), 'scope'],
    ['a session scope with no gate key', sessionWith({ enforcementKey: '' }), 'scope'],
    ['a session scope with no basis', sessionWith({ basis: '' }), 'scope'],
    [
      'a once scope whose consumer has no work',
      once({ consumer: { ...consumer, work: '' } }),
      'scope',
    ],
    ['a once scope whose digest is not text', once({ argumentsDigest: 7 as never }), 'scope'],
  ] as const)('is refused with %s', (_what, expression, field) => {
    const before = initializationScenario().preview()
    const decision = decide(before, expressing(before, expression as never), [], null, reads)
    expect(decision).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: `declaration.expression.${field}` },
    })
  })

  it('takes a revoke as it takes a grant', () => {
    const before = initializationScenario().preview()
    const revoke = expressing(before, session('Shell', 'rev-1', 'revoke'))
    expect(decide(before, revoke, [], null, reads)).toMatchObject({ kind: 'entries' })
  })

  it('is refused when the qualification it stands on is incomplete', () => {
    const before = initializationScenario().preview()
    const command = expressing(before, once())
    const blank = { ...evidence('authorization-expression-policy'), record: '' }
    const unqualified = {
      ...command,
      input: {
        ...command.input,
        declaration: { ...command.input.declaration, authorization: blank },
      },
    }
    expect(decide(before, unqualified as never, [], null, reads)).toMatchObject({
      kind: 'rejected',
    })
  })

  it('is refused when its scope or source is incomplete', () => {
    const before = initializationScenario().preview()
    const blankTarget = expressing(before, once({ target: '' }))
    const blankSource = expressing(before, { ...once(), source: { ...evidence('x'), digest: '' } })
    expect(decide(before, blankTarget, [], null, reads)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'declaration.expression.scope' },
    })
    expect(decide(before, blankSource, [], null, reads)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'declaration.expression.source' },
    })
  })
})

describe('the session authorization context', () => {
  it('holds a once authorization for exactly the action it names', () => {
    const context = reduceAuthorizations(EMPTY_AUTHORIZATIONS, once())
    expect(onceAuthorizationOf(context, consumer)).toEqual({
      consumer,
      target: 'Shell#1',
      argumentsDigest: 'sha256:args',
      source: evidence('card-decision'),
    })
    expect(onceAuthorizationOf(context, { ...consumer, position: 'step-1/tool/1' })).toBeUndefined()
    expect(context.revision).toBe('1')
  })

  it('removes a once authorization on revoke and keeps the others', () => {
    const other = { ...consumer, position: 'step-1/tool/1' }
    const both = reduceAuthorizations(
      reduceAuthorizations(EMPTY_AUTHORIZATIONS, once()),
      once({ consumer: other }),
    )
    const revoked = reduceAuthorizations(both, once({}, 'revoke'))
    expect(onceAuthorizationOf(revoked, consumer)).toBeUndefined()
    expect(onceAuthorizationOf(revoked, other)).toBeDefined()
    expect(revoked.revision).toBe('3')
  })

  it('keeps one session authorization per gate, the latest given', () => {
    const first = reduceAuthorizations(EMPTY_AUTHORIZATIONS, session('Shell', 'rev-1'))
    const replaced = reduceAuthorizations(first, session('Shell', 'rev-2'))
    const another = reduceAuthorizations(replaced, session('Files', 'rev-2'))
    expect(another.session.map(item => [item.capabilityId, item.basis])).toEqual([
      ['Shell', 'rev-2'],
      ['Files', 'rev-2'],
    ])
    expect(reduceAuthorizations(another, session('Shell', 'rev-2', 'revoke')).session).toEqual([
      {
        capabilityId: 'Files',
        enforcementKey: 'tool.invoke',
        basis: 'rev-2',
        source: evidence('card-decision/Files'),
      },
    ])
  })

  it.each([
    ['owner', { ...consumer, owner: '@omne-harness/tool' }],
    ['work', { ...consumer, work: 'run_2/execution' }],
    ['position', { ...consumer, position: 'step-1/tool/1' }],
  ] as const)('tells two consumers apart by their %s alone', (_field, other) => {
    const both = [once(), once({ consumer: other, target: 'Files#1' })].reduce(
      reduceAuthorizations,
      EMPTY_AUTHORIZATIONS,
    )
    expect(both.once).toHaveLength(2)
    expect(onceAuthorizationOf(both, consumer)?.target).toBe('Shell#1')
    expect(onceAuthorizationOf(both, other)?.target).toBe('Files#1')
    expect(reduceAuthorizations(both, once({ consumer: other }, 'revoke')).once).toEqual([
      expect.objectContaining({ consumer }),
    ])
  })

  it('keeps the session authorizations of two gates of one capability apart', () => {
    const invoke = session('Shell', 'rev-1')
    const other = {
      ...invoke,
      scope: { ...invoke.scope, enforcementKey: 'tool.other' },
    } as const
    const both = [invoke, other].reduce(reduceAuthorizations, EMPTY_AUTHORIZATIONS)
    expect(both.session.map(item => item.enforcementKey)).toEqual(['tool.invoke', 'tool.other'])
  })

  it('lets go of every once authorization when the Run ends, and keeps the session ones', () => {
    const other = { ...consumer, position: 'step-1/tool/1' }
    const context = [once(), once({ consumer: other }), session('Shell', 'rev-1')].reduce(
      reduceAuthorizations,
      EMPTY_AUTHORIZATIONS,
    )
    const ended = retireOnce(context)
    expect(ended).toMatchObject({ revision: '4', once: [], session: [{ capabilityId: 'Shell' }] })
    expect(retireOnce(ended)).toBe(ended)
  })
})
