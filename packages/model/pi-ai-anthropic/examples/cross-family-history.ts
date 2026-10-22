// One history across two families: OpenAI, Anthropic, OpenAI, Anthropic, four rounds through
// OpenRouter with the real shared transport.
//
// Before each round the example prints the replay projection of the request: which assistant
// messages carry their reasoning state and which leave it out, with the diagnostics. A state that
// another family produced cannot continue and is left out; a state of this model goes back. After
// each round the example folds the facts into the assistant message with `assembleStream`, with
// the replay scope of the profile (`produces`) and the replay format of the record, and appends it
// to the history. An independent execution leaves this to its caller.
//
// Expected: round 2 leaves out the state of round 1; round 3 carries round 1 and leaves out round 2;
// round 4 carries round 2 and leaves out rounds 1 and 3.
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
const ANTHROPIC_MODEL = 'anthropic/claude-sonnet-5'

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

const PARAMETERS: readonly Parameter[] = [
  { kind: 'reasoning-effort', value: 'low' },
  { kind: 'max-output-tokens', value: '2048' },
]

const ROUNDS: readonly Readonly<{ profile: ModelProfile; question: string }>[] = [
  {
    profile: profiles.openai,
    question: 'Pick a whole number from 1 to 9. Reply with the number only.',
  },
  { profile: profiles.anthropic, question: 'Add 3 to your number. Reply with the result only.' },
  { profile: profiles.openai, question: 'Double that result. Reply with the result only.' },
  { profile: profiles.anthropic, question: 'Subtract 1 from that. Reply with the result only.' },
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
      parameters: PARAMETERS,
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
