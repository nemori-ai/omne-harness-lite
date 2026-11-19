import type { CallBinding, ConsumptionId, Participation } from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { open, participation } from './scene.ts'

/** One Tool call of the active Run (or one bound from outside a Run), with the steps of its result. */
export async function callScene(external = false) {
  const s = await open()
  const { run, advance } = await s.active()
  const binding: CallBinding = {
    producer: { kind: 'tool', call: 'original-call' },
    action: 'action',
    consumer: { owner: 'session', work: 'work', position: 'original-position', purpose: 'action' },
    request: evidence('request'),
    initiatingAttempt: external ? null : advance.attempt,
  }
  const id = 'original-consumption' as ConsumptionId
  const consumption = external
    ? succeeded(
        await s.commit({
          kind: 'bindExternalCall',
          input: {
            ...s.base,
            operation: operationId('bind'),
            expected: (await s.read()).revision,
            binding: { ...binding, initiatingAttempt: null },
            qualification: evidence('qualified'),
          },
        }),
        'external bind',
      ).consumption
    : id
  if (!external)
    succeeded(
      await s.project(
        {
          ...s.base,
          run: run.run,
          execution: run.execution.execution,
          revision: '1',
          sequence: '1',
          source: evidence('call'),
          consequences: [
            {
              kind: 'call-registration',
              consumption,
              registration: {
                kind: 'associated',
                binding: { ...binding, producer: { kind: 'tool', call: binding.producer.call } },
                purpose: 'action',
              },
            },
            {
              kind: 'waiting',
              waiting: [{ kind: 'producer', binding, position: binding.consumer.position }],
            },
          ],
        },
        operationId('call'),
      ),
      'call',
    )
  const result = {
    producer: binding.producer,
    version: '1',
    delivery: 'delivery',
    source: evidence('result'),
  }
  const preserve = (
    operation: string,
    custody = evidence('custody'),
    part: Participation | null = null,
  ) =>
    s.commit({
      kind: 'preserveResult',
      input: {
        ...s.base,
        operation: operationId(operation),
        consumption,
        result,
        custody,
        participation: part,
      },
    })
  const process = (
    operation: string,
    part = participation(run.execution.execution, 'processed'),
    proof = evidence('processed'),
  ) =>
    s.commit({
      kind: 'completeConsumption',
      input: {
        ...s.base,
        operation: operationId(operation),
        participation: part,
        completion: { consumption, result, completion: proof },
      },
    })
  const processExternal = async (
    operation: string,
    position = binding.consumer.position,
    processing = evidence('processed'),
  ) =>
    s.commit({
      kind: 'completeExternalConsumption',
      input: {
        ...s.base,
        operation: operationId(operation),
        expected: (await s.read()).revision,
        qualification: evidence('qualified'),
        completion: { consumption, result, position, processing, message: null },
      },
    })
  const cancel = async () =>
    succeeded(
      await s.commit({
        kind: 'control',
        input: {
          ...s.base,
          operation: operationId('cancel'),
          intent: { kind: 'cancel-run', run: run.run, urgency: 'force' },
        },
      }),
      'cancel',
    )
  const release = (operation: string) =>
    s.commit({
      kind: 'receive',
      input: {
        ...s.base,
        operation: operationId(operation),
        fact: { kind: 'release', consumption, result, source: evidence('confirmed') },
      },
    })
  return {
    ...s,
    run,
    binding,
    consumption,
    result,
    preserve,
    process,
    processExternal,
    cancel,
    release,
  }
}

/** One Tool intent of the active Run that nobody waits for, and the association that names its invocation. */
export async function intentScene() {
  const s = await open()
  const { run, advance } = await s.active()
  const consumption = 'intent-consumption' as ConsumptionId
  const intent = {
    kind: 'tool-intent' as const,
    action: 'tool-action',
    consumer: { owner: 'session', work: 'work', position: 'position', purpose: 'action' },
    request: evidence('request'),
    initiatingAttempt: advance.attempt,
    purpose: 'action' as const,
  }
  const event = {
    ...s.base,
    run: run.run,
    execution: run.execution.execution,
    revision: '1',
    sequence: '1',
    source: evidence('intent-event'),
    executionEvidence: evidence('head-one'),
  }
  succeeded(
    await s.project(
      {
        ...event,
        consequences: [{ kind: 'call-registration', consumption, registration: intent }],
      },
      operationId('intent'),
    ),
    'intent',
  )
  const { purpose: _, kind: __, ...fields } = intent
  const bindingTo = (call: string): CallBinding => ({ producer: { kind: 'tool', call }, ...fields })
  const binding = bindingTo('real-invocation')
  const associate = (operation: string, to = binding, sequence = '2') =>
    s.project(
      {
        ...event,
        sequence,
        revision: sequence,
        source: evidence(`association-event-${sequence}`),
        executionEvidence: evidence(`head-${sequence}`),
        consequences: [
          {
            kind: 'call-association',
            consumption,
            binding: to,
            source: evidence(`association-source-${sequence}`),
          },
        ],
      },
      operationId(operation),
    )
  const cancel = async () =>
    succeeded(
      await s.commit({
        kind: 'control',
        input: {
          ...s.base,
          operation: operationId('cancel'),
          intent: { kind: 'cancel-run', run: run.run, urgency: 'force' },
        },
      }),
      'cancel',
    )
  const result = {
    producer: binding.producer,
    version: '1',
    delivery: 'delivery',
    source: evidence('result'),
  }
  const preserve = (operation: string) =>
    s.commit({
      kind: 'preserveResult',
      input: {
        ...s.base,
        operation: operationId(operation),
        consumption,
        result,
        custody: evidence('custody'),
        participation: null,
      },
    })
  const bound = (producer = binding.producer) => s.port.readCall({ ...s.access, producer })
  return { ...s, consumption, binding, bindingTo, associate, cancel, preserve, bound }
}
