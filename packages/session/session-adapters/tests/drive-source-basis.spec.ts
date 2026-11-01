// AD-14 into AD-01 on real Cordis: the AcceptedInput that `sessionAgentDrive` builds reaches the
// read-only check of the session-log Journal unchanged, and the check holds on it. The Session side
// is session-storage-sql over the node:sqlite double; the Session work faces read it. The Agent
// runtime is a double whose `invoke` and handle `submit` call the real session-log Journal with
// what AD-14 gave them, so the source basis travels the production path from the drive port to the
// `session` participant. The double does not prove the Agent runtime, Workers or durability.
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  AcceptedInput,
  AgentExecutionHandle,
  AgentInstanceId,
  AgentRuntime,
  DurableEvidence,
} from '@omne-harness/agent-contract'
import {
  AgentExecutionControlService,
  AgentExecutionRecoveryService,
  AgentInstanceProvisionService,
  agentInstancesKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { createMemoryInstanceProvision } from '@omne-harness/agent-cordis-contract/testing'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  deriveDriveOperation,
  type AgentDrivePort,
  type InputId,
  type SessionFaces,
} from '@omne-harness/session-contract'
import { guard, operationId, ordinaryInput } from '@omne-harness/session-contract/testing'
import { SessionService, sessionAgentDriveKey } from '@omne-harness/session-cordis-contract/cordis'
import { createSessionAgentDrivePlugin } from '../src/cordis/agent-drive.ts'
import { checkpoint, instance, ok, openInput, submitInput } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

/**
 * The drive plugin over the scene: the Session work faces read the scene's storage, and every
 * runtime opens and submits through the scene's session-log Journal. `given` keeps each
 * AcceptedInput exactly as AD-14 handed it to the runtime.
 */
async function assembled(s: SqlScene) {
  const ctx = new Context()
  const given: AcceptedInput[] = []
  const receipts = new Map<string, DurableEvidence>()
  const handleOf = (): AgentExecutionHandle<unknown> => ({
    execution: s.execution,
    input: {
      submit: async input => {
        given.push(input.value)
        const answer = await s.view.journal.submit(
          submitInput(s.access, s.execution, input.operation, input.value),
        )
        return 'ok' in answer ? succeed(answer.ok) : answer
      },
    },
    control: { control: async () => fail({ kind: 'unsupported' }) },
    output: {
      read: async () => fail({ kind: 'unsupported' }),
      events: () => {
        throw new Error('not used')
      },
      acknowledge: async () => fail({ kind: 'unsupported' }),
    },
  })
  const runtimeOf = (id: AgentInstanceId): AgentRuntime<unknown> => ({
    instance: id,
    invoke: async input => {
      given.push(input.initial)
      const opened = await s.view.journal.open(
        openInput({
          access: s.access,
          execution: input.execution,
          operation: input.operation,
          instance: instance(),
          grant: input.grant,
          initial: input.initial,
          checkpoint: checkpoint(),
        }),
      )
      if ('failure' in opened) return opened
      receipts.set(String(input.operation), opened.ok.receipt.evidence)
      return succeed(handleOf())
    },
    resume: async () => fail({ kind: 'unsupported' }),
  })
  const provision = createMemoryInstanceProvision<unknown>({
    create: async (_slot, id) => succeed(runtimeOf(id)),
    check: () => succeed(undefined),
  })
  class Provision extends AgentInstanceProvisionService<unknown> {
    readonly acquire: AgentInstanceProvisionService<unknown>['acquire'] = input =>
      provision.provision.acquire(input)
  }
  class Directory extends Service {
    constructor(scope: Context) {
      super(scope, agentInstancesKey)
    }
    readonly resolve = provision.directory.resolve
    readonly connect = provision.directory.connect
  }
  class Recovery extends AgentExecutionRecoveryService<unknown> {
    readonly query: AgentExecutionRecoveryService<unknown>['query'] = input =>
      s.view.journal.query({ ...s.access, execution: input.execution, operation: input.operation })
    readonly load: AgentExecutionRecoveryService<unknown>['load'] = async () =>
      fail({ kind: 'unsupported' })
    readonly reconcile: AgentExecutionRecoveryService<unknown>['reconcile'] = async () =>
      fail({ kind: 'unsupported' })
    readonly detach: AgentExecutionRecoveryService<unknown>['detach'] = async () =>
      fail({ kind: 'unsupported' })
  }
  class Control extends AgentExecutionControlService<unknown> {
    readonly control: AgentExecutionControlService<unknown>['control'] = async () =>
      fail({ kind: 'unsupported' })
  }
  // The scene's storage allows every principal; the coordinator principal of AD-14 is not checked here.
  const workFace: Pick<SessionFaces<unknown>['work'], 'readWork' | 'readInput'> = {
    readWork: () => s.port.readWork(s.sessionAccess),
    readInput: input => s.port.readInput({ ...s.sessionAccess, input: input.input }),
  }
  class Session extends SessionService<unknown> {
    get work(): SessionFaces<unknown>['work'] {
      return workFace as SessionFaces<unknown>['work']
    }
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
    readonly history = {} as SessionFaces<unknown>['history']
  }
  for (const plugin of [Provision, Directory, Recovery, Control, Session])
    disposers.push(await mountOn(ctx, plugin))
  disposers.push(
    await mountOn(
      ctx,
      createSessionAgentDrivePlugin<unknown>({ coordinator: async () => succeed('coordinator') }),
    ),
  )
  const drive = ctx.get(sessionAgentDriveKey) as AgentDrivePort | undefined
  if (drive === undefined) throw new Error('sessionAgentDrive is absent')
  return { drive, given, receipts }
}

