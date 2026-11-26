import { describe, expect, it } from 'vitest'
import {
  decide,
  deliveryReads,
  inputsToDeliver,
  type InputId,
} from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  ordinaryInput,
  refused,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { open, participation, scene } from './scene.ts'

type Scene = ReturnType<typeof scene>

async function rows(s: Scene) {
  const view = succeeded(
    await s.port.history.readModelView({
      ...s.access,
      basis: null,
      after: null,
      pageBytes: 100_000,
    }),
    'view',
  )
  return view.kind === 'page' ? view.rows : []
}

async function deliver(s: Scene, name: string, inputs: readonly string[], joint = 'delivered') {
  const { run } = await s.active()
  return s.commit({
    kind: 'recordMessage',
    input: {
      ...s.base,
      operation: operationId(`deliver-${name}`),
      participation: {
        ...participation(run.execution.execution, joint as 'delivered'),
        operation: `agent-deliver-${name}`,
      },
      value: {
        inputs: inputs as readonly InputId[],
        source: evidence(`agent/step/${name}`),
        admission: evidence(`agent/step/${name}`),
      },
    },
  })
}

async function reply(s: Scene, name: string) {
  const { run } = await s.active()
  succeeded(
    await s.commit({
      kind: 'recordMessage',
      input: {
        ...s.base,
        operation: operationId(`message-${name}`),
        participation: {
          ...participation(run.execution.execution, 'message'),
          operation: `agent-message-${name}`,
        },
        value: {
          message: {
            id: `msg_assistant000000000000${name}`,
            role: 'assistant',
            blocks: [
              {
                kind: 'text',
                id: `${name}/text`,
                visibility: { toHuman: true, toModel: true },
                text: 'an answer',
              },
            ],
          } as never,
          source: evidence(`agent/source/${name}`),
          admission: evidence(`agent/admission/${name}`),
          consumption: null,
        },
      },
    }),
    'assistant message',
  )
}

