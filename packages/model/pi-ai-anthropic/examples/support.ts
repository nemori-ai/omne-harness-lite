// The steps that the two Anthropic examples share. Each round of a request goes through them:
//
// 1. `proxyFromEnvironment` maps HTTPS_PROXY to the proxy of the network resources. The proxy adds
//    the real credential, so the examples never read or hold a secret.
// 2. `profileOf` takes an official profile definition and makes the stored profile that a plan reads.
// 3. `fixRequest` acquires the family binding, lets `rules.plan` fix the parameter adoptions and the
//    representation, judges the `FixedModelRequest` and releases the binding. This stands in for the
//    request preparation of Model, which belongs to parent item 4.2: the examples do it by hand.
// 4. `openTransport` creates the network resources and the pi transport. The credential slot gives a
//    placeholder value; the proxy replaces it.
// 5. `executeOnce` runs `executeModel` of `@omne-harness/model` and prints what came back.
//
// `assembleReply` folds the facts of a completed round into the assistant message, as the caller of
// an independent execution must do it, so the next round can send the history.
import { createHash } from 'node:crypto'
import {
  decodeRevision,
  judgeFixedModelRequest,
  judgeReplayDeclaration,
  type Adoption,
  type FixedModelRequest,
  type IndependentModelFact,
  type ModelBlock,
  type ModelProfile,
  type ModelProfileDefinition,
  type Parameter,
  type ReplayDeclaration,
  type Supplier,
  type TransportFact,
} from '@omne-harness/model-contract'
import { parseMessageId, type Message } from '@omne-harness/message'
import { executeModel } from '@omne-harness/model'
import {
  composeFamilies,
  createNetworkResources,
  createPiTransport,
  type NetworkResources,
  type PiFamily,
  type PiTransport,
  type ProxyConfig,
} from '@omne-harness/pi-ai-transport'
import { assembleStream } from '@omne-harness/stream-arrival'

/** The OpenRouter endpoint and the data text that ends its SSE stream. */
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'
const END_MARKER = '[DONE]'

/**
 * The environment to the proxy configuration. Without HTTPS_PROXY nothing could add the credential,
 * so the example stops with a clear message.
 */
export function proxyFromEnvironment(): ProxyConfig {
  const url = process.env.HTTPS_PROXY
  if (url === undefined || url === '')
    throw new Error(
      'HTTPS_PROXY is not set: the examples send through a proxy that adds the credential',
    )
  const bypass = (process.env.NO_PROXY ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry !== '')
  return { url, bypass }
}

/** An adoption of the example itself: the source of the inputs, the retry policy, a profile. */
export function exampleAdoption(name: string): Adoption {
  return {
    owner: 'pi-ai-examples',
    name,
    revision: '1',
    digest: createHash('sha256').update(name).digest('hex'),
  }
}

export const SOURCE = exampleAdoption('source')
export const RETRY_POLICY = exampleAdoption('retry-policy')

/** The stored factory profile of the official definition whose supplier is the model. */
export function profileOf(
  definitions: readonly ModelProfileDefinition[],
  model: string,
): ModelProfile {
  const definition = definitions.find(item => item.suppliers[0].model === model)
  if (definition === undefined) throw new Error(`no official profile for ${model}`)
  const revision = decodeRevision('1')
  if (!('ok' in revision)) throw new Error('the profile revision does not decode')
  return {
    identity: { scope: { kind: 'factory' }, route: model },
    adoption: exampleAdoption(`profile ${model}`),
    revision: revision.ok,
    updatedAt: '2026-10-22T00:00:00Z',
    availability: 'active',
    definition,
  }
}

/** The supplier of the profile, with the factory credential. */
export function supplierOf(profile: ModelProfile): Supplier {
  const declared = profile.definition.suppliers[0]
  return {
    adoption: declared.adoption,
    recipient: declared.recipient,
    model: declared.model,
    credential: { kind: 'factory' },
  }
}

/** The replay declaration of the profile supplier with every default applied. */
export function declarationOf(profile: ModelProfile): ReplayDeclaration {
  const declared = judgeReplayDeclaration(profile.definition.suppliers[0], 0)
  if (!('ok' in declared)) throw new Error(`replay declaration: ${declared.failure.reason}`)
  return declared.ok
}

/** The input of one round, as plain JSON values; the contract judge checks them. */
export type RoundInput = Readonly<{
  system: readonly unknown[]
  messages: readonly unknown[]
  tools: readonly unknown[]
  toolChoice: 'none' | 'auto'
  parameters: readonly Parameter[]
}>

