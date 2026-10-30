import { decodeAgentExecutionId, decodeInputId } from '@omne-harness/agent-contract'
import { creation, ordinaryInput, guard } from '@omne-harness/session-contract/testing'
import {
  scene,
  ok,
  operation,
  operationId,
  evidence,
  instance,
  openInput,
} from './common-journal.ts'
export type Scene = Awaited<ReturnType<typeof scene>>
/**
 * Records on the Session side that the Agent accepted an input: by default the initial input
 * under the open receipt; a submitted input under the receipt of its submit.
 */
export async function handed(
  s: Scene,
  input: Readonly<{
    id: string
    receipt: import('@omne-harness/agent-contract').DurableEvidence
  }> = {
    id: s.initial.id,
    receipt: s.opened.receipt.evidence,
  },
) {
  return s.backend.transactions.commit({
    access: s.access,
    command: {
      kind: 'receive',
      input: {
        tenant: s.access.tenant,
        session: s.access.session,
        operation: operationId(input.id === s.initial.id ? 'handed' : `handed-${input.id}`),
        fact: {
          kind: 'input-handover',
          input: input.id as unknown as import('@omne-harness/session-contract').InputId,
          execution: s.execution,
          result: { kind: 'accepted', receipt: input.receipt },
        },
      },
    },
    guards: [],
  })
}
export async function accept(s: Scene, id: string) {
  const value = ordinaryInput(id)
  ok(
    await s.backend.transactions.commit({
      access: s.access,
      command: {
        kind: 'accept',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId(`accept-${id}`),
          value,
        },
      },
      guards: [guard('evidence-bridge', 'ordinary-intake', value)],
    }),
  )
  return {
    id: ok(decodeInputId(id)),
    source: value.origin,
    content: value.message,
    priority: 'ordinary' as const,
  }
}
export async function take(
  s: Scene,
  name = 'take',
  waits: readonly import('@omne-harness/agent-contract').Waiting[] = [],
) {
  const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution })),
    page = ok(
      await s.view.journal.inputs({
        ...s.access,
        execution: s.execution,
        watermark: loaded.inputWatermark,
      }),
    )
  return ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(name),
      authority: s.opened.authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, inputBatch: page.batch.id },
      state: waits.length ? { kind: 'waiting', waits } : { kind: 'advancing' },
      events: [
        { kind: 'input-taken', batch: page.batch },
        ...(waits.length ? [{ kind: 'waiting' as const, waits }] : []),
      ],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
    }),
  )
}
export async function cancel(s: Scene, name = 'cancel') {
  const snapshot = ok(await s.backend.transactions.readWork(s.access))
  if (snapshot.run.kind !== 'active') throw new Error('active Run expected')
  return s.backend.transactions.commit({
    access: s.access,
    command: {
      kind: 'control',
      input: {
        tenant: s.access.tenant,
        session: s.access.session,
        operation: operationId(name),
        intent: { kind: 'cancel-run', run: snapshot.run.run, urgency: 'force' },
      },
    },
    guards: [],
  })
}
export async function freeze(s: Scene) {
  return s.backend.transactions.commit({
    access: s.access,
    command: {
      kind: 'freeze',
      input: {
        tenant: s.access.tenant,
        session: s.access.session,
        operation: operationId('freeze'),
        verdict: { cause: 'tool-shape-lost', evidence: evidence('freeze') },
      },
    },
    guards: [],
  })
}
export async function start(s: Scene, name = 'second') {
  const command = {
    kind: 'startRun' as const,
    input: {
      tenant: s.access.tenant,
      session: s.access.session,
      operation: operationId(`start-${name}`),
      entry: 'interactive' as const,
      candidate: creation().definition.candidate,
      instance: { owner: 'agent' as const, id: `instance-${name}` },
    },
  }
  const result = await s.backend.transactions.commit({
    access: s.access,
    command,
    guards: [
      guard('evidence-bridge', 'login-entry', {
        session: s.access.session,
        operation: command.input.operation,
      }),
    ],
  })
  if ('failure' in result) return result
  const snapshot = ok(await s.backend.transactions.readWork(s.access))
  if (snapshot.run.kind !== 'active') throw new Error('active Run expected')
  const execution = ok(decodeAgentExecutionId(snapshot.run.execution.execution)),
    admitted = ok(
      await s.backend.transactions.readInput({ ...s.access, input: snapshot.run.first }),
    )
  const initial = {
    id: ok(decodeInputId(admitted.input)),
    content: admitted.message,
    source: admitted.origin,
    priority: 'ordinary' as const,
  }
  const input = openInput({
    access: s.access,
    execution,
    operation: operation(`open-${name}`),
    instance: instance(`instance-${name}`),
    grant: result.ok.receipt.source,
    initial,
    checkpoint: s.checkpoint,
  })
  const opened = ok(await s.view.journal.open(input))
  return { ok: { ...s, execution, input, opened, initial } }
}
export async function end(s: Scene, name = 'end') {
  const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  return s.view.journal.tryFinish({
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    expected: loaded.revision,
    authorization: { kind: 'advancement', authority: s.opened.authority },
    intent: {
      conclusion: { kind: 'complete' },
      inputWatermark: loaded.inputWatermark,
      obligations: evidence('settled'),
      beforeTerminal: evidence('before-terminal'),
      failure: null,
    },
  })
}
