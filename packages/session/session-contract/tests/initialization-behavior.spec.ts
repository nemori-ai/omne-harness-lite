import { describe, expect, it } from 'vitest'
import { decide, reduce, type InitializationGuardResult } from '@omne-harness/session-contract'
import {
  adoption,
  evidence,
  creation,
  operationId,
  succeeded,
  refused,
  createMemorySessionEvidenceBridge,
  createMemorySessionTransactions,
  createPolicySessionAccessCheck,
  initializationFixtureGuard,
  pendingReasonsOf,
  testingWorkspace,
} from '@omne-harness/session-contract/testing'
import {
  initializationScenario,
  registrationSource,
  ready,
  failed,
  material,
} from './initialization-scenario.ts'
import { toJsonValue } from '../src/entries.ts'

const execution = {
  kind: 'execution-adoption' as const,
  owner: 'execution',
  item: 'prepare',
  protocol: adoption('type-preparation'),
}
const workspace = {
  kind: 'workspace-load' as const,
  owner: 'workspace',
  item: 'load',
  protocol: adoption('load'),
}
const attached = {
  workspace: testingWorkspace('wsp_c0nf0rmance000000000000000'),
  workspaceAttachment: { instance: 'worker-a', basis: 'revision-1' },
}

describe('trusted initialization admission and atomic creation', () => {
  it('does not equate a candidate, caller JSON or a copied credential with actual adoption', async () => {
    const s = initializationScenario()
    const unconfigured = createMemorySessionTransactions<string>({
      accessCheck: createPolicySessionAccessCheck(() => ({
        kind: 'allowed',
        evidence: evidence('access'),
      })),
    })
    expect(
      refused(
        await unconfigured.commit({
          access: s.access,
          command: s.command,
          guards: [initializationFixtureGuard(s.facts())],
        }),
        'unconfigured',
      ).kind,
    ).toBe('invalid')
    expect(refused(await s.source.prepare(s.command), 'unregistered').kind).toBe('invalid')
    const guards = await s.prepare(s.command)
    expect(
      refused(
        await s.port.commit({
          access: s.access,
          command: s.command,
          guards: structuredClone(guards),
        }),
        'copied',
      ).kind,
    ).toBe('invalid')
    expect(refused(await s.port.readWork(s.access), 'no publication').kind).toBe('denied')
    s.source.controls.available(false)
    expect(
      refused(await s.port.commit({ access: s.access, command: s.command, guards }), 'unavailable')
        .kind,
    ).toBe('unavailable')
    s.source.controls.available(true)
    const bridge = createMemorySessionEvidenceBridge({ initialization: s.source })
    const created = succeeded(
      await s.port.commit({
        access: s.access,
        command: s.command,
        guards: succeeded(await bridge.prepare(s.command), 'bridge'),
      }),
      'create',
    )
    expect(created.state.definition.adopted).toEqual(s.facts().initialAdoption?.adopted)
    expect((await s.history()).map(row => row.kind)).toEqual([
      'session.created',
      'session.adoption',
    ])
    s.source.controls.eligible(false)
    expect(
      refused(
        await s.port.commit({ access: s.access, command: s.command, guards }),
        'revoked retry',
      ).kind,
    ).toBe('denied')
  })

  it('commits two ordered registrations with ready sources in one batch and rebuilds all original facts', async () => {
    const results = [
      ready('context', 'b'),
      ready('workspace', 'load'),
      ready('context', 'a'),
      ready('execution', 'prepare'),
      ready('login', 'account'),
    ]
    const s = initializationScenario({
      ...attached,
      requiredIdentities: [{ capability: 'login', name: 'account' }],
      initialization: {
        sources: [registrationSource('a'), workspace, registrationSource('b'), execution],
        results,
      },
    })
    const ordinary = s.facts(s.command, null, []).plan
    const outcomes = results.map(result => {
      if (result.owner === 'context')
        return s.registration(result.item, result.item === 'a' ? 0 : 1)
      const kind = ordinary.find(
        item => item.owner === result.owner && item.item === result.item,
      )?.kind
      return {
        owner: result.owner,
        item: result.item,
        result,
        consequence:
          kind === 'execution-adoption'
            ? {
                kind: 'execution-ready' as const,
                evidence: evidence(`ready/${result.owner}/${result.item}`),
                adoption: null,
              }
            : {
                kind: kind === 'identity' ? ('identity' as const) : ('workspace-load' as const),
                evidence: evidence(`ready/${result.owner}/${result.item}`),
              },
      }
    })
    await s.create(s.facts(s.command, null, outcomes))
    const state = await s.read()
    expect(state.lifecycle).toBe('dormant')
    expect(state.tasks).toEqual([])
    expect(state.initialization?.plan.map(item => item.item)).toEqual([
      'account',
      'a',
      'load',
      'b',
      'prepare',
    ])
    expect(
      state.initialization?.registrations.map(item => [
        item.decision.key,
        item.decision.basedOn,
        item.decision.revision,
      ]),
    ).toEqual([
      ['block/a', 0, 1],
      ['block/b', 1, 2],
    ])
    const log = await s.history()
    expect(log.map(row => row.kind)).toEqual([
      'session.created',
      'session.adoption',
      'session.initialization-item',
      'session.context-registration-changed',
      'session.initialization-item',
      'session.initialization-item',
      'session.context-registration-changed',
      'session.initialization-item',
      'session.initialization-item',
    ])
    expect(state.initialization?.results.map(item => item.facts)).toEqual([
      [],
      [{ kind: 'batch', ordinal: 3 }],
      [],
      [{ kind: 'batch', ordinal: 6 }],
      [],
    ])
    const rebuilt = reduce(null, { revision: state.revision, entries: log })
    expect(rebuilt).toEqual({ kind: 'reduced', snapshot: state })
    const duplicate = s.complete(ready('context', 'a'), 'different-result-operation')
    const receipt = succeeded(
      await s.port.commit({
        access: s.access,
        command: duplicate,
        guards: await s.prepare(
          duplicate,
          s.facts(duplicate, state, [s.registration('a', 0, state)]),
        ),
      }),
      'recall create result',
    )
    expect(receipt).toMatchObject({
      operation: s.command.input.operation,
      recovered: true,
      first: log[0]?.id,
      last: log.at(-1)?.id,
    })
    expect(receipt).not.toHaveProperty('state')
    expect(await s.history()).toEqual(log)
  })

  it('does not publish a partial initialization batch and recalls a committed lost reply', async () => {
    const s = initializationScenario({
      initialization: { sources: [execution], results: [ready('execution', 'prepare')] },
    })
    const guards = await s.prepare(s.command)
    s.port.controls.failNextInitializationCommit()
    expect(
      refused(
        await s.port.commit({ access: s.access, command: s.command, guards }),
        'failed commit',
      ).kind,
    ).toBe('unavailable')
    expect(refused(await s.port.readWork(s.access), 'absent').kind).toBe('denied')
    expect(s.port.controls.entriesOf(s.access.tenant, s.access.session)).toEqual([])
    s.port.controls.loseNextInitializationReply()
    expect(
      refused(await s.port.commit({ access: s.access, command: s.command, guards }), 'lost reply'),
    ).toEqual({
      kind: 'commit-unknown',
      operation: s.command.input.operation,
    })
    expect((await s.read()).lifecycle).toBe('dormant')
    const state = await s.read()
    const log = await s.history()
    const query = { ...s.access, operation: s.command.input.operation }
    const committed = succeeded(await s.port.queryOperation(query), 'committed create')
    expect(committed.kind).toBe('committed')
    if (committed.kind !== 'committed') throw new Error('the original create was not committed')
    expect(committed.receipt).toMatchObject({
      operation: s.command.input.operation,
      recovered: false,
      first: log[0]?.id,
      last: log.at(-1)?.id,
    })
    const recalled = succeeded(
      await s.port.commit({ access: s.access, command: s.command, guards }),
      'same operation',
    )
    expect(recalled).toEqual({ receipt: { ...committed.receipt, recovered: true }, state })
    expect(await s.history()).toEqual(log)
    expect(succeeded(await s.port.queryOperation(query), 'unchanged original answer')).toEqual(
      committed,
    )
    s.source.controls.eligible(false)
    expect(
      refused(
        await s.port.commit({ access: s.access, command: s.command, guards }),
        'revoked retry',
      ).kind,
    ).toBe('denied')
    expect(await s.history()).toEqual(log)
    s.source.controls.eligible(true)
    const reordered = {
      ...s.command,
      input: {
        ...s.command.input,
        creation: {
          ...s.command.input.creation,
          initialization: {
            sources: [execution, registrationSource('added')],
            results: [ready('execution', 'prepare')],
          },
        },
      },
    }
    expect(
      refused(
        await s.port.commit({
          access: s.access,
          command: reordered,
          guards: await s.prepare(reordered, s.facts(reordered)),
        }),
        'different create input',
      ).kind,
    ).toBe('conflict')
  })
})

