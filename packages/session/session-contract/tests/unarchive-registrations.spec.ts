import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { expectedRevision, type SessionCommand } from '@omne-harness/session-contract'
import {
  creation,
  guard,
  operationId,
  ordinaryInput,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { decodeEntry } from '../src/entries.ts'
import { reduce } from '../src/reduce.ts'
import { bornRegistrations } from '../src/scope-registrations.ts'
import { initializationScenario, ready, registrationSource } from './initialization-scenario.ts'

type Scenario = ReturnType<typeof initializationScenario>

async function created(items: readonly string[]): Promise<Scenario> {
  const s = initializationScenario({
    initialization: {
      sources: items.map(registrationSource),
      results: items.map(item => ready('context', item)),
    },
  })
  await s.create(
    s.facts(
      s.command,
      null,
      items.map((item, at) => s.registration(item, at)),
    ),
  )
  return s
}

const control = async (s: Scenario, kind: 'archive' | 'unarchive', name: string) =>
  succeeded(
    await s.port.commit({
      access: s.access,
      command: {
        kind: 'control',
        input: { ...s.base, operation: operationId(name), intent: { kind } },
      },
      guards: [],
    }),
    name,
  )

/** The registrations the log holds for the scope that is open now: block, place and commit. */
async function registered(s: Scenario) {
  const snapshot = await s.read()
  const scope = snapshot.contextScopes?.at(-1)
  if (scope === undefined || scope.ended !== null) throw new Error('no open scope')
  const records = (snapshot.contextRecords ?? []).filter(item => item.scope === scope.scope)
  const born = (snapshot.initialization?.registrations ?? []).filter(
    item => item.decision.scope === scope.scope,
  )
  expect(records.map(item => item.declaration)).toEqual(
    born.map(({ prepared, decision }) => ({
      kind: 'context-registration',
      registration: prepared,
      need: decision.need,
      binding: decision.binding,
      parameters: decision.parameters,
    })),
  )
  return born.map(item => ({
    key: item.decision.key,
    basedOn: item.decision.basedOn,
    commit: item.decision.commit,
  }))
}

describe('a scope minted by an unarchive', () => {
  it('is born, in the same commit, with the registrations the creation recorded', async () => {
    const s = await created(['a', 'b'])
    const first = await registered(s)
    expect(first.map(item => [item.key, item.basedOn])).toEqual([
      ['block/a', 0],
      ['block/b', 1],
    ])

    await control(s, 'archive', 'archive-1')
    const receipt = await control(s, 'unarchive', 'unarchive-1')
    const batch = (await s.history()).filter(row => row.revision === receipt.receipt.revision)
    expect(batch.map(row => row.kind)).toEqual([
      'control.requested',
      'control.progress',
      'session.unarchived',
      'session.context-registration-changed',
      'session.context-registration-changed',
      'session.idle-evidence',
    ])
    const second = await registered(s)
    expect(second.map(item => [item.key, item.basedOn])).toEqual(
      first.map(item => [item.key, item.basedOn]),
    )
    expect(second.map(item => item.commit)).not.toEqual(first.map(item => item.commit))
  })

  it('every later generation has them once, however many times the session was archived', async () => {
    const s = await created(['a', 'b'])
    for (const round of [1, 2, 3]) {
      await control(s, 'archive', `archive-${String(round)}`)
      await control(s, 'unarchive', `unarchive-${String(round)}`)
      expect((await registered(s)).map(item => item.key)).toEqual(['block/a', 'block/b'])
    }
    expect((await s.read()).contextScopes).toHaveLength(4)
  })

  it('a session created with no registration has none to declare again', async () => {
    const s = await created([])
    await control(s, 'archive', 'archive-1')
    await control(s, 'unarchive', 'unarchive-1')
    expect(await registered(s)).toEqual([])
    const { tenant, session } = await s.read()
    const scope = { generation: '2', scope: 'scope-2', operation: operationId('u'), ended: null }
    expect(bornRegistrations({ tenant, session }, scope)).toEqual([])
    expect(bornRegistrations({ tenant, session, contextScopes: [] }, scope)).toEqual([])
  })

  it('a log whose unarchive does not declare exactly those registrations is not taken', async () => {
    const s = await created(['a', 'b'])
    await control(s, 'archive', 'archive-1')
    const archived = await s.read()
    const receipt = await control(s, 'unarchive', 'unarchive-1')
    const revision = receipt.receipt.revision
    const batch = s.port.controls
      .entriesOf(s.access.tenant, s.access.session)
      .filter(row => row.revision === revision)
    const replayed = (entries: typeof batch) => reduce(archived, { revision, entries })
    expect(replayed(batch)).toMatchObject({ kind: 'reduced' })
    const registrations = batch.filter(row => row.kind === 'session.context-registration-changed')
    expect(replayed(batch.filter(row => row !== registrations[1]))).toMatchObject({
      kind: 'quarantined',
      diagnostic: expect.stringContaining(
        'the registrations of an unarchived scope are not those the creation recorded',
      ),
    })
    expect(replayed(batch.filter(row => row.kind !== 'session.unarchived'))).toMatchObject({
      kind: 'quarantined',
      diagnostic: expect.stringContaining(
        'initialization success facts have no corresponding result',
      ),
    })
  })
})

type Step = 'accept' | 'start' | 'refuse' | 'cancel' | 'archive' | 'unarchive'

/** The command a step stands for in the state the session is in; null when it names nothing there. */
async function commandOf(s: Scenario, step: Step, at: number): Promise<SessionCommand | null> {
  const operation = operationId(`${step}-${String(at)}`)
  const snapshot = await s.read()
  const { run } = snapshot
  switch (step) {
    case 'accept':
      return {
        kind: 'accept',
        input: { ...s.base, operation, value: ordinaryInput(`in-${String(at)}`) },
      }
    case 'start':
      return {
        kind: 'startRun',
        input: {
          ...s.base,
          operation,
          entry: 'interactive',
          candidate: creation().definition.candidate,
          instance: { owner: 'agent', id: `instance-${String(at)}` },
        },
      }
    case 'refuse':
      if (run.kind !== 'active') return null
      return {
        kind: 'finishRun',
        input: {
          ...s.base,
          operation,
          run: run.run,
          expected: expectedRevision(snapshot, 'finishRun'),
          bounded: {
            kind: 'drive-refused',
            failure: 'unsupported',
            field: null,
            reason: null,
            inputs: run.initial,
          },
        },
      }
    case 'cancel':
      if (run.kind !== 'active') return null
      return {
        kind: 'control',
        input: {
          ...s.base,
          operation,
          intent: { kind: 'cancel-run', run: run.run, urgency: 'graceful' },
        },
      }
    default:
      return { kind: 'control', input: { ...s.base, operation, intent: { kind: step } } }
  }
}

describe('archive, unarchive, cancel and intake in any order', () => {
  it('never reverse an ended Run, and leave every open scope with the registrations of the session', async () => {
    const steps = fc.constantFrom<Step>(
      'accept',
      'start',
      'refuse',
      'cancel',
      'archive',
      'unarchive',
    )
    await fc.assert(
      fc.asyncProperty(fc.array(steps, { maxLength: 10 }), async sequence => {
        const s = await created(['a', 'b', 'c'])
        for (const [at, step] of sequence.entries()) {
          const command = await commandOf(s, step, at)
          if (command !== null)
            await s.port.commit({
              access: s.access,
              command,
              guards: [guard('login', 'login-entry', 'present')],
            })
          const snapshot = await s.read()
          const scope = snapshot.contextScopes?.at(-1)
          expect(scope?.ended === null).toBe(snapshot.lifecycle !== 'archived')
          if (snapshot.lifecycle !== 'archived')
            expect((await registered(s)).map(item => item.key)).toEqual([
              'block/a',
              'block/b',
              'block/c',
            ])
        }
        const ended = s.port.controls.entriesOf(s.access.tenant, s.access.session).flatMap(row => {
          const entry = decodeEntry(row)
          return 'ok' in entry && entry.ok.kind === 'run.terminal' ? [entry.ok.terminal.run] : []
        })
        expect(new Set(ended).size).toBe(ended.length)
      }),
      { numRuns: 30 },
    )
  }, 60_000)
})
