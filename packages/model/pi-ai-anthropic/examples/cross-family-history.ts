// One history across two families: OpenAI, Anthropic, OpenAI, Anthropic, four rounds through
// OpenRouter with the real shared transport. OpenAI runs at effort `high` and Anthropic at effort
// `low`; at these efforts both models usually return a reasoning state for a question that needs a
// little reasoning, but the upstream decides.
//
// Before each round the example prints the replay projection of the request: which assistant
// messages carry their reasoning state and which leave it out, with the diagnostics. A state that
// another family produced cannot continue and is left out; a state of this model goes back. After
// each round the example prints whether the reply carried a reasoning state, folds the facts into
// the assistant message with `assembleStream`, with the replay scope of the profile (`produces`)
// and the replay format of the record, and appends it to the history. An independent execution
// leaves this to its caller.
//
// Expected: a later round carries each earlier reply of its own family that has a state, and leaves
// out each earlier reply of the other family that has a state. When every reply has a state, round
// 2 leaves out round 1; round 3 carries round 1 and leaves out round 2; round 4 carries round 2 and
// leaves out rounds 1 and 3.
//
// Run from the package directory after building:
// node --experimental-strip-types examples/cross-family-history.ts
// HTTPS_PROXY must point to the proxy that adds the OpenRouter credential.
import { projectReplay, type ModelProfile, type Parameter } from '@omne-harness/model-contract'
import {
  anthropicTokenizerResources,
  createAnthropicFamily,
  officialAnthropicProfiles,
} from '@omne-harness/pi-ai-anthropic'
import {
  createOpenAiFamily,
  officialOpenAiProfiles,
  openAiTokenizerResources,
} from '@omne-harness/pi-ai-openai'
import { replayFormatsOf } from '@omne-harness/pi-ai-transport'
import {
  assembleReply,
  closeTransport,
  declarationOf,
  executeOnce,
  exampleAdoption,
  fixRequest,
  openTransport,
  profileOf,
  RETRY_POLICY,
} from './support.ts'

/** Two reasoning models, one of each family. */
const OPENAI_MODEL = 'openai/gpt-5.6-luna'
const ANTHROPIC_MODEL = 'anthropic/claude-opus-5.5'

const SHOWN = { toHuman: true, toModel: true }
const LIMITS = {
  toolArguments: {
    maxBytes: 65_536,
    maxDepth: 32,
    maxItems: 1_024,
    maxMembers: 256,
    maxStringLength: 65_536,
    maxNumberLength: 64,
  },
  maxReasoningText: 1_048_576,
}
const margin = { percent: '10', source: exampleAdoption('margin-policy') }

const openai = createOpenAiFamily({ tokenizer: openAiTokenizerResources(), limits: LIMITS, margin })
const anthropic = createAnthropicFamily({
  tokenizer: anthropicTokenizerResources(),
  limits: LIMITS,
  margin,
})
const families = [openai, anthropic]
const official = { retryPolicy: RETRY_POLICY, compactionTriggerPercent: '80' }
const profiles = {
  openai: profileOf(officialOpenAiProfiles(official), OPENAI_MODEL),
  anthropic: profileOf(officialAnthropicProfiles(official), ANTHROPIC_MODEL),
}

/** The parameters of a round: a family effort and a bounded output. */
function parametersAt(effort: 'low' | 'high'): readonly Parameter[] {
  return [
    { kind: 'reasoning-effort', value: effort },
    { kind: 'max-output-tokens', value: '2048' },
  ]
}
const OPENAI_PARAMETERS = parametersAt('high')
const ANTHROPIC_PARAMETERS = parametersAt('low')

/** Each question needs a little reasoning, so that the reply is likely to carry a state. */
const ROUNDS: readonly Readonly<{
  profile: ModelProfile
  parameters: readonly Parameter[]
  question: string
}>[] = [
  {
    profile: profiles.openai,
    parameters: OPENAI_PARAMETERS,
    question:
      'A shop sells 3 pens for 2 dollars. How many pens can you buy with 14 dollars? Reply with the number only.',
  },
  {
    profile: profiles.anthropic,
    parameters: ANTHROPIC_PARAMETERS,
    question:
      'Multiply your number by 4 and subtract 17. Is the result a prime number? Reply with the result, then yes or no.',
  },
  {
    profile: profiles.openai,
    parameters: OPENAI_PARAMETERS,
    question: 'Write that result in base 5. Reply with the digits only.',
  },
  {
    profile: profiles.anthropic,
    parameters: ANTHROPIC_PARAMETERS,
    question:
      'Read those digits as a base 10 number. What is the sum of its distinct prime factors? Reply with the sum only.',
  },
]

/** The history as plain JSON values; the contract judges it again in every round. */
const history: unknown[] = []
/** The round that produced each assistant message, by message id. */
const producedIn = new Map<string, number>()

const open = openTransport(families)
try {
  for (const [at, round] of ROUNDS.entries()) {
    const number = at + 1
    const model = round.profile.definition.suppliers[0].model
    console.log(`\nround ${number}: ${model}`)
    history.push({
      id: `msg_example-user-question-${number}`,
      role: 'user',
      blocks: [{ kind: 'text', id: 'b1', visibility: SHOWN, text: round.question }],
    })
    const request = await fixRequest(families, round.profile, {
      system: [],
      messages: history,
      tools: [],
      toolChoice: 'auto',
      parameters: round.parameters,
    })

    const formats = replayFormatsOf(families, request.suppliers[0].adoption)
    if (formats === null) throw new Error(`no replay formats for ${model}`)
    const projection = projectReplay({
      messages: request.messages,
      declaration: request.declarations[0],
      formats: new Set(formats.accepts),
      off: false,
      resent: new Set(),
    })
    const carried: number[] = []
    const omitted: number[] = []
    for (const treatment of projection.treatments) {
      const from = producedIn.get(treatment.message) ?? 0
      if (treatment.continuable) {
        console.log(`replay: round ${from} carries parts [${treatment.carry.join(', ')}]`)
        if (treatment.carry.length > 0) carried.push(from)
      } else {
        console.log(
          `replay: round ${from} leaves out parts [${treatment.omit.join(', ')}], thinking ${treatment.thinking}`,
        )
        if (treatment.omit.length > 0) omitted.push(from)
      }
    }
    for (const diagnostic of projection.diagnostics)
      console.log(
        `replay diagnostic: round ${producedIn.get(diagnostic.message) ?? 0} scope ${diagnostic.scope} format ${diagnostic.format} omitted ${diagnostic.omittedParts}`,
      )
    console.log(`replay summary: carried [${carried.join(', ')}] omitted [${omitted.join(', ')}]`)

    const result = await executeOnce(open, request)
    if (!result.completed) break
    // The live test derives the expected replay summaries of the later rounds from these lines.
    console.log(`reply state: round ${number} ${result.states > 0 ? 'yes' : 'no'}`)
    const id = `msg_example-assistant-round-${number}`
    const reply = assembleReply(id, result.facts, {
      scope: declarationOf(round.profile).produces,
      format: formats.produces,
    })
    producedIn.set(id, number)
    history.push(JSON.parse(JSON.stringify(reply)))
  }
} finally {
  await closeTransport(open)
}