describe('persistent source obligations and result identity', () => {
  it.each(['pending', 'failed'] as const)(
    '%s workspace loading refuses clear and replacement without changing facts; original ready permits the change',
    async phase => {
      const s = initializationScenario({
        ...attached,
        initialization: {
          sources: [workspace],
          results: phase === 'failed' ? [failed('workspace', 'load')] : [],
        },
      })
      await s.create()
      const state = await s.read()
      const log = await s.history()
      const readinessCommands = [
        {
          kind: 'startRun' as const,
          input: {
            ...s.base,
            operation: operationId('start'),
            entry: 'interactive' as const,
            candidate: creation().definition.candidate,
            instance: { owner: 'agent' as const, id: 'one' },
          },
        },
        {
          kind: 'freeze' as const,
          input: {
            ...s.base,
            operation: operationId('freeze'),
            verdict: { cause: 'tool-shape-lost' as const, evidence: evidence('freeze') },
          },
        },
      ]
      for (const command of readinessCommands)
        expect(
          refused(await s.port.commit({ access: s.access, command, guards: [] }), 'not ready'),
        ).toEqual({
          kind: 'not-ready',
        })
      const changes = [
        { value: null, workspaceAttachment: null },
        {
          value: testingWorkspace('wsp_abcdefghjkmnpqrstvwxyz2345'),
          workspaceAttachment: { instance: 'worker-b', basis: 'revision-2' },
        },
      ]
      for (const [index, change] of changes.entries()) {
        const command = {
          kind: 'change' as const,
          input: {
            ...s.base,
            operation: operationId(`workspace-change-${index}`),
            declaration: { kind: 'workspace' as const, ...change, basis: evidence('change') },
          },
        }
        expect(
          refused(await s.port.commit({ access: s.access, command, guards: [] }), phase),
        ).toEqual({
          kind: 'invalid',
          field: 'declaration.value',
          reason: 'the original workspace-load item is not ready',
        })
        expect(await s.read()).toEqual(state)
        expect(await s.history()).toEqual(log)
        expect(
          succeeded(
            await s.port.queryOperation({ ...s.access, operation: command.input.operation }),
            'no change receipt',
          ),
        ).toEqual({ kind: 'unknown' })
      }
      succeeded(
        await s.port.commit({
          access: s.access,
          command: {
            kind: 'change',
            input: {
              ...s.base,
              operation: operationId('model-change'),
              declaration: { kind: 'model', name: 'other-model', basis: evidence('model') },
            },
          },
          guards: [],
        }),
        'other dimension',
      )
      const unchangedWorkspace = await s.read()
      expect(unchangedWorkspace.creation.workspace).toEqual(state.creation.workspace)
      expect(unchangedWorkspace.creation.workspaceAttachment).toEqual(
        state.creation.workspaceAttachment,
      )
      expect(unchangedWorkspace.tasks).toEqual(state.tasks)
      const done = s.complete(ready('workspace', 'load'))
      succeeded(
        await s.port.commit({
          access: s.access,
          command: done,
          guards: await s.prepare(done, s.facts(done, unchangedWorkspace)),
        }),
        'original ready',
      )
      for (const [index, change] of changes.entries()) {
        succeeded(
          await s.port.commit({
            access: s.access,
            command: {
              kind: 'change',
              input: {
                ...s.base,
                operation: operationId(`workspace-change-${index}`),
                declaration: { kind: 'workspace', ...change, basis: evidence('change') },
              },
            },
            guards: [],
          }),
          'ready workspace change',
        )
        const changed = await s.read()
        expect(changed.changes?.at(-1)).toEqual({
          kind: 'workspace',
          ...change,
          basis: evidence('change'),
        })
        expect(changed.revisions.workspace).toBe(
          String(BigInt(state.revisions.workspace) + BigInt(index + 1)),
        )
        expect(changed.tasks).toEqual([])
      }
    },
  )

  it('recalls failed workspace results and rejects contradictions after original ready', async () => {
    const s = initializationScenario({
      ...attached,
      initialization: { sources: [workspace], results: [failed('workspace', 'load')] },
    })
    await s.create()
    const state = await s.read()
    expect(state.lifecycle).toBe('initializing')
    expect(pendingReasonsOf(state)).toContain('initialization')
    const retry = s.complete(failed('workspace', 'load'), 'repeat-failed')
    const old = succeeded(
      await s.port.commit({
        access: s.access,
        command: retry,
        guards: await s.prepare(retry, s.facts(retry, state)),
      }),
      'same failure',
    )
    expect(old.operation).toBe(s.command.input.operation)
    const changed = s.complete(failed('workspace', 'load', 'new failure'), 'new-failure')
    succeeded(
      await s.port.commit({
        access: s.access,
        command: changed,
        guards: await s.prepare(changed, s.facts(changed, state)),
      }),
      'new failure',
    )
    const done = s.complete(ready('workspace', 'load'))
    const doneState = await s.read()
    const receipt = succeeded(
      await s.port.commit({
        access: s.access,
        command: done,
        guards: await s.prepare(done, s.facts(done, doneState)),
      }),
      'ready',
    )
    expect((await s.read()).lifecycle).toBe('dormant')
    const same = s.complete(ready('workspace', 'load'), 'new-operation')
    const current = await s.read()
    const repeat = succeeded(
      await s.port.commit({
        access: s.access,
        command: same,
        guards: await s.prepare(same, s.facts(same, current)),
      }),
      'cross operation recall',
    )
    expect(repeat).toEqual({ ...receipt, recovered: true })
    expect(
      decide(current, same, [initializationFixtureGuard(s.facts(same, current))], null, {
        compaction: null,
      }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'unavailable' } })
    const contradicted = s.complete(failed('workspace', 'load'), 'late-failed')
    expect(
      refused(
        await s.port.commit({
          access: s.access,
          command: contradicted,
          guards: await s.prepare(contradicted, s.facts(contradicted, current)),
        }),
        'late failure',
      ).kind,
    ).toBe('conflict')
  })

  it('keeps registration identity stable across failed and ready result operations and refuses stale or changed preparations', async () => {
    const s = initializationScenario({
      initialization: { sources: [registrationSource('a'), registrationSource('b')], results: [] },
    })
    await s.create()
    const initial = await s.read()
    const first = s.complete(ready('context', 'a'))
    const firstOutcome = s.registration('a', 0, initial)
    const guards = await s.prepare(first, s.facts(first, initial, [firstOutcome]))
    succeeded(
      await s.port.commit({ access: s.access, command: first, guards }),
      'first registration',
    )
    const state = await s.read()
    const second = s.complete(ready('context', 'b'))
    expect(
      refused(
        await s.port.commit({
          access: s.access,
          command: second,
          guards: await s.prepare(second, s.facts(second, state, [s.registration('b', 0, state)])),
        }),
        'stale',
      ).kind,
    ).toBe('changed')
    const next = s.registration('b', 1, state)
    succeeded(
      await s.port.commit({
        access: s.access,
        command: second,
        guards: await s.prepare(second, s.facts(second, state, [next])),
      }),
      'second registration',
    )
    expect(
      (await s.read()).initialization?.registrations.map(item => item.decision.commit),
    ).toEqual([
      firstOutcome.consequence?.kind === 'context-registration'
        ? firstOutcome.consequence.decision.commit
        : null,
      next.consequence?.kind === 'context-registration' ? next.consequence.decision.commit : null,
    ])
    expect(
      (await s.read()).initialization?.registrations.map(item => item.decision.revision),
    ).toEqual([1, 2])
  })

  it('records a real additional adoption with complete resident bindings within create', async () => {
    const resident = {
      capability: 'tool.one',
      version: '1',
      shape: toJsonValue({ accepts: 'text' }),
      admitted: evidence('one-admitted'),
    }
    const second = { ...resident, capability: 'tool.two', admitted: evidence('two-admitted') }
    const keys = [
      { capability: resident.capability, key: 'key-one' as never },
      { capability: second.capability, key: 'key-two' as never },
    ]
    const s = initializationScenario({
      residentAdoption: { residents: [resident], keys: keys.slice(0, 1) },
      initialization: { sources: [execution], results: [ready('execution', 'prepare')] },
    })
    const initial = s.facts(s.command, null, [])
    if (initial.initialAdoption === null) throw new Error('adoption missing')
    const { candidate: _candidate, ...adopted } = initial.initialAdoption
    const outcome: InitializationGuardResult = {
      owner: 'execution',
      item: 'prepare',
      result: ready('execution', 'prepare'),
      consequence: {
        kind: 'execution-ready',
        evidence: evidence('ready/execution/prepare'),
        adoption: {
          ...adopted,
          source: evidence('added-source'),
          boundary: evidence('added-boundary'),
          capabilities: material('actual-capabilities-one-and-two'),
          residentBindings: keys,
          newResidents: [second],
        },
      },
    }
    await s.create(s.facts(s.command, null, [outcome]))
    expect((await s.history()).map(row => row.kind)).toEqual([
      'session.created',
      'session.adoption',
      'session.tool-resident-admitted',
      'session.adoption',
      'session.tool-resident-admitted',
      'session.initialization-item',
    ])
    expect((await s.read()).residents?.map(item => item.capability)).toEqual([
      'tool.one',
      'tool.two',
    ])
    expect((await s.read()).residentKeys).toEqual(keys)
  })
})

