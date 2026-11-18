import {
  decodeAgentOperationId,
  type ActionAdmission,
  type AgentEventBody,
  type CardAnswer,
  type DecisionCardDraft,
  type EventPage,
} from '@omne-harness/agent-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import { evidence, execution, ok, loadWithEntries } from './journal-support.ts'
import { alice, eventually } from './loop-support.ts'
import { toolAssembly } from './fixtures/tool-call.ts'

export type Assembly = Awaited<ReturnType<typeof toolAssembly>>
export type Admit = Awaited<ReturnType<ActionAdmission<string>['admit']>>

export const input = { ...alice, execution: execution() }
export const draft = (
  explanation: string,
  extra: Partial<DecisionCardDraft> = {},
): DecisionCardDraft => ({
  explanation,
  options: [
    { id: 'once', label: 'Allow once' },
    { id: 'no', label: 'Do not allow' },
  ],
  about: { position: 'before_action' },
  ...extra,
})
export const ask = (
  explanation = 'Run the command?',
  extra: Partial<DecisionCardDraft> = {},
): Admit => ({
  ok: { kind: 'need-decision', card: draft(explanation, extra), evidence: evidence('ask') },
})
export const allow: Admit = { ok: { kind: 'allow', evidence: evidence('allow') } }
export const operation = ok(decodeAgentOperationId('present-cards'))
export const chosen: CardAnswer = {
  kind: 'chosen',
  option: 'once',
  value: null,
  evidence: evidence('answer'),
}

export async function cardAssembly(): Promise<Assembly> {
  const assembly = await toolAssembly()
  let count = 0
  assembly.controls.tools.invoke.always(async (): Promise<ToolInvokeOutcome> => {
    count += 1
    const reference = ok(
      encodeToolInvocationRef({
        tenant: alice.tenant,
        call: ok(decodeToolCallId(`tcall_call-${count}`)),
        admission: ok(decodeToolOperationId(`top_call-${count}`)),
      }),
    )
    return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
  })
  assembly.controls.cards.present.always(async call => ({
    ok: call.requests.map(request => evidence(`card/${request.identity}`)),
  }))
  assembly.controls.cards.read.always(async () => ({ ok: { kind: 'pending' } }))
  return assembly
}

export const snapshot = (assembly: Assembly) => loadWithEntries(assembly.dependencies, input)

export async function toolMessages(assembly: Assembly) {
  const bodies: AgentEventBody[] = []
  let after: string | null = null
  for (;;) {
    const page: EventPage = ok(
      await assembly.dependencies.journal.output.read({ ...input, after, limit: 100 }),
    )
    if (page.kind !== 'page') throw new Error('event gap')
    bodies.push(...page.events.map(event => event.body))
    if (page.caughtUp || page.events.length === 0) break
    after = page.next
  }
  return bodies.flatMap(body =>
    body.kind === 'message' && body.message.role === 'tool' ? [body.message] : [],
  )
}

export async function waitingForPerson(assembly: Assembly) {
  await eventually(async () => {
    const read = await snapshot(assembly)
    return read.state.kind === 'waiting' && read.state.waits.some(wait => wait.kind === 'human')
  })
  return snapshot(assembly)
}

export async function sleeping(assembly: Assembly) {
  await eventually(async () => assembly.controls.clock.pending().length === 1)
}

export async function nextCheck(assembly: Assembly) {
  await sleeping(assembly)
  const [check] = assembly.controls.clock.pending()
  if (check === undefined) throw new Error('the driver is not sleeping on a check time')
  ok(assembly.controls.clock.advanceTo(check))
}

export async function secondModelCall(assembly: Assembly) {
  await eventually(async () =>
    (await snapshot(assembly)).checkpoint.calls.some(
      call => call.kind === 'model' && call.action.startsWith('step-2/'),
    ),
  )
}

export const judgments = async (assembly: Assembly) =>
  (await snapshot(assembly)).checkpoint.batch?.actions.map(action => action.judgment.kind)
