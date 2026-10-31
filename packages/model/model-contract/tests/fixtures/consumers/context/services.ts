// The services that the context consumes, as this fixture stands them in: a profile service that
// offers one profile, a meter that counts characters as tokens, a preparation that fixes a request
// from an assembled input with the expanded replay declaration of each supplier and prepares a
// transport (and measures and reads nothing), a sender that
// answers each call with a scripted ending, and a conversion that decides by the kind of block.
// They exercise the contract shapes; they are not the Model.
import { succeed } from '@omne-harness/operation-result'
import { judgeReplayDeclaration } from '@omne-harness/model-contract/provider'
import type {
  ConversionResult,
  FixedModelRequest,
  ModelCountingBasis,
  ModelInputMeter,
  ModelCallId,
  ProfileResolution,
  ReplayDeclaration,
  RequestBudget,
  Supplier,
  Termination,
} from '@omne-harness/model-contract'
import type {
  ModelMessageConversion,
  ModelProfiles,
  ModelRequestPreparation,
  ModelTransport,
} from '@omne-harness/model-contract/provider'
import { blocksOf, inputBound, referencesOf, type MeterInput } from './meter-input.ts'
import { adoption, evidence, profile, textBlock, type Principal } from './values.ts'

const resolved: ProfileResolution = {
  kind: 'resolved',
  profile,
  source: evidence('profile'),
  selectable: true,
  reasons: [],
  credential: 'available',
  shadowed: [],
}

export function createProfiles(): ModelProfiles<Principal> {
  return {
    async list() {
      return succeed({
        choices: [resolved],
        selected: { route: profile.identity.route, resolution: resolved },
        source: evidence('choices'),
      })
    },
    async resolve(input) {
      return succeed<ProfileResolution>(
        input.route === profile.identity.route
          ? resolved
          : { kind: 'absent', reason: 'unknown-name' },
      )
    },
  }
}

export const basis: ModelCountingBasis = {
  supplier: profile.definition.suppliers[0],
  meter: adoption('meter'),
  tokenization: { kind: 'not-used', method: adoption('method') },
  prompt: { kind: 'declared-template', template: adoption('template') },
  projection: adoption('projection'),
  mediaTransform: adoption('media'),
  replay: adoption('replay'),
  evidence: adoption('evidence'),
}

export type CountingMeter = ModelInputMeter & Readonly<{ measured(): number }>

type MeterAnswer = (input: MeterInput) => ReturnType<ModelInputMeter['measure']>

/** A meter that answers as told and counts how often it was asked. */
export function createMeterWith(answer: MeterAnswer): CountingMeter {
  let measured = 0
  return {
    basis,
    measured: () => measured,
    measure(input) {
      measured += 1
      return answer(input)
    },
  }
}

/**
 * A meter that counts one token per character. Its budget holds a check of the count against the
 * most that the profile allows, which is the separate input limit or the window less the output
 * limit; it refuses nothing for its size, because whether the count passes the compaction
 * trigger or the limit is for the context to judge. It is the context that calls it, before it
 * asks for a preparation.
 */
export function createMeter(): CountingMeter {
  return createMeterWith(input => {
    const blocks = blocksOf(input.assembled)
    const tokens = blocks.reduce((sum, block) => sum + ('text' in block ? block.text.length : 0), 0)
    const [first, ...rest] = referencesOf(blocks)
    const common = {
      inputDigest: String(tokens),
      checks: [
        {
          supplier: adoption('supplier'),
          metric: 'input-tokens',
          subject: 'request',
          measurement: { kind: 'exact', amount: String(tokens), method: adoption('method') },
          limit: String(inputBound(input.context)),
          constraint: { profile: input.profile, upstream: { kind: 'unknown' } },
        },
      ],
      counting: [basis],
    } as const
    const budget: RequestBudget =
      first === undefined
        ? { ...common, kind: 'complete' }
        : { ...common, kind: 'deferred-media', references: [first, ...rest] }
    return succeed(budget)
  })
}

export type CountingPreparation = ModelRequestPreparation<Principal> &
  Readonly<{ prepared(): number }>

/**
 * A preparation that fixes the request from the assembled input and prepares the transport for
 * it. It counts how often it is asked. It measures nothing and refuses no input for its size: the
 * context has already judged the size, and the send decides nothing from it. The transport is only
 * prepared: nothing is materialized and nothing is sent.
 */
export function createPreparation(transport: ModelTransport): CountingPreparation {
  let asked = 0
  return {
    prepared: () => asked,
    async prepare({ profile: chosen, assembled }) {
      asked += 1
      const [first, ...rest] = chosen.definition.suppliers
      const supplierOf = ({ replay: _replay, ...item }: typeof first): Supplier => ({
        ...item,
        credential: { kind: 'factory' },
      })
      const declarations: ReplayDeclaration[] = []
      for (const [index, item] of chosen.definition.suppliers.entries()) {
        const declaration = judgeReplayDeclaration(item, index)
        if (!('ok' in declaration)) return declaration
        declarations.push(declaration.ok)
      }
      const [declared, ...more] = declarations
      if (declared === undefined) throw new Error('a profile has at least one supplier')
      const request: FixedModelRequest = {
        profile: chosen.adoption,
        suppliers: [supplierOf(first), ...rest.map(supplierOf)],
        fallback: chosen.definition.fallback,
        retryPolicy: chosen.definition.retryPolicy,
        parameters: assembled.parameters,
        system: assembled.system,
        messages: assembled.messages,
        tools: assembled.tools,
        toolChoice: assembled.toolChoice,
        ...(assembled.replay === 'off' && { replay: 'off' }),
        declarations: [declared, ...more],
        representation: assembled.representation,
        parameterAdoptions: [],
        source: assembled.source,
      }
      const prepared = await transport.prepare(request, request.suppliers[0], { resent: [] })
      if (!('ok' in prepared)) return prepared
      await prepared.ok.close()
      return succeed(request)
    },
  }
}

export type SentCall = Readonly<{ call: ModelCallId; request: FixedModelRequest }>

/** What the context sends a request through: the call surface, reduced to what the context asks. */
export interface Sender {
  send(input: SentCall): Promise<Termination>
}

export type ScriptedSender = Sender & Readonly<{ sent(): readonly SentCall[] }>

/** A sender that ends the first call with the first termination of the script, the next with the next. */
export function createSender(endings: readonly Termination[]): ScriptedSender {
  const sent: SentCall[] = []
  return {
    sent: () => sent,
    async send(input) {
      const ending = endings[sent.length]
      sent.push(input)
      if (ending === undefined) throw new Error('the script has no ending for this call')
      return ending
    },
  }
}

export function createConversion(): ModelMessageConversion<Principal> {
  return {
    async prepare({ original }) {
      if (original.kind === 'voice')
        return succeed<ConversionResult>({
          kind: 'converted',
          value: {
            original,
            derived: [textBlock(`${original.id}-text`, 'hello there')],
            transcript: 'hello there',
            converter: adoption('transcriber'),
          },
        })
      if ('ref' in original)
        return succeed<ConversionResult>({
          kind: 'deferred',
          original,
          source: evidence('deferred'),
        })
      return succeed<ConversionResult>({
        kind: 'unchanged',
        original,
        reason: original.kind === 'text' ? 'text' : 'no-converter',
      })
    },
  }
}
