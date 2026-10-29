import { describe, expect, it } from 'vitest'
import { scene, open } from './scene.ts'
import type { SessionCommand } from '@omne-harness/session-contract'
import {
  projectSessionLog,
  type SessionLogConsequence,
  type ResidentKey,
  type BatchId,
} from '@omne-harness/session-contract'
import {
  creation,
  operationId,
  evidence,
  inputId,
  succeeded,
  refused,
} from '@omne-harness/session-contract/testing'

describe('Session governance beyond the first path', () => {
  it('release and claim retain Run/execution while reload replaces adoption and fences old advance', async () => {
    const s = await open()
    const first = await s.active()
    succeeded(
      await s.commit({
        kind: 'release',
        input: {
          ...s.base,
          operation: operationId('release'),
          advance: first.advance,
          expected: first.snapshot.revision,
          handover: evidence('detach'),
        },
      }),
      'release',
    )
    expect((await s.read()).run).toMatchObject({ kind: 'active', advance: null })
    succeeded(
      await s.commit({
        kind: 'claim',
        input: {
          ...s.base,
          operation: operationId('claim'),
          run: first.run.run,
          instance: { owner: 'agent', id: 'recovery' },
          continuity: evidence('continuity'),
        },
      }),
      'claim',
    )
    const second = await s.active()
    expect(second.run.execution.execution).toBe(first.run.execution.execution)
    expect(second.run.ordinal).toBe('2')
    succeeded(
      await s.commit({
        kind: 'reload',
        input: {
          ...s.base,
          operation: operationId('reload'),
          run: first.run.run,
          expected: second.snapshot.revision,
          instance: { owner: 'agent', id: 'reload' },
          candidate: { ...first.run.adoption, revision: '2' },
          handover: evidence('handover'),
        },
      }),
      'reload',
    )
    expect((await s.active()).run).toMatchObject({ ordinal: '3', adoption: { revision: '2' } })
    expect(
      refused(
        await s.commit({
          kind: 'release',
          input: {
            ...s.base,
            operation: operationId('stale-release'),
            advance: first.advance,
            expected: (await s.read()).revision,
            handover: evidence('old'),
          },
        }),
        'stale',
      ).kind,
    ).toBe('stale-advance')
  })
  it('freeze clears idle pending but keeps active inputs and claim until terminal cleanup', async () => {
    const idle = scene()
    await idle.create()
    await idle.accept('first')
    const freeze = {
      kind: 'freeze',
      input: {
        ...idle.base,
        operation: operationId('freeze'),
        verdict: { cause: 'tool-shape-lost', evidence: evidence('lost') },
      },
    } satisfies SessionCommand
    const first = succeeded(await idle.commit(freeze), 'freeze')
    expect((await idle.read()).pending).toEqual([])
    const again = succeeded(
      await idle.commit({
        ...freeze,
        input: { ...freeze.input, operation: operationId('freeze-again') },
      }),
      'freeze again',
    )
    expect(again).toMatchObject({ ...first, recovered: true })
    const s = await open()
    const before = await s.active()
    succeeded(await s.commit({ ...freeze, input: { ...freeze.input, ...s.base } }), 'active freeze')
    await s.accept('second')
    succeeded(
      await s.commit({
        kind: 'claim',
        input: {
          ...s.base,
          operation: operationId('claim-frozen'),
          run: before.run.run,
          instance: { owner: 'agent', id: 'recovery' },
          continuity: evidence('continuity'),
        },
      }),
      'frozen claim',
    )
    succeeded(
      await s.commit({
        kind: 'finishRun',
        input: {
          ...s.base,
          operation: operationId('finish'),
          run: before.run.run,
          expected: (await s.read()).revision,
          bounded: { kind: 'uninterpretable', evidence: evidence('bounded') },
        },
      }),
      'finish',
    )
    expect(await s.read()).toMatchObject({ lifecycle: 'frozen', pending: [], handed: [] })
  })
  it('completed comes from the separate log interpretation commit, and old conclusions leave the successor intact', async () => {
    const s = await open()
    const original = await s.active()
    const observation = {
      ...s.base,
      run: original.run.run,
      execution: original.run.execution.execution,
      revision: '5',
      source: evidence('ended'),
      sequence: '1',
      consequences: [
        { kind: 'ended', outcome: 'completed', cause: null, disposition: evidence('complete') },
      ] satisfies readonly SessionLogConsequence[],
    }
    expect((await s.read()).run.kind).toBe('active')
    succeeded(await s.project(observation, operationId('interpret-end')), 'project')
    expect((await s.read()).run).toMatchObject({
      kind: 'terminal',
      terminal: { outcome: 'completed' },
    })
    await s.start('successor')
    const successor = (await s.read()).run
    succeeded(
      await s.project({ ...observation, sequence: null }, operationId('late-end')),
      'late project',
    )
    expect((await s.read()).run).toEqual(successor)
    expect(
      (await s.read()).executions?.find(item => item.run === original.run.run)?.terminal?.outcome,
    ).toBe('completed')
  })
  it('cancel wins before ended interpretation and late complete remains the old Run reference', async () => {
    const s = await open()
    const original = await s.active()
    succeeded(
      await s.commit({
        kind: 'control',
        input: {
          ...s.base,
          operation: operationId('cancel'),
          intent: { kind: 'cancel-run', run: original.run.run, urgency: 'force' },
        },
      }),
      'cancel',
    )
    await s.start('successor')
    const successor = (await s.read()).run
    succeeded(
      await s.project(
        {
          ...s.base,
          run: original.run.run,
          execution: original.run.execution.execution,
          revision: '5',
          sequence: '1',
          source: evidence('ended'),
          consequences: [
            { kind: 'ended', outcome: 'completed', cause: null, disposition: evidence('complete') },
          ],
        },
        operationId('project'),
      ),
      'project',
    )
    expect((await s.read()).run).toEqual(successor)
    expect((await s.read()).executions?.[0]?.terminal?.outcome).toBe('cancelled')
  })
  it('wrong execution and event gaps cannot advance the projection', async () => {
    const s = await open()
    const { run } = await s.active()
    const observation = {
      ...s.base,
      run: run.run,
      execution: run.execution.execution,
      revision: '1',
      sequence: '2',
      source: evidence('gap'),
      consequences: [{ kind: 'observed' }] satisfies readonly SessionLogConsequence[],
    }
    s.history.observe(observation)
    const snapshot = await s.read()
    expect(projectSessionLog(snapshot, observation)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'quarantined' },
    })
    expect(projectSessionLog(snapshot, { ...observation, execution: 'foreign' })).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'denied' },
    })
    expect(await s.read()).toEqual(snapshot)
  })
  it('the exact taken batch clears handed and pending, then a model registration clears unread taken inputs', async () => {
    const s = await open()
    const { run } = await s.active()
    succeeded(
      await s.commit({
        kind: 'receive',
        input: {
          ...s.base,
          operation: operationId('hand'),
          fact: {
            kind: 'input-handover',
            execution: run.execution.execution,
            input: inputId('first'),
            result: { kind: 'accepted', receipt: evidence('handed') },
          },
        },
      }),
      'hand',
    )
    succeeded(
      await s.project(
        {
          ...s.base,
          run: run.run,
          execution: run.execution.execution,
          revision: '2',
          sequence: '1',
          source: evidence('taken'),
          consequences: [
            {
              kind: 'input-taken',
              batch: {
                id: 'batch' as BatchId,
                watermark: evidence('watermark'),
                ordered: [inputId('first')],
              },
            },
          ],
        },
        operationId('taken'),
      ),
      'taken',
    )
    expect(await s.read()).toMatchObject({ pending: [], handed: [], taken: ['first'] })
  })
  it('resident shapes are recorded once, keys survive omission, and archive excludes the reference', async () => {
    const s = scene()
    const key = 'resident-key' as ResidentKey
    await s.create(
      creation({
        residentAdoption: {
          residents: [
            {
              capability: 'tool',
              version: '1',
              shape: { kind: 'string', value: 'shape' },
              admitted: evidence('admitted'),
            },
          ],
          keys: [{ capability: 'tool', key }],
        },
      }),
    )
    await s.accept('first')
    await s.start()
    expect((await s.read()).residentKeys).toEqual([{ capability: 'tool', key }])
    const ask = () =>
      s.port.references({ principal: 'system', scope: 'system', key, after: null, limit: 10 })
    expect(succeeded(await ask(), 'references').sessions).toHaveLength(1)
    await s.control('archive')
    expect(succeeded(await ask(), 'references').sessions).toEqual([])
    s.port.controls.directoryAvailable(false)
    expect(refused(await ask(), 'directory').kind).toBe('unavailable')
  })
  it('archive ends one scope, mixed release keeps its task, and unarchive creates a new bound generation', async () => {
    const s = await open()
    await s.control('archive')
    const archived = await s.read()
    const task = archived.tasks.find(item => item.kind === 'scope-release')
    if (task?.kind !== 'scope-release') throw new Error('release task missing')
    const receive = async (name: string, dispositions: readonly ('released' | 'pending')[]) =>
      s.commit({
        kind: 'receive',
        input: {
          ...s.base,
          operation: operationId(name),
          fact: {
            kind: 'scope-release',
            archive: task.archive,
            scope: task.scope,
            dispositions,
            source: evidence(name),
          },
        },
      })
    succeeded(await receive('mixed', ['released', 'pending']), 'mixed')
    expect((await s.read()).tasks.some(item => item.kind === 'scope-release')).toBe(true)
    succeeded(await receive('released', ['released']), 'released')
    expect(
      succeeded(
        await s.port.releasedScopes({
          principal: 'system',
          scope: 'system',
          after: null,
          limit: 10,
        }),
        'scopes',
      ).scopes,
    ).toMatchObject([{ task: task.archive, scope: task.scope }])
    await s.control('unarchive')
    const state = await s.read()
    expect(state.contextScopes).toHaveLength(2)
    expect(state.contextScopes?.[0]?.ended).not.toBeNull()
    expect(state.contextScopes?.[1]?.scope).not.toBe(task.scope)
    expect(state.pending).toEqual([])
  })
  it('routed business and HITL replies create recoverable work without ordinary input eligibility', async () => {
    const s = scene()
    await s.create()
    for (const value of [
      {
        kind: 'business',
        owner: 'job',
        input: evidence('business'),
        destination: evidence('dest'),
      },
      {
        kind: 'card-decision',
        card: evidence('card'),
        decision: evidence('decision'),
        destination: evidence('dest'),
      },
    ] as const) {
      const operation = operationId(value.kind)
      succeeded(await s.commit({ kind: 'accept', input: { ...s.base, operation, value } }), 'route')
      expect((await s.read()).pending).toEqual([])
      succeeded(
        await s.commit({
          kind: 'receive',
          input: {
            ...s.base,
            operation: operationId(`returned-${value.kind}`),
            fact: {
              kind: 'routed-input',
              originalOperation: operation,
              source: evidence('returned'),
            },
          },
        }),
        'return',
      )
    }
    expect((await s.read()).tasks).toEqual([])
  })
  it('result custody, processing, and Tool release remain separate; Model confirmation stays blocked', async () => {
    const s = await open()
    const binding = {
      producer: { kind: 'tool', call: 'tool-call' },
      action: 'action',
      consumer: { owner: 'session', work: 'work', position: 'position', purpose: 'action' },
      request: evidence('request'),
      initiatingAttempt: null,
    } as const
    const bound = succeeded(
      await s.port.commit({
        command: {
          kind: 'bindExternalCall',
          input: {
            ...s.base,
            operation: operationId('bind'),
            expected: (await s.read()).revision,
            qualification: evidence('qualified'),
            binding,
          },
        },
        guards: [],
      }),
      'bind',
    )
    const result = {
      producer: binding.producer,
      version: '1',
      delivery: 'delivery',
      source: evidence('result'),
    }
    succeeded(
      await s.commit({
        kind: 'preserveResult',
        input: {
          ...s.base,
          operation: operationId('preserve'),
          participation: null,
          consumption: bound.consumption,
          result,
          custody: evidence('custody'),
        },
      }),
      'preserve',
    )
    expect((await s.read()).consumptions[0]?.results[0]).toMatchObject({
      completion: null,
      release: 'pending',
    })
    succeeded(
      await s.commit({
        kind: 'completeExternalConsumption',
        input: {
          ...s.base,
          operation: operationId('process'),
          expected: (await s.read()).revision,
          qualification: evidence('qualified'),
          completion: {
            consumption: bound.consumption,
            result,
            processing: evidence('processed'),
            position: binding.consumer.position,
            message: null,
          },
        },
      }),
      'process',
    )
    succeeded(
      await s.commit({
        kind: 'receive',
        input: {
          ...s.base,
          operation: operationId('release'),
          fact: {
            kind: 'release',
            consumption: bound.consumption,
            result,
            source: evidence('producer-confirmed'),
          },
        },
      }),
      'release',
    )
    expect((await s.read()).consumptions[0]?.results[0]?.release).toBe('confirmed')
    expect(
      refused(
        await s.commit({
          kind: 'receive',
          input: {
            ...s.base,
            operation: operationId('bad-release'),
            fact: {
              kind: 'release',
              consumption: bound.consumption,
              result: { ...result, producer: { kind: 'model', call: 'model' } },
              source: evidence('saved'),
            },
          },
        }),
        'Model ACK',
      ),
    ).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('MODEL-ACK-ARRIVAL'),
    })
  })
  it('model-view pages retain a fixed upper boundary as new messages arrive and recheck authorization', async () => {
    const s = scene()
    await s.create()
    await s.accept('first')
    const first = succeeded(
      await s.port.history.readModelView({ ...s.access, basis: null, after: null, pageBytes: 1 }),
      'view',
    )
    if (first.kind !== 'page') throw new Error('not a page')
    await s.accept('second')
    const fixed = succeeded(
      await s.port.history.readModelView({
        ...s.access,
        basis: first.basis,
        after: null,
        pageBytes: 10000,
      }),
      'fixed',
    )
    expect(fixed).toMatchObject({ kind: 'page', rows: [expect.objectContaining({ seq: '1' })] })
    expect(
      refused(
        await s.port.history.readModelView({
          ...s.access,
          basis: { epoch: 'foreign', upper: '1' },
          after: null,
          pageBytes: 1,
        }),
        'foreign',
      ).kind,
    ).toBe('invalid')
  })
  it('auto-archive disabled and resident decisions do not append entries', async () => {
    const s = scene()
    await s.create()
    const before = await s.read()
    const disabled = succeeded(
      await s.commit({
        kind: 'considerAutoArchive',
        input: { ...s.base, operation: operationId('consider'), idleEvidence: evidence('idle') },
      }),
      'disabled',
    )
    expect(disabled).toEqual({ result: 'disabled', receipt: null })
    expect(await s.read()).toEqual(before)
    succeeded(
      await s.commit({
        kind: 'setRelation',
        input: {
          ...s.base,
          operation: operationId('resident'),
          relation: { kind: 'main', resident: true },
        },
      }),
      'resident',
    )
    succeeded(
      await s.commit({
        kind: 'configureAutoArchive',
        input: {
          ...s.base,
          operation: operationId('policy'),
          policy: { kind: 'enabled', idleMs: '100' },
        },
      }),
      'policy',
    )
    expect(
      succeeded(
        await s.commit({
          kind: 'considerAutoArchive',
          input: { ...s.base, operation: operationId('exempt'), idleEvidence: evidence('idle') },
        }),
        'exempt',
      ),
    ).toEqual({ result: 'exempt', receipt: null })
  })
})
