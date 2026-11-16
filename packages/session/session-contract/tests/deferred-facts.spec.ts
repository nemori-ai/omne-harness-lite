import { describe, expect, it } from 'vitest'
import {
  projectSessionLog,
  type SessionLogObservation,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { open } from './scene.ts'

const control = { through: '0', records: [], settled: [], urgent: [] } as const

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