function judged(value: unknown): FixedModelRequest {
  const request = judgeFixedModelRequest(value)
  if (!('ok' in request))
    throw new Error(`the request is refused: ${JSON.stringify(request.failure)}`)
  return request.ok
}

/**
 * Acquire, plan, judge, release. Model's request preparation (parent item 4.2) will do this; the
 * example does it by hand. A refusal of the plan stops the example before anything is sent.
 */
export async function fixRequest(
  families: readonly PiFamily[],
  profile: ModelProfile,
  input: RoundInput,
): Promise<FixedModelRequest> {
  const supplier = supplierOf(profile)
  const base = {
    profile: profile.adoption,
    suppliers: [supplier],
    fallback: false,
    retryPolicy: profile.definition.retryPolicy,
    system: input.system,
    messages: input.messages,
    tools: input.tools,
    toolChoice: input.toolChoice,
    declarations: [declarationOf(profile)],
    source: SOURCE,
  }
  // The typed history for the plan: the same input, judged once without parameters.
  const draft = judged({
    ...base,
    parameters: [],
    representation: profile.definition.representation,
    parameterAdoptions: [],
  })
  const acquired = await composeFamilies(families).acquire(supplier, new AbortController().signal)
  if (!('ok' in acquired)) throw new Error(`acquire: ${JSON.stringify(acquired.failure)}`)
  const binding = acquired.ok
  try {
    const plan = binding.rules.plan({
      profile,
      supplier,
      assembled: {
        system: draft.system,
        messages: draft.messages,
        tools: draft.tools,
        toolChoice: draft.toolChoice,
        parameters: input.parameters,
        representation: profile.definition.representation,
        source: SOURCE,
      },
    })
    if (!('ok' in plan)) throw new Error(`plan: ${JSON.stringify(plan.failure)}`)
    for (const adoption of plan.ok.parameters) {
      // The applied value differs from the requested one when the plan changed it, e.g. the
      // prefix degrade turns the reasoning effort to `none`.
      const applied = show(adoption.applied)
      const requested =
        adoption.origin.kind === 'explicit' ? show(adoption.origin.requested) : 'a default'
      console.log(
        `parameter: ${applied}${requested === applied ? '' : ` (requested ${requested})`}`,
      )
    }
    return judged({
      ...base,
      parameters: input.parameters,
      representation: plan.ok.representation.adoption,
      parameterAdoptions: plan.ok.parameters,
    })
  } finally {
    await binding.release()
  }
}

function show(parameter: Parameter): string {
  return parameter.kind === 'extension'
    ? `extension ${parameter.definition.name}`
    : `${parameter.kind} ${JSON.stringify(parameter.value)}`
}

export type OpenTransport = Readonly<{ transport: PiTransport; network: NetworkResources }>

/** The network resources and the transport of the families. The assembly closes both. */
export function openTransport(families: readonly PiFamily[]): OpenTransport {
  const network = createNetworkResources({
    maxConnections: 1,
    idleConnectionTimeoutMs: 60_000,
    proxy: proxyFromEnvironment(),
  })
  const transport = createPiTransport({
    network,
    families: composeFamilies(families),
    routes: { openrouter: { url: OPENROUTER, endMarker: END_MARKER } },
    // A placeholder: the proxy replaces it with the real credential.
    credential: { read: () => 'placeholder' },
    limits: {
      connectTimeoutMs: 30_000,
      maxErrorBodyBytes: 4_096,
      maxEventBytes: 1_048_576,
      json: {
        maxBytes: 1_048_576,
        maxDepth: 64,
        maxItems: 4_096,
        maxMembers: 1_024,
        maxStringLength: 1_048_576,
        maxNumberLength: 64,
      },
    },
  })
  return { transport, network }
}

export async function closeTransport(open: OpenTransport): Promise<void> {
  await open.transport.close()
  await open.network.close()
}

export type RoundResult = Readonly<{
  facts: readonly TransportFact[]
  completed: boolean
}>