async function mountOn(ctx: Context, plugin: Parameters<Context['plugin']>[0]) {
  const fiber = await ctx.plugin(plugin)
  return () => fiber.dispose()
}

/** Session accepts the ordinary input `name`; the source of the answer is its SE11 receipt. */
async function accept(s: SqlScene, name: string): Promise<DurableEvidence> {
  const value = ordinaryInput(name)
  const accepted = ok(
    await s.port.commit({
      access: s.sessionAccess,
      command: {
        kind: 'accept',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId(`accept-${name}`),
          value,
        },
      },
      guards: [guard('evidence-bridge', 'ordinary-intake', value)],
    }),
  )
  return (accepted as { source: DurableEvidence }).source
}

describe('the source basis from AD-14 to the read-only check (PA-01 items 1 and 2)', () => {
  it('invoke opens the execution on the SE13 receipt, and submit hands an input in on its SE11 receipt', async () => {
    const s = await sqlScene('drive-source', { instance: 'slot' })
    const { drive, given, receipts } = await assembled(s)
    const target = { tenant: s.access.tenant, session: s.access.session, execution: s.execution }
    const first = s.initial.id as unknown as InputId
    // What the Session coordinator sends: the startRun receipt is the SE13 source and the grant.
    const invoke = deriveDriveOperation({
      kind: 'invoke',
      execution: s.execution,
      first,
      started: s.grant,
    })
    const invoked = await drive.invoke({
      ...target,
      operation: invoke,
      first,
      source: s.grant,
      grant: s.grant,
    })
    expect(invoked).toEqual({
      ok: { revision: expect.any(String), evidence: receipts.get(invoke) },
    })
    // The AcceptedInput reached the Journal as AD-14 built it: SE13 receipt, not the origin.
    expect(given[0]?.source).toEqual(s.grant)
    expect(given[0]?.source).not.toEqual(ordinaryInput('input-1').origin)

    const se11 = await accept(s, 'input-2')
    const input = 'input-2' as InputId
    const submitted = await drive.submit({
      ...target,
      operation: deriveDriveOperation({ kind: 'submit', execution: s.execution, input }),
      input,
      source: se11,
    })
    expect(submitted).toHaveProperty('ok')
    expect(given[1]?.source).toEqual(se11)
  })

  it('a source that is not the receipt of the right entry is denied at the check, and nothing is written', async () => {
    const s = await sqlScene('drive-source-denied', { instance: 'slot' })
    const { drive, given } = await assembled(s)
    const target = { tenant: s.access.tenant, session: s.access.session, execution: s.execution }
    const first = s.initial.id as unknown as InputId
    const written = () => s.controls?.select('SELECT COUNT(*) AS n FROM er_operation').rows[0]?.[0]
    const before = written()
    // The C24 counterexample: the origin of the first input in place of the SE13 receipt.
    const origin = ordinaryInput('input-1').origin
    const refused = await drive.invoke({
      ...target,
      operation: deriveDriveOperation({
        kind: 'invoke',
        execution: s.execution,
        first,
        started: origin,
      }),
      first,
      source: origin,
      grant: s.grant,
    })
    // The runtime got the input, so the refusal is the Journal's check, not an earlier step.
    expect(given).toHaveLength(1)
    expect(refused).toEqual({ failure: { kind: 'denied' } })
    expect(written()).toBe(before)
    const opened = await drive.invoke({
      ...target,
      operation: deriveDriveOperation({
        kind: 'invoke',
        execution: s.execution,
        first,
        started: s.grant,
      }),
      first,
      source: s.grant,
      grant: s.grant,
    })
    expect(opened).toHaveProperty('ok')
    await accept(s, 'input-2')
    const third = await accept(s, 'input-3')
    const input = 'input-2' as InputId
    const opening = written()
    const submitted = await drive.submit({
      ...target,
      operation: deriveDriveOperation({ kind: 'submit', execution: s.execution, input }),
      input,
      source: third,
    })
    expect(given.at(-1)?.source).toEqual(third)
    expect(submitted).toEqual({ failure: { kind: 'denied' } })
    expect(written()).toBe(opening)
  })
})
