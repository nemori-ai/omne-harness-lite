import type { ContentBlock } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import type {
  AssembledModelInput,
  BudgetCheck,
  LlmModelRequest,
  ModelFailure,
  ModelCallId,
  ModelInputMeter,
  ModelProfile,
  RequestBudget,
  Termination,
  ToolDeclaration,
} from '@omne-harness/model-contract'
import type { ModelProfiles, ModelRequestPreparation } from '@omne-harness/model-contract/provider'
import { meterInput, triggerLine } from './meter-input.ts'
import type { Sender } from './services.ts'
import { access, adoption, required, textBlock, type Principal } from './values.ts'

export type Services = Readonly<{
  profiles: ModelProfiles<Principal>
  preparation: ModelRequestPreparation<Principal>
  meter: ModelInputMeter
  sender: Sender
}>

export type Prepared =
  | Readonly<{ kind: 'prepared'; request: LlmModelRequest; dropped: number }>
  | Readonly<{ kind: 'rejected'; failure: ModelFailure; dropped: number }>
  | Readonly<{ kind: 'unmeasured'; dropped: number }>
  | Readonly<{ kind: 'too-large'; amount: string; limit: string; dropped: number }>
  | Readonly<{ kind: 'no-profile' }>

const route = 'default'

function assemble(
  messages: readonly Message[],
  tools: readonly ToolDeclaration[],
  chosen: ModelProfile<'llm'>,
): AssembledModelInput {
  const system: readonly ContentBlock[] = [textBlock('system', 'Be brief.')]
  return {
    system,
    messages,
    tools,
    toolChoice: tools.length === 0 ? 'none' : 'auto',
    parameters: [],
    representation: chosen.definition.representation,
    source: adoption('context-source'),
  }
}

function inputCheck(budget: RequestBudget): BudgetCheck | null {
  return budget.checks.find(item => item.metric === 'input-tokens') ?? null
}

export async function prepareRequest(
  services: Services,
  input: Readonly<{
    history: readonly Message[]
    tools: readonly ToolDeclaration[]
    signal: AbortSignal
  }>,
): Promise<Prepared> {
  const resolution = await services.profiles.resolve({ ...access, kind: 'llm', route, required })
  if (!('ok' in resolution)) return { kind: 'rejected', failure: resolution.failure, dropped: 0 }
  if (resolution.ok.kind !== 'resolved' || !resolution.ok.selectable) return { kind: 'no-profile' }
  const chosen = resolution.ok.profile
  const trigger = triggerLine(chosen.definition.context)
  for (let dropped = 0; ; dropped += 1) {
    const kept = input.history.slice(dropped)
    const assembled = assemble(kept, input.tools, chosen)
    const measured = await services.meter.measure(meterInput(chosen, assembled))
    if ('failure' in measured) return { kind: 'rejected', failure: measured.failure, dropped }
    const check = inputCheck(measured.ok)
    if (check === null) return { kind: 'unmeasured', dropped }
    const tokens = BigInt(check.measurement.amount)
    const limit = BigInt(check.limit)
    if ((tokens > trigger || tokens > limit) && kept.length > 1) continue
    if (tokens > limit)
      return { kind: 'too-large', amount: check.measurement.amount, limit: check.limit, dropped }
    const prepared = await services.preparation.prepare({
      ...access,
      profile: chosen,
      required,
      assembled,
    })
    if ('failure' in prepared) return { kind: 'rejected', failure: prepared.failure, dropped }
    return { kind: 'prepared', request: prepared.ok, dropped }
  }
}

export type Submitted =
  | Readonly<{
      kind: 'settled'
      termination: Termination
      calls: readonly ModelCallId[]
      requests: readonly LlmModelRequest[]
    }>
  | Readonly<{ kind: 'not-sent'; prepared: Exclude<Prepared, { kind: 'prepared' }> }>
  | Readonly<{ kind: 'gave-up'; calls: readonly ModelCallId[] }>

export async function submitRequest(
  services: Services,
  input: Readonly<{
    history: readonly Message[]
    tools: readonly ToolDeclaration[]
    signal: AbortSignal
    newCall: () => ModelCallId
  }>,
): Promise<Submitted> {
  const calls: ModelCallId[] = []
  const requests: LlmModelRequest[] = []
  let history = input.history
  for (;;) {
    const prepared = await prepareRequest(services, { ...input, history })
    if (prepared.kind !== 'prepared') return { kind: 'not-sent', prepared }
    const call = input.newCall()
    calls.push(call)
    requests.push(prepared.request)
    const termination = await services.sender.send({ call, request: prepared.request })
    const overLimit =
      termination.kind === 'failed' && termination.fault.cause === 'input-over-limit'
    if (!overLimit) return { kind: 'settled', termination, calls, requests }
    if (history.length - prepared.dropped <= 1) return { kind: 'gave-up', calls }
    history = history.slice(prepared.dropped + 1)
  }
}
