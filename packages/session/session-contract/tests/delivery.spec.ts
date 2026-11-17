import { describe, expect, it } from 'vitest'
import { inputsToDeliver, type InputId } from '@omne-harness/session-contract'
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
        deliveries: inputs.map(input => ({
          input: input as InputId,
          message: ordinaryInput(input).message,
        })),
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

  it('refuses a delivery of an input the Run cannot take, of another joint, or of a reply', async () => {
    const s = await open()
    expect(refused(await deliver(s, 'unknown', ['nobody']), 'unknown').kind).toBe('invalid')
    expect(refused(await deliver(s, 'none', []), 'none').kind).toBe('invalid')
    expect(refused(await deliver(s, 'twice', ['first', 'first']), 'twice').kind).toBe('invalid')
    expect(refused(await deliver(s, 'joint', ['first'], 'message'), 'joint').kind).toBe('invalid')
    const { run } = await s.active()
    const wrong = await s.commit({
      kind: 'recordMessage',
      input: {
        ...s.base,
        operation: operationId('deliver-reply'),
        participation: participation(run.execution.execution, 'delivered'),
        value: {
          deliveries: [
            {
              input: 'first' as InputId,
              message: { ...ordinaryInput('first').message, role: 'assistant' } as never,
            },
          ],
          source: evidence('agent/step/wrong'),
          admission: evidence('agent/step/wrong'),
        },
      },
    })
    expect(refused(wrong, 'reply').kind).toBe('invalid')
    expect(await rows(s)).toEqual([])
  })
})
