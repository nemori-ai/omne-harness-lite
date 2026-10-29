import { describe, expect, it } from 'vitest'
import {
  projectSessionLog,
  type SessionLogObservation,
  type RunId,
  type RunTerminal,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  memoryOtherAccess,
  operationId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { open } from './scene.ts'

type Scene = Awaited<ReturnType<typeof open>>

async function cancel(s: Scene, run: RunId) {
  return succeeded(
    await s.commit({
      kind: 'control',
      input: {
        ...s.base,
        operation: operationId(`cancel-${run}`),
        intent: { kind: 'cancel-run', run, urgency: 'force' },
      },
    }),
    'cancel',
  )
}

async function fail(s: Scene, run: RunId) {
  succeeded(
    await s.commit({
      kind: 'finishRun',
      input: {
        ...s.base,
        operation: operationId(`fail-${run}`),
        run,
        expected: (await s.read()).revision,
        bounded: { kind: 'uninterpretable', evidence: evidence('bounded') },
      },
    }),
    'fail',
  )
}

function ended(
  s: Scene,
  original: Awaited<ReturnType<Scene['active']>>,
  outcome: RunTerminal['outcome'] = 'cancelled',
): SessionLogObservation {
  return {
    ...s.base,
    run: original.run.run,
    execution: original.run.execution.execution,
    revision: '5',
    sequence: '1',
    source: evidence('ended'),
    executionEvidence: evidence('ended'),
    consequences: [
      {
        kind: 'waiting',
        waiting: [{ kind: 'dependency', owner: 'fixture-dependency', position: 'before-ended' }],
      },
      { kind: 'ended', outcome, cause: null, disposition: evidence(outcome) },
    ],
  }
}

describe('Agent cancelled requires the original Run cancellation', () => {
  it.each(['active', 'failed', 'successor-active', 'successor-cancelled'] as const)(
    'rejects cancellation without original Session authority when %s',
    async state => {
      const s = await open()
      const original = await s.active()
      if (state !== 'active') await fail(s, original.run.run)
      if (state === 'successor-active' || state === 'successor-cancelled') {
        await s.start('successor')
        if (state === 'successor-cancelled') await cancel(s, (await s.active()).run.run)
      }
      const observation = ended(s, original)
      s.history.observe(observation)
      const before = await s.read()
      const entries = s.port.controls.entriesOf(s.base.tenant, s.base.session)
      const operation = operationId('interpret-cancelled')

      for (let attempt = 0; attempt < 2; attempt++) {
        expect(await s.project(observation, operation)).toEqual({
          failure: {
            kind: 'invalid',
            field: 'outcome',
            reason: 'Agent cancellation requires committed Session cancellation',
          },
        })
        expect(await s.read()).toEqual(before)
        expect(s.port.controls.entriesOf(s.base.tenant, s.base.session)).toEqual(entries)
        expect(succeeded(await s.port.queryOperation({ ...s.access, operation }), 'query')).toEqual(
          {
            kind: 'unknown',
          },
        )
      }
    },
  )

  it.each([
    { successor: false, outcome: 'cancelled' },
    { successor: true, outcome: 'cancelled' },
    { successor: true, outcome: 'completed' },
    { successor: true, outcome: 'failed' },
  ] as const)(
    'recognizes late $outcome with successor=$successor',
    async ({ successor, outcome }) => {
      const s = await open()
      const original = await s.active()
      await cancel(s, original.run.run)
      if (successor) await s.start('successor')
      const before = await s.read()
      const observation = ended(s, original, outcome)
      const operation = operationId('recognize-cancelled')
      const receipt = succeeded(await s.project(observation, operation), 'recognize')
      const after = await s.read()

      expect(after.run).toEqual(before.run)
      expect(after.waiting).toEqual(before.waiting)
      expect(after.executions?.find(item => item.run === original.run.run)).toMatchObject({
        terminal: before.executions?.find(item => item.run === original.run.run)?.terminal,
        execution: { readThrough: '1' },
      })
      const entries = s.port.controls.entriesOf(s.base.tenant, s.base.session)
      expect(succeeded(await s.project(observation, operation), 'repeat')).toEqual({
        ...receipt,
        recovered: true,
      })
      expect(await s.read()).toEqual(after)
      expect(s.port.controls.entriesOf(s.base.tenant, s.base.session)).toEqual(entries)
      expect(projectSessionLog(after, observation)).toEqual({ kind: 'entries', entries: [] })
    },
  )

  it.each(['missing', 'completed', 'failed'] as const)(
    'rejects cancelled against retained original terminal=%s',
    async retained => {
      const s = await open()
      const original = await s.active()
      await cancel(s, original.run.run)
      await s.start('successor')
      const observation = ended(s, original)
      s.history.observe(observation)
      const snapshot = await s.read()
      const material: WorkSnapshot = {
        ...snapshot,
        executions: (snapshot.executions ?? []).map(item =>
          item.run === original.run.run
            ? {
                ...item,
                terminal:
                  retained === 'missing'
                    ? null
                    : { run: item.run, outcome: retained, evidence: evidence(retained) },
              }
            : item,
        ),
      }
      expect(projectSessionLog(material, observation)).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'invalid', field: 'outcome' },
      })
      expect(await s.read()).toEqual(snapshot)
    },
  )

  it('uses the original current terminal when the historical terminal is absent', async () => {
    const s = await open()
    const original = await s.active()
    await cancel(s, original.run.run)
    const observation = ended(s, original)
    s.history.observe(observation)
    const snapshot = await s.read()
    const material: WorkSnapshot = {
      ...snapshot,
      executions: (snapshot.executions ?? []).map(item => ({ ...item, terminal: null })),
    }
    expect(projectSessionLog(material, observation)).toMatchObject({
      kind: 'entries',
      entries: expect.arrayContaining([expect.objectContaining({ kind: 'history.annotated' })]),
    })
  })

  it.each(['current-terminal', 'active-run', 'terminal-run'] as const)(
    'quarantines conflicting cancellation material at %s',
    async conflict => {
      const s = await open()
      const original = await s.active()
      await cancel(s, original.run.run)
      const observation = ended(s, original)
      s.history.observe(observation)
      const snapshot = await s.read()
      let material: WorkSnapshot
      if (conflict === 'current-terminal') {
        material = {
          ...snapshot,
          run: {
            kind: 'terminal',
            terminal: {
              run: original.run.run,
              outcome: 'completed',
              evidence: evidence('complete'),
            },
          },
        }
      } else if (conflict === 'active-run') {
        material = { ...snapshot, run: original.run }
      } else {
        await s.start('successor')
        const successor = await s.active()
        material = {
          ...snapshot,
          executions: (snapshot.executions ?? []).map(item => ({
            ...item,
            terminal: { run: successor.run.run, outcome: 'cancelled', evidence: evidence('wrong') },
          })),
        }
      }
      expect(projectSessionLog(material, observation)).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'quarantined' },
      })
    },
  )

  it('checks tenant and the Run/execution pair before using cancellation evidence', async () => {
    const s = await open()
    const original = await s.active()
    await cancel(s, original.run.run)
    await s.start('successor')
    const successor = await s.active()
    const observation = ended(s, original)
    s.history.observe(observation)
    const snapshot = await s.read()
    const wrongOrigins = [
      { ...observation, tenant: memoryOtherAccess('other').tenant },
      { ...observation, run: successor.run.run },
      { ...observation, execution: successor.run.execution.execution },
    ]
    for (const wrong of wrongOrigins) {
      expect(projectSessionLog(snapshot, wrong)).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'denied' },
      })
    }
    expect(await s.read()).toEqual(snapshot)
  })
})
