// The two rules of `validateObservation` that keep a control event a deferred fact: the
// consequences of a deferred fact are Session's to decide, so an observation that carries them is
// invalid; and control evidence belongs to a deferred fact only, so an observation of any other
// fact that carries it is invalid. Each is reached through `projectSessionLog` on a snapshot whose
// history index holds the fact. The memory history fixture only writes facts from consequences, so
// the deferred shape is set on the snapshot's index here, the way the production Journal writes it.
import { describe, expect, it } from 'vitest'
import {
  projectSessionLog,
  type SessionLogObservation,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { open } from './scene.ts'

const control = { through: '0', records: [], settled: [], urgent: [] } as const

/** An observation of event 1 of the active execution, a wait, with the head the fact row names. */
async function waiting() {
  const s = await open()
  const { run } = await s.active()
  const observation: SessionLogObservation = {
    ...s.base,
    run: run.run,
    execution: run.execution.execution,
    revision: '1',
    sequence: '1',
    source: evidence('waiting-event'),
    executionEvidence: evidence('waiting-head'),
    consequences: [
      {
        kind: 'waiting',
        waiting: [{ kind: 'dependency', owner: 'fixture-dependency', position: 'before-control' }],
      },
    ],
  }
  s.history.observe(observation)
  return { observation, snapshot: await s.read() }
}

/** The snapshot with every fact row of its history index marked deferred. */
function deferred(snapshot: WorkSnapshot): WorkSnapshot {
  const index = snapshot.historyIndex
  if (index === undefined) throw new Error('fixture: the snapshot holds a history index')
  return {
    ...snapshot,
    historyIndex: {
      ...index,
      executions: index.executions.map(item => ({
        ...item,
        facts: item.facts.map(fact => ({ ...fact, kinds: ['deferred'] })),
      })),
    },
  }
}

describe('a control event is a deferred fact', () => {
  it('a deferred fact with consequences in the observation is invalid: Session decides them', async () => {
    const { observation, snapshot } = await waiting()
    expect(projectSessionLog(deferred(snapshot), { ...observation, control })).toMatchObject({
      kind: 'rejected',
      failure: {
        kind: 'invalid',
        field: 'consequences',
        reason: 'Session decides the consequences of a deferred control fact',
      },
    })
  })

  it('control evidence on a fact that is not deferred is invalid', async () => {
    const { observation, snapshot } = await waiting()
    expect(projectSessionLog(snapshot, observation)).toMatchObject({ kind: 'entries' })
    expect(projectSessionLog(snapshot, { ...observation, control })).toMatchObject({
      kind: 'rejected',
      failure: {
        kind: 'invalid',
        field: 'control',
        reason: 'the original fact is not a deferred control fact',
      },
    })
  })
})
