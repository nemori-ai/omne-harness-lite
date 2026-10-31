// What a context assembler does with the Model contract: it picks a profile, passes each content
// block through message conversion, assembles the input with neutral tool declarations, has it
// measured, judges the reported count by its own policy (it compresses past the compaction trigger
// of the profile or over the limit, and does not prepare an input that was not measured), and has
// the preparation fix the request. The preparation and the send measure nothing. When a finished
// call says that the upstream found the input over its limit, the context compresses again and
// sends a new call. It never reads media and never asks for a transport.
import type { ContentBlock } from '@omne-harness/content-block'
import { judgeMessage, type Message, type MessagePart } from '@omne-harness/message'
import type {
  AssembledModelInput,
  BudgetCheck,
  FixedModelRequest,
  ModelFailure,
  ModelCallId,
  ModelInputMeter,
  ModelProfile,
  RequestBudget,
  Termination,
  ToolDeclaration,
} from '@omne-harness/model-contract'
import type {
  ConversionFailure,
  ModelMessageConversion,
  ModelProfiles,
  ModelRequestPreparation,
} from '@omne-harness/model-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { isContentBlock, meterInput, triggerLine } from './meter-input.ts'
import type { Sender } from './services.ts'
import { access, adoption, evidence, required, textBlock, type Principal } from './values.ts'

export type Services = Readonly<{
  profiles: ModelProfiles<Principal>
  preparation: ModelRequestPreparation<Principal>
  meter: ModelInputMeter
  conversion: ModelMessageConversion<Principal>
  sender: Sender
}>

export type Prepared =
  | Readonly<{ kind: 'prepared'; request: FixedModelRequest; dropped: number }>
  /** A service answered with a failure; the context hands it on as it came. */
  | Readonly<{ kind: 'rejected'; failure: ModelFailure | ConversionFailure; dropped: number }>
  /** The budget has no check of the input tokens, so the input is not measured. */
  | Readonly<{ kind: 'unmeasured'; dropped: number }>
  /** The input is over the limit of the check and cannot be compressed further. */
  | Readonly<{ kind: 'too-large'; amount: string; limit: string; dropped: number }>
  | Readonly<{ kind: 'no-profile' }>

const route = 'default'

type Converted<T> = Outcome<T, ConversionFailure>

/** The blocks of a message after conversion: a converted block is replaced by what it derived. */
async function convertedParts(
  conversion: ModelMessageConversion<Principal>,
  parts: readonly MessagePart[],
  signal: AbortSignal,
): Promise<Converted<readonly MessagePart[]>> {
  const out: MessagePart[] = []
  for (const part of parts) {
    if (!isContentBlock(part)) {
      out.push(part)
      continue
    }
    const result = await conversion.prepare({
      ...access,
      original: part,
      source: evidence(`source-${part.id}`),
      origin: 'inbound',
      signal,
    })
    if (!('ok' in result)) return fail(result.failure)
    out.push(...(result.ok.kind === 'converted' ? result.ok.value.derived : [part]))
  }
  return succeed(out)
}

async function convertedHistory(
  conversion: ModelMessageConversion<Principal>,
  history: readonly Message[],
  signal: AbortSignal,
): Promise<Converted<readonly Message[]>> {
  const out: Message[] = []
  for (const message of history) {
    const blocks = await convertedParts(conversion, message.blocks, signal)
    if (!('ok' in blocks)) return fail(blocks.failure)
    out.push(withBlocks(message, blocks.ok))
  }
  return succeed(out)
}

/** The message again with converted blocks; its role still decides which blocks it may hold. */
function withBlocks(message: Message, blocks: readonly MessagePart[]): Message {
  const judged = judgeMessage({ ...message, blocks })
  if (!('ok' in judged))
    throw new Error(`converted ${message.role} message is not a message: ${judged.rejected}`)
  return judged.ok
}

function assemble(
  messages: readonly Message[],
  tools: readonly ToolDeclaration[],
  chosen: ModelProfile,
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

/** The check of the input tokens that a budget reports, or null when the budget has none. */
function inputCheck(budget: RequestBudget): BudgetCheck | null {
  return budget.checks.find(item => item.metric === 'input-tokens') ?? null
}

/**
 * Prepares the request for a history and some tools. The context measures the input itself,
 * before it asks for a preparation, and judges the count that the meter reports: an input past
 * the compaction trigger of the profile, or over the limit of the check, loses its oldest message
 * and is measured again, until it is under the trigger or only one message is left; one message
 * that is still over the limit is too large. A meter that answers with a failure has not measured
 * the input, so nothing is dropped and the failure is handed on; a budget without a check of the
 * input tokens is an unfinished measurement, and nothing is prepared on it either. The
 * preparation measures nothing.
 */
export async function prepareRequest(
  services: Services,
  input: Readonly<{
    history: readonly Message[]
    tools: readonly ToolDeclaration[]
    signal: AbortSignal
  }>,
): Promise<Prepared> {
  const resolution = await services.profiles.resolve({ ...access, route, required })
  if (!('ok' in resolution)) return { kind: 'rejected', failure: resolution.failure, dropped: 0 }
  if (resolution.ok.kind !== 'resolved' || !resolution.ok.selectable) return { kind: 'no-profile' }
  const chosen = resolution.ok.profile
  const trigger = triggerLine(chosen.definition.context)
  for (let dropped = 0; ; dropped += 1) {
    const converted = await convertedHistory(
      services.conversion,
      input.history.slice(dropped),
      input.signal,
    )
    if (!('ok' in converted)) return { kind: 'rejected', failure: converted.failure, dropped }
    const kept = converted.ok
    const assembled = assemble(kept, input.tools, chosen)
    const measured = services.meter.measure(meterInput(chosen, assembled))
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
      requests: readonly FixedModelRequest[]
    }>
  | Readonly<{ kind: 'not-sent'; prepared: Exclude<Prepared, { kind: 'prepared' }> }>
  | Readonly<{ kind: 'gave-up'; calls: readonly ModelCallId[] }>

/**
 * Prepares and sends. When the call ends failed with an input-over-limit fault, the Model has
 * not retried and will not: the upstream refused this input, so sending it again would be refused
 * again. The context drops its oldest message, prepares again and sends a new call under a new
 * identity. It gives up when one message is left. Any other ending is the result of the call.
 */
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
  const requests: FixedModelRequest[] = []
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