// N1, N2 (model InputDelivery): the model view holds an input from the step that took it.
describe('an input enters the model view when a step takes it', () => {
  it('the message as accepted is not in the model view (ShownTaken)', async () => {
    const s = await open()
    expect(await rows(s)).toEqual([])
  })

  it('a delivery puts the batch at the end of the model view, in the order of the batch', async () => {
    const s = await open()
    await s.accept('second')
    succeeded(await deliver(s, 'one', ['first', 'second']), 'deliver')
    const view = await rows(s)
    expect(view.map(row => row.message)).toEqual([
      ordinaryInput('first').message,
      ordinaryInput('second').message,
    ])
    expect((await s.read()).deliveredTail).toEqual(['first', 'second'])
  })

  it('an input still at the end of the view is not delivered twice; after a reply it is (AskHasNews)', async () => {
    const s = await open()
    succeeded(await deliver(s, 'one', ['first']), 'deliver')
    expect(inputsToDeliver(await s.read(), ['first' as InputId])).toEqual([])
    expect(refused(await deliver(s, 'again', ['first']), 'again').kind).toBe('changed')
    expect(await rows(s)).toHaveLength(1)
    await reply(s, 'r1')
    expect((await s.read()).deliveredTail).toBeUndefined()
    succeeded(await deliver(s, 'after-reply', ['first']), 'deliver after the reply')
    const view = await rows(s)
    expect(view.map(row => row.message.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('refuses a delivery of an input the Run cannot take, or of another joint', async () => {
    const s = await open()
    const named = (reason: string) => ({ kind: 'invalid', field: 'value.inputs', reason })
    const twice = named('empty, or an input named twice')
    expect(refused(await deliver(s, 'unknown', ['nobody']), 'unknown')).toMatchObject(
      named('not an input this Run can take'),
    )
    expect(refused(await deliver(s, 'none', []), 'none')).toMatchObject(twice)
    expect(refused(await deliver(s, 'twice', ['first', 'first']), 'twice')).toMatchObject(twice)
    expect(refused(await deliver(s, 'joint', ['first'], 'message'), 'joint').kind).toBe('invalid')
    expect(await rows(s)).toEqual([])
  })

  it('refuses the whole batch when one of its inputs is unknown', async () => {
    const s = await open()
    await s.accept('second')
    expect(refused(await deliver(s, 'mixed', ['first', 'nobody']), 'mixed')).toMatchObject({
      kind: 'invalid',
      field: 'value.inputs',
      reason: 'not an input this Run can take',
    })
    expect(await rows(s)).toEqual([])
  })

  it('reads the message Session admitted for each input it names, and refuses an input without one', async () => {
    const s = await open()
    const { run, snapshot } = await s.active()
    const command = {
      kind: 'recordMessage' as const,
      input: {
        ...s.base,
        operation: operationId('deliver-read'),
        participation: participation(run.execution.execution, 'delivered'),
        value: {
          inputs: ['first' as InputId],
          source: evidence('agent/step/read'),
          admission: evidence('agent/step/read'),
        },
      },
    }
    const message = ordinaryInput('first').message
    expect(deliveryReads(command, () => message)).toEqual({
      delivered: [{ input: 'first', message }],
    })
    expect(deliveryReads(command, () => undefined)).toEqual({ delivered: [] })
    expect(decide(snapshot, command, [], null, { compaction: null })).toMatchObject({
      kind: 'rejected',
      failure: {
        kind: 'invalid',
        field: 'value.inputs',
        reason: 'an input without the message Session admitted',
      },
    })
  })

  it('refuses a delivery that is not from the execution of the active Run', async () => {
    const s = await open()
    const other = await s.commit({
      kind: 'recordMessage',
      input: {
        ...s.base,
        operation: operationId('deliver-other-execution'),
        participation: participation('another-execution', 'delivered'),
        value: {
          inputs: ['first' as InputId],
          source: evidence('agent/step/other'),
          admission: evidence('agent/step/other'),
        },
      },
    })
    expect(refused(other, 'another execution')).toMatchObject({
      kind: 'invalid',
      field: 'participation.execution',
    })
    const { run } = await s.active()
    await s.control('archive')
    const late = await s.commit({
      kind: 'recordMessage',
      input: {
        ...s.base,
        operation: operationId('deliver-after-archive'),
        participation: participation(run.execution.execution, 'delivered'),
        value: {
          inputs: ['first' as InputId],
          source: evidence('agent/step/late'),
          admission: evidence('agent/step/late'),
        },
      },
    })
    expect(refused(late, 'after the archive').kind).toBe('archived')
    expect(await rows(s)).toEqual([])
  })

  it('delivers the message Session admitted for the input, and records who wrote the delivery', async () => {
    const s = await open()
    succeeded(await deliver(s, 'one', ['first']), 'deliver')
    expect((await rows(s)).map(row => row.message)).toEqual([ordinaryInput('first').message])
    const written = s.port.controls
      .entriesOf(s.access.tenant, s.access.session)
      .find(entry => entry.kind === 'message.delivered')
    expect(written?.origin).toMatchObject({ owner: 'agent', via: 'agent-participant' })
  })

  it('an input that is still alive keeps its delivery among the entries a compaction must keep', async () => {
    const s = await open()
    succeeded(await deliver(s, 'one', ['first']), 'deliver')
    const view = succeeded(
      await s.port.history.readModelView({
        ...s.access,
        basis: null,
        after: null,
        pageBytes: 100_000,
      }),
      'view',
    )
    if (view.kind !== 'page') throw new Error('a page of the model view is expected')
    const context = succeeded(
      await s.port.history.readCompactionContext({
        ...s.access,
        basis: view.basis,
        coverTo: null,
      }),
      'compaction context',
    )
    if (context.kind !== 'context') throw new Error('a compaction context is expected')
    expect(context.value.open).toContain(view.rows[0]!.entry)
  })
})