/** One independent execution: it prints the text, the reasoning state, the account and the end. */
export async function executeOnce(
  open: OpenTransport,
  request: FixedModelRequest,
): Promise<RoundResult> {
  const facts: TransportFact[] = []
  let ending: IndependentModelFact | undefined
  for await (const fact of executeModel(
    request,
    open.transport.transport,
    new AbortController().signal,
  )) {
    if (fact.kind === 'ended' || fact.kind === 'not-started') ending = fact
    if (fact.kind !== 'not-started') facts.push(fact)
  }
  const sealed = sealedBlocks(facts).map(item => item.block)
  const text = sealed.flatMap(block => (block.kind === 'text' ? [block.text] : [])).join('')
  console.log(`text: ${JSON.stringify(text)}`)
  console.log(`thinking blocks: ${sealed.filter(block => block.kind === 'thinking').length}`)
  console.log(`tool calls: ${sealed.filter(block => block.kind === 'tool_call').length}`)
  const states = sealed.filter(block => block.kind === 'reasoning_state').length
  console.log(
    `reasoning state: ${states > 0 ? `yes (${states} part${states === 1 ? '' : 's'})` : 'no'}`,
  )
  for (const fact of facts) {
    if (fact.kind === 'diagnostic') console.log(`diagnostic: ${JSON.stringify(fact.value)}`)
    if (fact.kind === 'account') {
      const usage = fact.value.usage
        .map(item => `${item.name}=${item.state === 'unknown' ? 'unknown' : item.lexeme}`)
        .join(' ')
      const cost = fact.value.cost
        .map(item => `${item.state === 'unknown' ? 'unknown' : item.lexeme} ${item.unit}`)
        .join(' ')
      console.log(`usage: ${usage}`)
      console.log(`cost: ${cost === '' ? 'none reported' : cost}`)
      console.log(`place: ${fact.value.place}`)
    }
  }
  if (ending === undefined) throw new Error('the execution gave no terminal fact')
  console.log(`termination: ${terminationOf(ending)}`)
  const completed = ending.kind === 'ended' && ending.termination.kind === 'completed'
  if (!completed) process.exitCode = 1
  return { facts, completed }
}

function terminationOf(fact: IndependentModelFact): string {
  if (fact.kind === 'not-started')
    return fact.reason === 'rejected'
      ? `not-started rejected ${JSON.stringify(fact.failure)}`
      : 'not-started cancelled'
  if (fact.kind !== 'ended') return fact.kind
  const termination = fact.termination
  switch (termination.kind) {
    case 'completed':
      return `completed ${termination.reason}`
    case 'failed':
      return `failed ${termination.fault.cause} ${termination.fault.diagnostic}`
    case 'interrupted':
      return 'interrupted'
    default:
      return JSON.stringify(termination)
  }
}

type Sealed = Readonly<{ index: bigint; block: ModelBlock }>

function sealedBlocks(facts: readonly TransportFact[]): readonly Sealed[] {
  return facts
    .flatMap(fact =>
      fact.kind === 'block-seal' ? [{ index: BigInt(fact.index), block: fact.block }] : [],
    )
    .toSorted((left, right) => (left.index < right.index ? -1 : left.index > right.index ? 1 : 0))
}

/** The head of a block for an `open` step: the block without its body. */
function headOf(block: ModelBlock): object {
  switch (block.kind) {
    case 'text':
    case 'thinking': {
      const { text: _text, ...head } = block
      return head
    }
    case 'tool_call': {
      const { arguments: _arguments, ...head } = block
      return head
    }
    default: {
      if ('inline' in block) {
        const { inline: _inline, ...head } = block
        return head
      }
      return { kind: block.kind, id: block.id, visibility: block.visibility }
    }
  }
}

/**
 * The assistant message of a completed round, folded by `assembleStream`. Every sealed block goes
 * in whole, in index order. The finish carries the replay scope and format of the producer when the
 * message has thinking or a reasoning state; the message must not carry one otherwise.
 */
export function assembleReply(
  id: string,
  facts: readonly TransportFact[],
  replay: Readonly<{ scope: string; format: string }>,
): Message {
  const target = parseMessageId(id)
  if (!target.ok) throw new Error(`message id ${id}: ${target.error}`)
  const sealed = sealedBlocks(facts)
  const steps: unknown[] = []
  for (const { index, block } of sealed) {
    const at = String(index)
    steps.push({ step: 'open', index: at, mode: 'replace', head: headOf(block) })
    if (block.kind === 'text' || block.kind === 'thinking')
      steps.push({ step: 'fill', index: at, seq: '0', chunk: block.text })
    steps.push({ step: 'close', index: at, block })
  }
  const next = sealed.length === 0 ? 0n : (sealed.at(-1)?.index ?? 0n) + 1n
  const reasons = sealed.some(
    item => item.block.kind === 'reasoning_state' || item.block.kind === 'thinking',
  )
  steps.push({ step: 'finish', index: String(next), ...(reasons ? { replay } : {}) })
  const result = assembleStream({ target: { id: target.value, role: 'assistant' }, steps })
  if ('rejected' in result)
    throw new Error(
      `assembly refused at step ${result.at}: ${result.rejected} ${result.detail ?? ''}`,
    )
  const assembly = result.ok
  if (assembly.phase !== 'ended' || assembly.terminal.kind !== 'complete')
    throw new Error('the assembly did not complete')
  return assembly.terminal.message
}