it('keeps ordinary registration changes legal and refuses only a new ready whose original-scope revision is unprovable', async () => {
  const s = initializationScenario({
    initialization: { sources: [registrationSource('a'), registrationSource('b')], results: [] },
  })
  await s.create()
  const first = s.complete(ready('context', 'a'))
  const initial = await s.read()
  const firstOutcome = s.registration('a', 0, initial)
  const receipt = succeeded(
    await s.port.commit({
      access: s.access,
      command: first,
      guards: await s.prepare(first, s.facts(first, initial, [firstOutcome])),
    }),
    'first result',
  )
  const state = await s.read()
  const next = s.complete(ready('context', 'b'))
  const nextOutcome = s.registration('b', 1, state)
  const ordinary = {
    kind: 'context-registration' as const,
    registration: evidence('ordinary-prepare'),
    ...registrationSource('ordinary').input,
  }
  const unrelated = {
    ...state,
    contextRecords: [
      ...(state.contextRecords ?? []),
      { scope: 'another-scope', declaration: ordinary },
    ],
  }
  expect(
    decide(
      unrelated,
      next,
      [initializationFixtureGuard(s.facts(next, unrelated, [nextOutcome]))],
      null,
      { compaction: null },
    ),
  ).toMatchObject({ kind: 'entries' })
  succeeded(
    await s.port.commit({
      access: s.access,
      command: {
        kind: 'change',
        input: {
          ...s.base,
          operation: operationId('ordinary-registration'),
          declaration: ordinary,
        },
      },
      guards: [],
    }),
    'ordinary registration',
  )
  const changed = await s.read()
  const history = await s.history()
  const recalled = s.complete(ready('context', 'a'), 'recall-after-change')
  expect(
    succeeded(
      await s.port.commit({
        access: s.access,
        command: recalled,
        guards: await s.prepare(recalled, s.facts(recalled, changed, [firstOutcome])),
      }),
      'original receipt',
    ),
  ).toEqual({ ...receipt, recovered: true })
  expect(
    refused(
      await s.port.commit({
        access: s.access,
        command: next,
        guards: await s.prepare(next, s.facts(next, changed, [nextOutcome])),
      }),
      'unknown registration revision',
    ).kind,
  ).toBe('unavailable')
  expect(await s.read()).toEqual(changed)
  expect(await s.history()).toEqual(history)
  expect(
    succeeded(
      await s.port.queryOperation({ ...s.access, operation: next.input.operation }),
      'no published answer',
    ),
  ).toEqual({ kind: 'unknown' })
})
