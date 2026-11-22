import type { CallBinding, ConsumptionId, Participation } from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { open, participation } from './scene.ts'

type Opened = Awaited<ReturnType<typeof open>>
type Active = Awaited<ReturnType<Opened['active']>>

/** One call of the active Run (or one bound from outside a Run), with the steps of its result. */
export async function callScene(external = false, kind: 'tool' | 'model' = 'tool') {
  const s = await open()
  return callOn(s, await s.active(), external, 'original', 1, '2', kind)
}

/** Several calls of one session, each with its own identities: what is said about one must not touch another. */
export async function callsScene(external: boolean, count: number) {
  const s = await open()
  const active = await s.active()
  const calls = []
  // The Agent wrote one revision for each call it registered: its hand-overs come after them.
  const written = String(count + 1)
  for (let n = 1; n <= count; n += 1)
    calls.push(await callOn(s, active, external, `call-${n}`, n, written))
  return calls
}

async function callOn(
  s: Opened,
  { run, advance }: Active,
  external: boolean,
  tag: string,
  n: number,
  written: string,
  kind: 'tool' | 'model' = 'tool',
) {
  const purpose = kind === 'model' ? 'main' : 'action'
  const binding: CallBinding = {
    producer: { kind, call: `${tag}-call` },
    action: 'action',
    consumer: { owner: 'session', work: 'work', position: `${tag}-position`, purpose },
    request: evidence('request'),
    initiatingAttempt: external ? null : advance.attempt,
  }
  const id = `${tag}-consumption` as ConsumptionId
  const consumption = external
    ? succeeded(
        await s.commit({
          kind: 'bindExternalCall',
          input: {
            ...s.base,
            operation: operationId(`bind-${tag}`),
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
          revision: String(n),
          sequence: String(n),
          source: evidence(`call-${n}`),
          consequences: [
            {
              kind: 'call-registration',
              consumption,
              registration:
                kind === 'model'
                  ? {
                      kind: 'associated',
                      binding: { ...binding, producer: { kind, call: binding.producer.call } },
                      purpose: 'main',
                    }
                  : {
                      kind: 'associated',
                      binding: { ...binding, producer: { kind, call: binding.producer.call } },
                      purpose: 'action',
                    },
            },
            {
              kind: 'waiting',
              waiting: [{ kind: 'producer', binding, position: binding.consumer.position }],
            },
          ],
        },
        operationId(`call-${tag}`),
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
    version = result.version,
  ) =>
    s.commit({
      kind: 'preserveResult',
      input: {
        ...s.base,
        operation: operationId(operation),
        consumption,
        result: { ...result, version },
        custody,
        participation: part,
      },
    })
  const process = (
    operation: string,
    part = { ...participation(run.execution.execution, 'processed'), written },
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
  // The entries consumption of the producer writes the final delivery of the call: its execution fact.
  const deliver = (operation: string) => {
    const channel = kind === 'model' ? 'model-received' : 'tool-received'
    const execution = run.execution.execution
    return s.port.commitEntries({
      observation: {
        tenant: s.base.tenant,
        session: s.base.session,
        run: run.run,
        execution,
        channel,
        operation: operationId(operation),
        after: '0',
        through: '1',
        position: '1',
        boundary: {
          execution,
          channel,
          revision: '1',
          executionEvidence: evidence('agent/head/1'),
          count: '1',
        },
        items: [
          {
            ordinal: '1',
            key: `${tag}-final`,
            fact: evidence(`agent/entry/${tag}`),
            interpretation: [
              { kind: 'execution', producer: binding.producer, source: evidence('delivery') },
            ],
          },
        ],
      },
      start: { kind: 'initial' },
    })
  }
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
    deliver,
  }
}

/** One Tool intent of the active Run that nobody waits for, and the association that names its invocation. */
export async function intentScene(waited = false) {
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
        consequences: [
          { kind: 'call-registration', consumption, registration: intent },
          ...(waited
            ? [
                {
                  kind: 'registered-waiting' as const,
                  calls: [{ consumption, position: intent.consumer.position }],
                  other: [],
                },
              ]
            : []),
        ],
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
